import { SetupAuthError } from "../../../utils/error.js"
import { sleep, waitForIamPropagation } from "../../../utils/sleep.js"
import { superJoin } from "../../../utils/string.js"
import { ProjectsClient } from "@google-cloud/resource-manager"
import { ServiceUsageClient } from "@google-cloud/service-usage"
import { backOff } from "exponential-backoff"
import { GoogleAuth as GaxGoogleAuth } from "google-gax"
import { GcpAuthenticatedIdentity } from "../creds/identity.js"
import { GcpProjectManager } from "../project/index.js"
import { BACKOFF_OPTIONS, BaseGcpIamManager, IamPolicy } from "./base-iam.js"
import {
  PROJECT_PERMISSIONS,
  PROJECT_ROLES,
  ProjectPermission,
  ProjectRole,
  PUBLIC_SERVICES,
  REQUIRED_SERVICES,
} from "./constants.js"

/**
 * Manages GCP project-level IAM operations
 */
export class GcpProjectIamManager extends BaseGcpIamManager {
  private projectsClient: ProjectsClient | undefined
  private serviceUsageClient: ServiceUsageClient | undefined
  private authClient: GaxGoogleAuth | undefined
  private projectId: string
  private readonly projectManager: GcpProjectManager

  constructor(
    identity: GcpAuthenticatedIdentity,
    organizationId: string,
    projectId: string
  ) {
    super(identity)
    this.projectId = projectId
    this.projectManager = new GcpProjectManager(identity, organizationId)
  }

  /**
   * Initialize specific implementation for project manager
   */
  protected async initializeSpecific(): Promise<void> {
    await super.initialize()

    this.authClient = await this.identity.getGaxAuthClient()
    this.projectsClient = new ProjectsClient({
      auth: this.authClient,
    })
    this.serviceUsageClient = new ServiceUsageClient({
      auth: this.authClient,
    })

    await this.projectManager.initialize()
  }

  /**
   * Format a resource name according to GCP service requirements
   */
  protected formatResourceName(projectId: string): string {
    return `projects/${projectId}`
  }

  /**
   * Check if all required permissions are present
   */
  async checkPermissions(): Promise<{
    missingPermissions: ProjectPermission[]
  }> {
    await this.initialize()

    if (!this.projectsClient) {
      throw new SetupAuthError("ProjectsClient not initialized")
    }

    console.log("Checking project-level permissions...")

    try {
      // Test permissions directly without checking project existence
      const [response] = await this.projectsClient.testIamPermissions({
        resource: this.formatResourceName(this.projectId),
        permissions: Object.values(PROJECT_PERMISSIONS),
      })

      const grantedPermissions = new Set(response.permissions || [])
      const missingPermissions = Object.values(PROJECT_PERMISSIONS).filter(
        permission => !grantedPermissions.has(permission)
      ) as ProjectPermission[]

      return { missingPermissions }
    } catch (error) {
      throw new SetupAuthError(
        "Failed to test project IAM permissions. Cannot verify current state.",
        { cause: error }
      )
    }
  }

  /**
   * Get the project's IAM policy
   */
  async getIamPolicy(): Promise<IamPolicy> {
    await this.initialize()

    if (!this.projectsClient) {
      throw new SetupAuthError("ProjectsClient not initialized")
    }

    const [policy] = await this.projectsClient.getIamPolicy({
      resource: this.formatResourceName(this.projectId),
      options: { requestedPolicyVersion: 3 },
    })

    if (!policy) {
      throw new SetupAuthError("Could not get project IAM policy")
    }

    // Explicitly handle potential types of policy.etag from SDK
    let base64Etag: string | undefined = undefined
    if (policy.etag) {
      if (typeof policy.etag === "string") {
        // If SDK gives a string, assume it's base64 already (or handle if it's not)
        base64Etag = policy.etag
        console.warn("Received etag as string from SDK, assuming base64.")
      } else if (Buffer.isBuffer(policy.etag)) {
        // If it's a Buffer, convert to base64 string
        base64Etag = policy.etag.toString("base64")
      } else if (policy.etag instanceof Uint8Array) {
        // If it's a Uint8Array, convert to Buffer then base64 string
        base64Etag = Buffer.from(policy.etag).toString("base64")
      } else {
        // Log unexpected types
        console.warn(
          "Unrecognized etag type received from SDK:",
          typeof policy.etag,
          policy.etag
        )
      }
    }

    return {
      version: policy.version ?? 3,
      bindings:
        policy.bindings?.map(binding => ({
          role: binding.role || "",
          members: binding.members || [],
        })) || [],
      etag: base64Etag, // Ensure this is string | undefined
    }
  }

  /**
   * Set the project's IAM policy
   */
  async setIamPolicy(policy: IamPolicy): Promise<void> {
    await this.initialize()

    if (!this.projectsClient) {
      throw new SetupAuthError("ProjectsClient not initialized")
    }

    // Convert base64 string etag back to Buffer for the SDK call
    // Since getIamPolicy now guarantees policy.etag is string | undefined, this should be safe
    const etagBytes = policy.etag
      ? Buffer.from(policy.etag, "base64")
      : undefined

    // Construct the policy object expected by the SDK
    const sdkPolicy = {
      version: policy.version,
      bindings: policy.bindings,
      etag: etagBytes,
    }

    // --- DEBUGGING LOG ---
    console.log(
      "--- DEBUG: Policy object being sent to setIamPolicy (SDK format) ---"
    )
    console.log(
      JSON.stringify(
        { ...sdkPolicy, etag: policy.etag ? "<etag provided>" : "<no etag>" },
        null,
        2
      )
    )
    console.log(
      "---------------------------------------------------------------------"
    )
    // --- END DEBUGGING LOG ---

    try {
      if (sdkPolicy.etag && !sdkPolicy.version) {
        console.warn(
          "Policy etag provided but version is missing, defaulting to 3."
        )
        sdkPolicy.version = 3
      }

      await this.projectsClient.setIamPolicy({
        resource: this.formatResourceName(this.projectId),
        policy: sdkPolicy,
      })
    } catch (error) {
      console.error("--- DEBUG: Error during projectsClient.setIamPolicy ---")
      console.error(
        "Policy Sent (SDK format):",
        JSON.stringify(
          { ...sdkPolicy, etag: policy.etag ? "<etag provided>" : "<no etag>" },
          null,
          2
        )
      )
      console.error("Error Object:", error)
      console.error("------------------------------------------------------")
      throw new SetupAuthError(
        "Failed to set project IAM policy via SDK call",
        { cause: error }
      )
    }
  }

  /**
   * Add roles to the user in the project
   * @returns {Promise<boolean>} - True if the policy was modified, false otherwise.
   */
  async addRoles(userId: string, roles: ProjectRole[]): Promise<boolean> {
    const policy = await this.getIamPolicy()
    const member = `user:${userId}`
    if (!policy.bindings) {
      policy.bindings = []
    }
    let policyModified = false
    for (const role of roles) {
      const existingBinding = policy.bindings.find(
        (b: { role: string }) => b.role === role
      )
      if (existingBinding) {
        if (!existingBinding.members.includes(member)) {
          existingBinding.members.push(member)
          policyModified = true
        }
      } else {
        policy.bindings.push({
          role,
          members: [member],
        })
        policyModified = true
      }
    }
    if (policyModified) {
      console.log(
        `Policy modified, calling setIamPolicy for roles: ${superJoin(roles)}`
      )
      await this.setIamPolicy(policy)
      return true // Indicate modification
    } else {
      console.log(
        `Policy already contains user ${userId} for roles: ${superJoin(roles)}. Skipping setIamPolicy.`
      )
      return false // Indicate no modification
    }
  }

  /**
   * Check if required services are enabled
   */
  async checkServicesEnabled(): Promise<boolean> {
    await this.initialize()

    if (!this.serviceUsageClient) {
      throw new SetupAuthError("ServiceUsageClient not initialized")
    }

    try {
      const [services] = await this.serviceUsageClient.listServices({
        parent: this.formatResourceName(this.projectId),
        filter: "state:ENABLED",
      })

      const enabledServices = new Set(
        services.map(service => service.name?.split("/").pop() || "")
      )

      // Add public services that are always enabled
      for (const publicService of PUBLIC_SERVICES) {
        enabledServices.add(publicService)
      }

      return Object.values(REQUIRED_SERVICES).every(service =>
        enabledServices.has(service)
      )
    } catch (error) {
      console.warn("Failed to check service status:", error)
      return false
    }
  }

  /**
   * Enable required services
   */
  async enableRequiredServices(): Promise<void> {
    await this.initialize()

    if (!this.serviceUsageClient) {
      throw new SetupAuthError("ServiceUsageClient not initialized")
    }

    const requiredServices = Object.values(REQUIRED_SERVICES)
    for (const service of requiredServices) {
      // Skip enabling public services as they are always enabled
      if (
        PUBLIC_SERVICES.includes(service as typeof REQUIRED_SERVICES.OAUTH2)
      ) {
        continue
      }

      try {
        console.log(`Enabling service: ${service}`)
        await backOff(
          () =>
            this.serviceUsageClient!.enableService({
              name:
                this.formatResourceName(this.projectId) +
                "/services/" +
                service,
            }),
          BACKOFF_OPTIONS
        )
        await sleep(1000) // Wait a bit between enabling services
      } catch (error) {
        // If the service is already enabled, that's fine
        if (
          error instanceof Error &&
          error.message.includes("already enabled")
        ) {
          console.log(`Service ${service} is already enabled`)
          continue
        }
        // Log more details for other errors
        console.error(
          `Failed to enable service '${service}'. Full Error Object:`
        )
        console.error(error) // Log the full error object

        // Extract common properties if they exist for the SetupAuthError message
        let code: number | string | undefined
        let details: string | undefined
        let message: string | undefined
        if (error && typeof error === "object") {
          if ("code" in error) code = error.code as number | string
          if ("details" in error) details = error.details as string
          if ("message" in error) message = error.message as string
        }

        // Re-throw other errors (like genuine PERMISSION_DENIED for service usage)
        throw new SetupAuthError(
          `Failed to enable service '${service}'. Code: ${code || "N/A"}, Details: ${details || "N/A"}. Message: ${message || String(error)}`,
          { cause: error }
        )
      }
    }
  }

  /**
   * Attempt to grant all necessary project permissions and enable required services
   */
  async ensurePermissions(): Promise<void> {
    await this.initialize()

    const projectExists = await this.projectManager.projectExists(
      this.projectId
    )
    if (!projectExists) {
      throw new SetupAuthError(
        `Project ${this.projectId} does not exist. Cannot grant permissions on non-existent project.`
      )
    }

    // --- Refined Permission Check and Grant Logic ---

    let checkAttempt = 1
    const maxCheckAttempts = 3 // Try a few times in case of propagation races
    let requiredPermissionsGranted = false

    while (checkAttempt <= maxCheckAttempts && !requiredPermissionsGranted) {
      console.log(
        `Permission Check Attempt ${checkAttempt}/${maxCheckAttempts}...`
      )
      const { missingPermissions } = await this.checkPermissions()

      if (missingPermissions.length === 0) {
        console.log(
          "All required project permissions appear to be present based on initial check."
        )
        requiredPermissionsGranted = true
        break // Exit loop, permissions seem good
      }

      console.log(
        `Missing project permissions: ${missingPermissions.join(", ")}`
      )

      // Use imported constants with UPPER_SNAKE_CASE keys
      const rolesToEnsure: ProjectRole[] = [
        PROJECT_ROLES.OWNER,
        PROJECT_ROLES.SERVICE_USAGE_ADMIN,
      ]
      console.log(
        `Attempting to ensure required roles: ${superJoin(rolesToEnsure)}`
      )
      try {
        await this.addRoles(this.userEmail!, rolesToEnsure)
        // Wait for IAM propagation: retry checkPermissions until all required permissions are present
        await waitForIamPropagation(
          async () => {
            const { missingPermissions: afterGrant } =
              await this.checkPermissions()
            return afterGrant.length === 0
          },
          {
            timeoutMs: 30000,
            intervalMs: 2000,
            description: "project IAM propagation (role assignment)",
          }
        )
        requiredPermissionsGranted = true
        // No need to break; loop will exit naturally
      } catch (error) {
        console.error(
          `Failed to add/ensure roles (${superJoin(rolesToEnsure)}):`,
          error
        )
        throw new SetupAuthError(
          `Failed to grant necessary project roles. Please check organization-level permissions allowing role assignments.`,
          {
            cause: error,
          }
        )
      }
      checkAttempt++
    }

    // Final verification check after potential role grants
    const { missingPermissions: finalMissing } = await this.checkPermissions()
    if (finalMissing.length > 0) {
      console.error(
        "Final permission check failed. Missing permissions:",
        finalMissing
      )
      throw new SetupAuthError(
        `Could not ensure all required project permissions (${finalMissing.join(", ")}) even after attempting specific role grants. ` +
          "Verify the executing user has sufficient permissions at the Organization level (e.g., roles/resourcemanager.projectIamAdmin or similar) to grant project roles.",
        {
          cause:
            finalMissing.length > 0
              ? new Error(finalMissing.join(", "))
              : undefined,
        }
      )
    } else {
      console.log(
        "Successfully verified all required project permissions are present based on testIamPermissions."
      )
    }

    // --- End Permission Grant Logic (Initial Check) ---

    // --- Proactive Role Grant before Enabling Services ---
    const rolesToEnsureEnablement: ProjectRole[] = [
      PROJECT_ROLES.OWNER,
      PROJECT_ROLES.SERVICE_USAGE_ADMIN,
    ]
    console.log(
      `Proactively attempting to ensure roles for service enablement: ${superJoin(rolesToEnsureEnablement)}`
    )
    try {
      const rolesWereAdded = await this.addRoles(
        this.userEmail!,
        rolesToEnsureEnablement
      )
      if (rolesWereAdded) {
        // Wait for IAM propagation: retry checkPermissions until all required permissions are present
        await waitForIamPropagation(
          async () => {
            const { missingPermissions: afterGrant } =
              await this.checkPermissions()
            return afterGrant.length === 0
          },
          {
            timeoutMs: 30000,
            intervalMs: 2000,
            description: "project IAM propagation (proactive role grant)",
          }
        )
        console.log(
          "All required project permissions granted after proactive role assignment."
        )
      } else {
        console.log("Skipping wait as roles were already present.")
      }
    } catch (error) {
      console.error(
        `Failed to proactively grant roles (${superJoin(rolesToEnsureEnablement)}) needed for service enablement:`,
        error
      )
      throw new SetupAuthError(
        `Failed to proactively grant necessary roles ('${superJoin(rolesToEnsureEnablement)}') required for enabling services. ` +
          "Please check organization-level permissions allowing role assignments.",
        { cause: error }
      )
    }
    // --- End Proactive Role Grant ---

    // Check and enable required services
    const servicesEnabled = await this.checkServicesEnabled()
    if (!servicesEnabled) {
      console.log("Enabling required services...")
      await this.enableRequiredServices()
    } else {
      console.log("All required services are already enabled.")
    }
  }
}

interface TableRow {
  [key: string]: string | boolean | number | null | undefined
}

export function displayTable(data: TableRow[]): void {
  if (data.length === 0) {
    console.log("No data to display")
    return
  }

  // Get column names from the first row
  const columns = Object.keys(data[0])

  // Calculate column widths
  const columnWidths = columns.map(col => {
    const maxWidth = Math.max(
      col.length,
      ...data.map(row => String(row[col] ?? "").length)
    )
    return maxWidth + 2 // Add padding
  })

  // Create separator line
  const separator = columnWidths.map(width => "-".repeat(width)).join("-+-")

  // Print header
  console.log(columns.map((col, i) => col.padEnd(columnWidths[i])).join(" | "))
  console.log(separator)

  // Print rows
  data.forEach(row => {
    console.log(
      columns
        .map((col, i) => String(row[col] ?? "").padEnd(columnWidths[i]))
        .join(" | ")
    )
  })
}
