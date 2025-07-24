import { SetupAuthError } from "../../../utils/error.js"
import { superJoin } from "../../../utils/string.js"
import { OrganizationsClient } from "@google-cloud/resource-manager"
import { backOff } from "exponential-backoff"
import { GcpAuthenticatedIdentity } from "../creds/identity.js"
import { BACKOFF_OPTIONS, BaseGcpIamManager, IamPolicy } from "./base-iam.js"
// Import constants from central file
import {
  ORGANIZATION_PERMISSIONS,
  ORGANIZATION_ROLES,
  OrganizationPermission,
  OrganizationRole,
} from "./constants.js"

// Remove old constant definitions
// export const ORGANIZATION_ROLES = { ... };
// export const ORGANIZATION_PERMISSIONS = { ... };
// type OrganizationRole = ...;
// type OrganizationPermission = ...;

/**
 * Manages GCP organization-level IAM operations
 */
export class GcpOrganizationIamManager extends BaseGcpIamManager {
  private organizationsClient: OrganizationsClient | undefined
  private organizationId: string

  constructor(
    identity: GcpAuthenticatedIdentity,
    organizationId: string,
    client?: OrganizationsClient
  ) {
    super(identity)
    this.organizationId = organizationId
    this.organizationsClient = client
  }

  protected async initializeSpecific(): Promise<void> {
    if (!this.organizationsClient) {
      console.log("IAM Manager initializing its own OrganizationsClient...")
      this.organizationsClient = new OrganizationsClient({
        auth: await this.identity.getGaxAuthClient(),
      })
    }
  }

  public setClient(client: OrganizationsClient): void {
    this.organizationsClient = client
  }

  protected formatResourceName(organizationId: string): string {
    return `organizations/${organizationId}`
  }

  private async testPermissions(permissions: string[]): Promise<Set<string>> {
    await this.initialize()
    if (!this.organizationsClient) {
      throw new SetupAuthError("OrganizationsClient not initialized")
    }
    try {
      const resource = this.formatResourceName(this.organizationId)
      console.log(`Testing organization permissions on: ${resource}`)
      console.log(`Permissions being tested: ${superJoin(permissions)}\n`)
      const [response] = await backOff(
        () =>
          this.organizationsClient!.testIamPermissions({
            resource,
            permissions,
          }),
        BACKOFF_OPTIONS
      )
      const grantedPermissions = new Set(response.permissions || [])
      console.log(
        `Granted organization permissions found: ${superJoin(Array.from(grantedPermissions))}\n`
      )
      return grantedPermissions
    } catch (error) {
      console.error(
        `Error testing organization permissions on ${this.formatResourceName(this.organizationId)}:`,
        error
      )
      throw new SetupAuthError(
        `Failed to test permissions for organization ${this.organizationId}.`,
        { cause: error instanceof Error ? error : new Error(String(error)) }
      )
    }
  }

  async getIamPolicy(): Promise<IamPolicy> {
    await this.initialize()
    if (!this.organizationsClient) {
      throw new SetupAuthError("OrganizationsClient not initialized")
    }
    const [policy] = await backOff(
      () =>
        this.organizationsClient!.getIamPolicy({
          resource: this.formatResourceName(this.organizationId),
        }),
      BACKOFF_OPTIONS
    )
    if (!policy) {
      throw new SetupAuthError("Could not get organization IAM policy")
    }
    return {
      version: policy.version ?? undefined,
      bindings:
        policy.bindings?.map(binding => ({
          role: binding.role || "",
          members: binding.members || [],
        })) || [],
      etag: policy.etag?.toString() || undefined,
    }
  }

  async setIamPolicy(policy: IamPolicy): Promise<void> {
    await this.initialize()
    if (!this.organizationsClient) {
      throw new SetupAuthError("OrganizationsClient not initialized")
    }
    await backOff(
      () =>
        this.organizationsClient!.setIamPolicy({
          resource: this.formatResourceName(this.organizationId),
          policy,
        }),
      BACKOFF_OPTIONS
    )
  }

  async addRoles(userId: string, roles: OrganizationRole[]): Promise<void> {
    const policy = await this.getIamPolicy()
    const member = `user:${userId}`
    if (!policy.bindings) {
      policy.bindings = []
    }
    for (const role of roles) {
      const existingBinding = policy.bindings.find(
        (b: { role: string }) => b.role === role
      )
      if (existingBinding) {
        if (!existingBinding.members.includes(member)) {
          existingBinding.members.push(member)
        }
      } else {
        policy.bindings.push({
          role,
          members: [member],
        })
      }
    }
    await this.setIamPolicy(policy)
  }

  async checkPermissions(): Promise<{
    missingPermissions: OrganizationPermission[]
  }> {
    await this.initialize()
    // Use imported constant
    const requiredPermissions = Object.values(ORGANIZATION_PERMISSIONS)
    console.log(
      `Checking organization-specific permissions for user ${this.userEmail!}...`
    )

    try {
      const grantedPermissions = await this.testPermissions(requiredPermissions)
      const missingPermissions = requiredPermissions.filter(
        permission => !grantedPermissions.has(permission)
      ) as OrganizationPermission[]

      if (missingPermissions.length > 0) {
        console.warn(
          `Missing organization permissions for ${this.userEmail!}: ${missingPermissions.join(", ")}`
        )
      } else {
        console.log(
          `User ${this.userEmail!} has all required organization permissions.`
        )
      }

      return { missingPermissions }
    } catch (error) {
      console.error(
        `Error during organization permission check for ${this.userEmail!}:`,
        error
      )
      if (error instanceof SetupAuthError) throw error
      throw new SetupAuthError(
        `Failed to check permissions for organization ${this.organizationId}.`,
        { cause: error }
      )
    }
  }

  /**
   * Attempt to grant all necessary organization permissions by adding roles
   * Focuses on ensuring the critical 'resourcemanager.projects.setIamPolicy' is present.
   */
  async ensurePermissions(): Promise<void> {
    await this.initialize()
    const { missingPermissions } = await this.checkPermissions()

    if (missingPermissions.length === 0) {
      console.log(
        "All required organization permissions (including projects.setIamPolicy) are already granted."
      )
      return
    }

    // Use imported constant
    console.log(
      `Attempting to add org role ${ORGANIZATION_ROLES.OWNER} to potentially grant missing permissions...`
    )
    try {
      await this.addRoles(this.userEmail!, [ORGANIZATION_ROLES.OWNER])
    } catch (error) {
      console.warn(
        `Failed to add organization role ${ORGANIZATION_ROLES.OWNER}:`,
        error
      )
      throw new SetupAuthError(
        `Failed to add '${ORGANIZATION_ROLES.OWNER}' role at the organization level. ` +
          `Cannot ensure required permissions. Original error: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : new Error(String(error)) }
      )
    }

    // Use imported constant
    console.log(
      `Re-checking for critical permission: ${ORGANIZATION_PERMISSIONS.PROJECTS_SET_IAM_POLICY}`
    )
    const grantedCheck = await this.testPermissions([
      ORGANIZATION_PERMISSIONS.PROJECTS_SET_IAM_POLICY,
    ])

    if (!grantedCheck.has(ORGANIZATION_PERMISSIONS.PROJECTS_SET_IAM_POLICY)) {
      console.error(
        `Critical permission ${ORGANIZATION_PERMISSIONS.PROJECTS_SET_IAM_POLICY} is still missing for user ${this.userEmail} at the organization level even after attempting to add owner role.`
      )
      throw new SetupAuthError(
        `User ${this.userEmail} lacks required permission '${ORGANIZATION_PERMISSIONS.PROJECTS_SET_IAM_POLICY}' at the organization level (${this.organizationId}). ` +
          "This permission is necessary to manage project roles. Please ensure the user has sufficient organization-level privileges (e.g., Org Admin, or a custom role with this permission)."
      )
    } else {
      console.log(
        `Successfully verified critical permission ${ORGANIZATION_PERMISSIONS.PROJECTS_SET_IAM_POLICY} is present.`
      )
      const { missingPermissions: finalMissing } = await this.checkPermissions()
      if (
        finalMissing.length > 0 &&
        !finalMissing.includes(ORGANIZATION_PERMISSIONS.PROJECTS_SET_IAM_POLICY)
      ) {
        console.warn(
          `Note: While critical permission ${ORGANIZATION_PERMISSIONS.PROJECTS_SET_IAM_POLICY} is present, some other checked organization permissions are still missing: ${finalMissing.join(", ")}`
        )
      }
    }

    console.log("Organization-level permission check passed.")
  }
}
