import {
  GcpAuthenticatedIdentity,
  GcpIdentityFactory,
} from "../../../providers/gcp/creds/identity.js"
import {
  GLOBAL_PERMISSIONS,
  ORGANIZATION_PERMISSIONS,
  PROJECT_PERMISSIONS,
} from "../../../providers/gcp/iam/constants.js"
import { GcpGlobalIamManager } from "../../../providers/gcp/iam/global-iam.js"
import { GcpOrganizationIamManager } from "../../../providers/gcp/iam/organization-iam.js"
import { GcpProjectIamManager } from "../../../providers/gcp/iam/project-iam.js"
import { GcpOrganizationManager } from "../../../providers/gcp/organization.js"
import { GcpProjectManager } from "../../../providers/gcp/project/index.js"
import {
  enforceUserDomainOrFail,
  getAdcEmailOrNull,
  printGcloudAndAdcAccounts,
} from "../../../utils/env-handler.js"
import { SetupAuthError } from "../../../utils/error.js"
import { superJoin } from "../../../utils/string.js"
import { Command } from "commander"

interface OAuthClientTableRow {
  "#": number
  "Project ID": string
  Status: string
  "Client ID": string
  "Display Name": string
  "Redirect URIs": string
  "JavaScript Origins": string
  [key: string]: string | number
}

interface PermissionCheckRow {
  Level: string
  Scope: string
  Permission: string
  Status: string
}

interface MissingPermissions {
  global: string[]
  organization: string[]
  project: string[]
}

/**
 * Display data in a table format
 *
 * TODO: Move this to a utility function in utils/table.ts
 *
 * TODO: The computed column width does not work properly when theres's a '❌' or '✅' symbol in the data.
 */
function displayTable(
  data: PermissionCheckRow[] | OAuthClientTableRow[]
): void {
  if (data.length === 0) {
    console.log("No data to display")
    return
  }
  console.table(data)
}

/**
 * GCP Organization Viewer, displays organization details and projects.
 * Also checks for required permissions and displays OAuth clients.
 *
 * TODO: Make something like this for the project viewer as well,
 *       so that the command `gcp view project` can be used to view
 *       project details and permissions. The organization viewer
 *       should then be able to call methods on the project viewer
 *       for each of its own projects so that we can avoid duplicating
 *       code.
 */
export class GcpOrganizationViewer {
  private organizationManager: GcpOrganizationManager
  private projectManager: GcpProjectManager
  private organizationIamManager: GcpOrganizationIamManager | undefined
  private globalIamManager: GcpGlobalIamManager | undefined
  private initialized = false
  private userEmail = ""
  private readonly identity: GcpAuthenticatedIdentity
  private readonly enableAutoGrant: boolean
  private readonly organizationId: string

  constructor(
    identity: GcpAuthenticatedIdentity,
    organizationId: string,
    enableAutoGrant: boolean = false
  ) {
    this.identity = identity
    this.organizationId = organizationId
    this.enableAutoGrant = enableAutoGrant

    // Attempt initial email fetch, but don't handle errors here
    // Let initialize() handle errors robustly
    this.identity
      .getCurrentUserEmail()
      .then(email => {
        if (email) {
          this.userEmail = email
        }
      })
      .catch(() => {
        // Ignore constructor fetch error, initialize will retry
      })

    this.organizationManager = new GcpOrganizationManager(
      identity,
      organizationId
    )
    this.projectManager = new GcpProjectManager(identity, organizationId)
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    if (!this.userEmail) {
      try {
        const email = await this.identity.getCurrentUserEmail()
        if (!email) {
          // This case should ideally be handled within getCurrentUserEmail itself
          throw new SetupAuthError(
            "User email could not be retrieved via identity method and was empty."
          )
        }
        this.userEmail = email
      } catch (error) {
        // Let the error propagate up to the command handler (_gcpView -> gcpView)
        // console.error("Failed to retrieve user email during initialization:", error);
        if (error instanceof SetupAuthError) throw error
        throw new SetupAuthError(
          "Failed to initialize GcpOrganizationViewer due to email retrieval failure",
          { cause: error }
        )
      }
    }

    await this.organizationManager.initialize()
    await this.projectManager.initialize()

    // Now that userEmail is known, create IAM managers if they weren't created yet
    if (!this.organizationIamManager) {
      this.organizationIamManager = new GcpOrganizationIamManager(
        this.identity,
        this.organizationId
      )
    }
    if (!this.globalIamManager) {
      this.globalIamManager = new GcpGlobalIamManager(this.identity)
    }

    await this.organizationIamManager.initialize()
    await this.globalIamManager.initialize()

    this.initialized = true
  }

  private async checkPermissions(
    retryCount: number = 0
  ): Promise<PermissionCheckRow[]> {
    const MAX_RETRIES = 3
    const permissionChecks: PermissionCheckRow[] = []
    let missingPermissions: { global: string[]; organization: string[] } = {
      global: [],
      organization: [],
    }
    let failureReasons: { global: string[]; organization: string[] } = {
      global: [],
      organization: [],
    }

    // Check global permissions
    try {
      const globalPermissionStatus =
        await this.globalIamManager!.checkPermissions()
      for (const permission of Object.values(GLOBAL_PERMISSIONS)) {
        const isMissing =
          globalPermissionStatus.missingPermissions.includes(permission)
        if (isMissing) {
          missingPermissions.global.push(permission)
        }
        permissionChecks.push({
          Level: "Global",
          Scope: "User",
          Permission: permission,
          Status: isMissing ? "❌ Missing" : "✅ Granted",
        })
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error"
      console.warn(`Failed to check global permissions: ${errorMessage}`)
      for (const permission of Object.values(GLOBAL_PERMISSIONS)) {
        missingPermissions.global.push(permission)
        permissionChecks.push({
          Level: "Global",
          Scope: "User",
          Permission: permission,
          Status: "❌ Missing",
        })
      }
    }

    // Check organization-specific permissions
    try {
      const orgPermissionStatus =
        await this.organizationIamManager!.checkPermissions()
      for (const permission of Object.values(ORGANIZATION_PERMISSIONS)) {
        const isMissing =
          orgPermissionStatus.missingPermissions.includes(permission)
        if (isMissing) {
          missingPermissions.organization.push(permission)
        }
        permissionChecks.push({
          Level: "Organization",
          Scope: this.organizationId,
          Permission: permission,
          Status: isMissing ? "❌ Missing" : "✅ Granted",
        })
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error"
      console.warn(`Failed to check organization permissions: ${errorMessage}`)
      for (const permission of Object.values(ORGANIZATION_PERMISSIONS)) {
        missingPermissions.organization.push(permission)
        permissionChecks.push({
          Level: "Organization",
          Scope: this.organizationId,
          Permission: permission,
          Status: "❌ Missing",
        })
      }
    }

    // If auto-grant is enabled, attempt to grant missing permissions
    if (
      this.enableAutoGrant &&
      (missingPermissions.global.length > 0 ||
        missingPermissions.organization.length > 0)
    ) {
      if (retryCount >= MAX_RETRIES) {
        const errorMessage =
          `Maximum retry attempts reached. The following permissions could not be granted:\n` +
          `- Global permissions: ${superJoin(missingPermissions.global)}\n` +
          `- Organization permissions: ${superJoin(missingPermissions.organization)}\n\n` +
          `Reasons:\n` +
          `- Global: ${superJoin(failureReasons.global)} \n` +
          `- Organization: ${superJoin(failureReasons.organization)} `
        throw new SetupAuthError(errorMessage)
      }

      console.log(
        `\nAttempting to grant missing permissions(attempt ${retryCount + 1} of ${MAX_RETRIES})...`
      )

      // Try to grant global permissions
      if (missingPermissions.global.length > 0) {
        try {
          console.log("Granting global permissions...")
          await this.globalIamManager!.ensurePermissions()
          // Recheck global permissions after granting
          const updatedGlobalStatus =
            await this.globalIamManager!.checkPermissions()
          missingPermissions.global = updatedGlobalStatus.missingPermissions
          if (missingPermissions.global.length === 0) {
            console.log("✅ Successfully granted all global permissions.")
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          console.warn(`Failed to grant global permissions: ${errorMessage} `)
          failureReasons.global.push(`Global permissions: ${errorMessage} `)
        }
      }

      // Try to grant organization permissions
      if (missingPermissions.organization.length > 0) {
        try {
          console.log("Granting organization permissions...")
          await this.organizationIamManager!.ensurePermissions()
          // Recheck organization permissions after granting
          const updatedOrgStatus =
            await this.organizationIamManager!.checkPermissions()
          missingPermissions.organization = updatedOrgStatus.missingPermissions
          if (missingPermissions.organization.length === 0) {
            console.log("✅ Successfully granted all organization permissions.")
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          console.warn(
            `Failed to grant organization permissions: ${errorMessage} `
          )
          failureReasons.organization.push(
            `Organization permissions: ${errorMessage} `
          )
        }
      }

      // If all permissions are granted, return the updated checks
      if (
        missingPermissions.global.length === 0 &&
        missingPermissions.organization.length === 0
      ) {
        return permissionChecks
      }

      // Otherwise, retry
      return this.checkPermissions(retryCount + 1)
    }

    return permissionChecks
  }

  /**
   * The main entry point for the organization viewer.
   *
   * TODO: Keep this method small and simple, it should call private methods
   *       that handle the actual logic in the most logical order. Also keep
   *       those private methods small and simple as well, better have many
   *       methods than a large method with many responsibilities.
   *
   * TODO: Move project-specific methods to the GcpProjectViewer in view-project.ts
   *       and call them from here for every given project.
   */
  async view(): Promise<void> {
    try {
      await this.initialize()

      // Display organization details
      console.log("\nOrganization Details:")
      const organization = await this.organizationManager.getOrganization()
      console.log(organization)

      // Check and display permissions first
      console.log("\nChecking Required Permissions:")
      const permissionChecks = await this.checkPermissions()
      displayTable(permissionChecks)

      // Check if any permissions are missing
      const missingPermissions = permissionChecks.filter(check =>
        check.Status.includes("❌")
      )
      if (missingPermissions.length > 0) {
        console.log(
          "\n⚠️  Missing required permissions. Please grant the following permissions:"
        )
        for (const { Permission, Level, Scope } of missingPermissions) {
          console.log(`- ${Level} permission: ${Permission} for ${Scope}`)
        }
        if (!this.enableAutoGrant) {
          console.log(
            "\nTip: Run this command with --enable to attempt to grant these permissions automatically."
          )
        }
        console.log(
          "\nUnable to proceed with project and OAuth client listing due to missing permissions."
        )
        return
      }

      // Only proceed with project listing if we have the necessary permissions
      console.log("\nProjects in Organization:")
      let projects: string[] = []
      try {
        projects = await this.projectManager.listProjects()
        if (projects.length === 0) {
          console.log("No projects found")
        } else {
          console.log(`Found ${projects.length} projects: `)
          projects.forEach((project, index) => {
            console.log(`${index + 1}. ${project} `)
          })
        }
      } catch (error) {
        if (error instanceof Error) {
          console.log("\n❌ Unable to list projects:", error.message)
        } else {
          console.log("\n❌ Unable to list projects: Unknown error")
        }
        console.log(
          "This requires the resourcemanager.projects.list permission."
        )
        console.log(
          "Please ensure you have the necessary permissions to list projects in this organization."
        )
        return
      }

      // Continue with OAuth client listing if we have projects
      // TODO: The following code for listing OAuth clients is broken after the IAP refactor.
      // It must be reimplemented using GcpOAuthWebClientManager per project.
      // for (const projectId of projects) {
      //     try {
      //         const oauthClient = new GcpOrganizationManager(this.identity, projectId)
      //         await oauthClient.initialize()
      //         const response = await oauthClient.getClientDetails()
      //         // ... handle response ...
      //     } catch (error) {
      //         // ... handle error ...
      //     }
      // }
    } catch (error) {
      if (error instanceof SetupAuthError) {
        throw error
      }
      throw new SetupAuthError(
        "An error occurred while viewing organization details",
        { cause: error }
      )
    }
  }

  // TODO: The following method is dead code after the IAP refactor and must be reimplemented.
  // See REFAC-NORMAL-OAUTH2-NOT-IAP.md for details.
  // private async listOAuthClients(projects: string[]): Promise<void> {
  //     console.log("\nOAuth Clients:")
  //     const oauthClients: OAuthClientTableRow[] = []
  //     let clientIndex = 1

  //     for (const projectId of projects) {
  //         try {
  //             const oauthClient = new GcpOrganizationManager(this.identity, projectId)
  //             await oauthClient.initialize()
  //             const response = await oauthClient.getClientDetails()

  //             if (response.exists && response.details) {
  //                 oauthClients.push({
  //                     "#": clientIndex++,
  //                     "Project ID": projectId,
  //                     Status: "Active",
  //                     "Client ID": response.details.clientId || "N/A",
  //                     "Display Name": response.details.displayName || "N/A",
  //                     "Redirect URIs": "(Not available via IAP API)",
  //                     "JavaScript Origins": "(Not available via IAP API)",
  //                 })
  //             } else {
  //                 oauthClients.push({
  //                     "#": clientIndex++,
  //                     "Project ID": projectId,
  //                     Status: "No IAP OAuth clients found",
  //                     "Client ID": "N/A",
  //                     "Display Name": "N/A",
  //                     "Redirect URIs": "N/A",
  //                     "JavaScript Origins": "N/A",
  //                 })
  //             }
  //         } catch (error) {
  //             oauthClients.push({
  //                 "#": clientIndex++,
  //                 "Project ID": projectId,
  //                 Status: error instanceof Error ? `Error: ${error.message} ` : "Unknown error",
  //                 "Client ID": "N/A",
  //                 "Display Name": "N/A",
  //                 "Redirect URIs": "N/A",
  //                 "JavaScript Origins": "N/A",
  //             })
  //         }
  //     }

  //     if (oauthClients.length === 0) {
  //         console.log("No IAP OAuth clients found or projects inaccessible.")
  //     } else {
  //         console.table(oauthClients)
  //     }
  // }
}

async function checkPermissions(
  identity: GcpAuthenticatedIdentity,
  organizationId: string,
  projectId?: string
): Promise<{
  tableData: PermissionCheckRow[]
  missingPermissions: MissingPermissions
}> {
  const tableData: PermissionCheckRow[] = []
  const missingPermissions: MissingPermissions = {
    global: [],
    organization: [],
    project: [],
  }

  // Global Permissions
  console.log("\nChecking Global Permissions...")
  const globalIamManager = new GcpGlobalIamManager(identity)
  await globalIamManager.initialize()
  const globalPermissionStatus = await globalIamManager.checkPermissions()
  for (const permission of Object.values(GLOBAL_PERMISSIONS)) {
    const isMissing =
      globalPermissionStatus.missingPermissions.includes(permission)
    if (isMissing) missingPermissions.global.push(permission)
    tableData.push({
      Level: "Global",
      Scope: "User",
      Permission: permission,
      Status: isMissing ? "❌ Missing" : "✅ Granted",
    })
  }

  // Organization Permissions
  console.log("\nChecking Organization Permissions...")
  const orgIamManager = new GcpOrganizationIamManager(identity, organizationId)
  await orgIamManager.initialize()
  const orgPermissionStatus = await orgIamManager.checkPermissions()
  for (const permission of Object.values(ORGANIZATION_PERMISSIONS)) {
    const isMissing =
      orgPermissionStatus.missingPermissions.includes(permission)
    if (isMissing) missingPermissions.organization.push(permission)
    tableData.push({
      Level: "Organization",
      Scope: organizationId,
      Permission: permission,
      Status: isMissing ? "❌ Missing" : "✅ Granted",
    })
  }

  // Project Permissions
  if (projectId) {
    console.log(`\nChecking Project Permissions for ${projectId}...`)
    const projectIamManager = new GcpProjectIamManager(
      identity,
      organizationId,
      projectId
    )
    await projectIamManager.initialize()
    const projectPermissionStatus = await projectIamManager.checkPermissions()
    for (const permission of Object.values(PROJECT_PERMISSIONS)) {
      const isMissing =
        projectPermissionStatus.missingPermissions.includes(permission)
      if (isMissing) missingPermissions.project.push(permission)
      tableData.push({
        Level: "Project",
        Scope: projectId,
        Permission: permission,
        Status: isMissing ? "❌ Missing" : "✅ Granted",
      })
    }
  }
  return { tableData, missingPermissions }
}

// Define the command and chain action directly
new Command("view-organization")
  .description(
    "View organization details, permissions, and OAuth configuration"
  )
  .option(
    "-o, --organization-id <id>",
    "GCP Organization ID (optional, uses env var GCP_ORGANIZATION_ID if not set)"
  )
  .option(
    "-p, --project-id <id>",
    "GCP Project ID (optional, checks project permissions if provided, uses env var GCP_PROJECT_ID if not set)"
  )
  .option(
    "--check-permissions",
    "Check required permissions for the current user",
    true
  )
  .option("--check-oauth", "Check OAuth brand and client configuration", true)
  .action(async options => {
    console.log("Starting view-organization command...")

    // Print both gcloud and ADC accounts for clarity
    await printGcloudAndAdcAccounts()

    // --- Fail-fast: Check ADC email domain matches EKG_ORG_PRIMARY_DOMAIN ---
    const expectedDomain = process.env.EKG_ORG_PRIMARY_DOMAIN
    const adcEmail = await getAdcEmailOrNull()
    if (!adcEmail) {
      throw new SetupAuthError(
        "Could not determine Application Default Credentials (ADC) email. Please run 'gcloud auth application-default login' and try again."
      )
    }
    const adcDomain = adcEmail.split("@")[1] || ""
    if (!expectedDomain) {
      throw new SetupAuthError(
        "Missing required environment variable: EKG_ORG_PRIMARY_DOMAIN. This tool enforces a fail-fast approach and requires this variable to be set in your .env.local (e.g., EKG_ORG_PRIMARY_DOMAIN=your-domain.com)."
      )
    }
    if (adcDomain.toLowerCase() !== expectedDomain.toLowerCase()) {
      throw new SetupAuthError(
        `Application Default Credentials (ADC) are for '${adcEmail}', which does not match the required organization domain (${expectedDomain}).\n` +
          `Please run 'gcloud auth application-default login' and select your <user>@${expectedDomain} account.`
      )
    }
    // --- End fail-fast ADC domain check ---

    // --- Identity Setup ---
    // Use GcpIdentityFactory if available, adjust as needed
    const identity = GcpIdentityFactory.createAdcIdentity()
    try {
      // await identity.validate(); // Assuming validate exists or add similar check
      const email = await identity.getCurrentUserEmail()
      enforceUserDomainOrFail(email)
      console.log(`Identity validated for ${email}.`)
    } catch (error) {
      console.error("Failed to validate identity:", error)
      process.exit(1)
    }

    const organizationId =
      options.organizationId || process.env.GCP_ORGANIZATION_ID
    const projectId = options.projectId || process.env.GCP_PROJECT_ID

    if (!organizationId) {
      console.error(
        "Organization ID must be provided via --organization-id or GCP_ORGANIZATION_ID env var."
      )
      process.exit(1)
    }

    // --- Permission Checking --- > Call the refactored function
    if (options.checkPermissions) {
      try {
        // Call the checkPermissions function here
        const { tableData, missingPermissions } = await checkPermissions(
          identity,
          organizationId,
          projectId
        )

        console.log("\n--- Permission Check Summary ---")
        displayTable(tableData)

        const totalMissing =
          missingPermissions.global.length +
          missingPermissions.organization.length +
          missingPermissions.project.length
        if (totalMissing > 0) {
          console.log("\n⚠️  Missing required permissions:")
          if (missingPermissions.global.length > 0)
            console.log("  Global:", missingPermissions.global.join(", "))
          if (missingPermissions.organization.length > 0)
            console.log(
              "  Organization:",
              missingPermissions.organization.join(", ")
            )
          if (missingPermissions.project.length > 0)
            console.log("  Project:", missingPermissions.project.join(", "))
        } else {
          console.log("\n✅ All checked permissions appear to be granted.")
        }
      } catch (error) {
        console.error(
          "\n❌ Error checking permissions:",
          error instanceof Error ? error.message : error
        )
      }
    }

    // --- OAuth Checking ---
    if (options.checkOauth && projectId) {
      console.log(`\nChecking OAuth configuration for project ${projectId}...`)
      try {
        const viewer = new GcpOrganizationViewer(identity, organizationId) // Instantiate viewer class
        await viewer.initialize() // Initialize it
        // Assuming listOAuthClients is a method on GcpOrganizationViewer or accessible
        // This part might need adjustment based on where listOAuthClients actually lives
        // If listOAuthClients is standalone, call it directly.
        // await viewer.listOAuthClients([projectId]); // Example if it's a method
        // TODO: The following standalone function is dead code after the IAP refactor and must be reimplemented.
        // See REFAC-NORMAL-OAUTH2-NOT-IAP.md for details.
        // await listOAuthClients(identity, [projectId]) // Assuming it can be standalone
      } catch (error) {
        console.error(
          "\n❌ Error checking OAuth configuration:",
          error instanceof Error ? error.message : error
        )
      }
    }
    console.log("\nView command finished.")
  })

// TODO: The following standalone function is dead code after the IAP refactor and must be reimplemented.
// See REFAC-NORMAL-OAUTH2-NOT-IAP.md for details.
// async function listOAuthClients(identity: GcpAuthenticatedIdentity, projects: string[]): Promise<void> {
//     console.log("\nOAuth Clients:")
//     const oauthClients: OAuthClientTableRow[] = []
//     let clientIndex = 1

//     for (const projectId of projects) {
//         try {
//             const oauthClient = new GcpOrganizationManager(
//                 identity,
//                 // projectId,
//                 "",
//                 undefined,
//                 undefined
//             )
//             await oauthClient.initialize()
//             const response = await oauthClient.getClientDetails()

//             if (response.exists && response.details) {
//                 oauthClients.push({
//                     "#": clientIndex++,
//                     "Project ID": projectId,
//                     Status: "Active",
//                     "Client ID": response.details.clientId || "N/A",
//                     "Display Name": response.details.displayName || "N/A",
//                     "Redirect URIs": "(Not available via IAP API)",
//                     "JavaScript Origins": "(Not available via IAP API)",
//                 })
//             } else {
//                 oauthClients.push({
//                     "#": clientIndex++,
//                     "Project ID": projectId,
//                     Status: "No IAP OAuth clients found",
//                     "Client ID": "N/A",
//                     "Display Name": "N/A",
//                     "Redirect URIs": "N/A",
//                     "JavaScript Origins": "N/A",
//                 })
//             }
//         } catch (error) {
//             let status = `Error: ${error instanceof Error ? error.message : "Unknown error"}`
//             try {
//                 const serviceUsageClient = new ServiceUsageClient({ auth: await identity.getGaxAuthClient() })
//                 const [service] = await serviceUsageClient.getService({ name: `projects/${projectId}/services/oauth2.googleapis.com` })
//                 if (service.state !== "ENABLED") {
//                     status = "OAuth2 API not enabled"
//                 }
//                 // eslint-disable-next-line @typescript-eslint/no-unused-vars
//             } catch (_serviceError) {
//                 // Add underscore and disable comment
//                 // Ignore error checking service status, stick with original error
//             }
//             oauthClients.push({
//                 "#": clientIndex++,
//                 "Project ID": projectId,
//                 Status: status,
//                 "Client ID": "N/A",
//                 "Display Name": "N/A",
//                 "Redirect URIs": "N/A",
//                 "JavaScript Origins": "N/A",
//             })
//         }
//     }

//     if (oauthClients.length === 0) {
//         console.log("No IAP OAuth clients found or projects inaccessible.")
//     } else {
//         console.table(oauthClients)
//     }
// }
