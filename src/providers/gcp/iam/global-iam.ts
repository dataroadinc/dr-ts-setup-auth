import { SetupAuthError } from "../../../utils/error.js"
import { OrganizationsClient } from "@google-cloud/resource-manager"
import { GcpAuthenticatedIdentity } from "../creds/identity.js"
import { BaseGcpIamManager } from "./base-iam.js"
// Import constants from central file
import { GLOBAL_PERMISSIONS, GlobalPermission } from "./constants.js"

// Remove old constant definitions
// export const GLOBAL_PERMISSIONS = { ... };
// type GlobalPermission = ...;

/**
 * Manages GCP global-level IAM operations (permissions that don't belong to specific resources)
 */
export class GcpGlobalIamManager extends BaseGcpIamManager {
  private organizationsClient: OrganizationsClient | undefined

  constructor(identity: GcpAuthenticatedIdentity) {
    super(identity)
  }

  protected formatResourceName(): string {
    // Global permissions don't have a specific resource name format
    // This method is required by BaseGcpIamManager but not used for global permissions
    throw new SetupAuthError("Global permissions do not use resource names")
  }

  protected async initializeSpecific(): Promise<void> {
    this.organizationsClient = new OrganizationsClient({
      auth: await this.identity.getGaxAuthClient(),
    })
  }

  /**
   * Test global permissions by attempting to perform the actual operations
   * Since these are global permissions, we can't use the testIamPermissions method
   * Instead, we try the actual operations and catch permission denied errors
   */
  private async testGlobalPermissions(): Promise<Set<string>> {
    await this.initialize()

    if (!this.organizationsClient) {
      throw new SetupAuthError("OrganizationsClient not initialized")
    }

    const grantedPermissions = new Set<string>()

    // Test LIST_ORGANIZATIONS permission
    try {
      await this.organizationsClient.searchOrganizations({})
      grantedPermissions.add(GLOBAL_PERMISSIONS.LIST_ORGANIZATIONS)
    } catch (error) {
      if (
        !(error instanceof Error && error.message.includes("permission denied"))
      ) {
        console.error(
          "Unexpected error testing LIST_ORGANIZATIONS permission:",
          error
        )
      }
    }

    // Add more permission tests here as needed
    // For example, testing folders.list, billing.accounts.list, etc.

    return grantedPermissions
  }

  /**
   * Check which global permissions are missing
   */
  async checkPermissions(): Promise<{
    missingPermissions: GlobalPermission[]
  }> {
    await this.initialize()

    console.log("Checking global permissions...")

    try {
      const grantedPermissions = await this.testGlobalPermissions()
      const missingPermissions = Object.values(GLOBAL_PERMISSIONS).filter(
        permission => !grantedPermissions.has(permission)
      ) as GlobalPermission[]

      return { missingPermissions }
    } catch (error) {
      console.error("Error checking global permissions:", error)
      return {
        missingPermissions: Object.values(
          GLOBAL_PERMISSIONS
        ) as GlobalPermission[],
      }
    }
  }

  /**
   * Attempt to grant missing global‑level permissions by adding the minimal
   * org‑level roles to the current user. This requires the executing
   * credentials to have `roles/resourcemanager.organizationAdmin` (or
   * equivalent) on the organisation. If that is not the case the caller will
   * still receive a detailed `SetupAuthError`.
   *
   * Strategy
   * 1. Re‑evaluate which global permissions are missing.
   * 2. Derive the set of org‑level roles that satisfy those permissions.
   * 3. For every organisation visible to the credentials, add the caller
   *    (`user:<email>`) to the required roles.
   */
  async ensurePermissions(): Promise<void> {
    await this.initialize()

    if (!this.organizationsClient) {
      throw new SetupAuthError("OrganizationsClient not initialized")
    }

    const { missingPermissions } = await this.checkPermissions()
    if (missingPermissions.length === 0) {
      console.log("All required global permissions are already granted.")
      return
    }

    // Map missing permissions → roles to grant
    const rolesToGrant = new Set<string>()
    const perm = GLOBAL_PERMISSIONS

    if (
      missingPermissions.includes(perm.LIST_ORGANIZATIONS) ||
      missingPermissions.includes(perm.LIST_FOLDERS)
    ) {
      rolesToGrant.add("roles/resourcemanager.organizationViewer")
    }
    if (missingPermissions.includes(perm.CREATE_PROJECT)) {
      rolesToGrant.add("roles/resourcemanager.projectCreator")
    }
    if (missingPermissions.includes(perm.LIST_BILLING_ACCOUNTS)) {
      rolesToGrant.add("roles/billing.viewer")
    }

    if (rolesToGrant.size === 0) {
      console.log("No corresponding roles found for missing permissions")
      return
    }

    const member = `user:${this.userEmail}`

    try {
      const [orgs] = await this.organizationsClient.searchOrganizations({})
      if (!orgs || orgs.length === 0) {
        throw new SetupAuthError(
          "No organizations found for the current credentials."
        )
      }

      for (const org of orgs) {
        if (!org.name) continue // safety

        console.log(
          `Attempting to grant global roles in ${org.displayName || org.name} …`
        )

        // 1. Fetch current IAM policy
        const [policy] = await this.organizationsClient.getIamPolicy({
          resource: org.name,
        })

        // Ensure bindings array

        policy.bindings = policy.bindings ?? []

        for (const role of rolesToGrant) {
          let binding = policy.bindings.find(b => b.role === role)
          if (binding) {
            // initialise members array
            binding.members = binding.members ?? []
            if (!binding.members.includes(member)) {
              binding.members.push(member)
            }
          } else {
            // create new binding
            policy.bindings.push({ role, members: [member] })
          }
        }

        // 2. Set updated policy
        await this.organizationsClient.setIamPolicy({
          resource: org.name,
          policy,
        })
        console.log(
          `✅ Granted roles on ${org.displayName || org.name} to ${member}:`
        )
        for (const role of rolesToGrant) {
          console.log(`   - ${role}`)
        }
      }
    } catch (error) {
      throw new SetupAuthError(
        "Failed to grant global permissions automatically",
        { cause: error }
      )
    }
  }
}
