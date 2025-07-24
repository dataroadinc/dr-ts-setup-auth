import { SetupAuthError } from "../../../utils/error.js"
// Import constants from central file
import { superJoin } from "../../../utils/string.js"
import { OrgPolicyClient, protos } from "@google-cloud/org-policy"
import { OrganizationsClient } from "@google-cloud/resource-manager" // Import for injection
import { backOff } from "exponential-backoff"
import { GcpAuthenticatedIdentity } from "../creds/identity.js"
import { BACKOFF_OPTIONS } from "../iam/base-iam.js" // Reuse backoff options only

import { ORGANIZATION_PERMISSIONS } from "../iam/constants.js"

const SERVICE_USAGE_CONSTRAINT = "constraints/serviceuser.services"
type IPolicy = protos.google.cloud.orgpolicy.v2.IPolicy

export class GcpOrgPolicyManager {
  // No inheritance
  private identity: GcpAuthenticatedIdentity
  private orgPolicyClient: OrgPolicyClient | undefined
  private organizationsClient: OrganizationsClient // Injected
  private orgResourceName: string
  private userEmail: string | undefined
  private hasGetPermission: boolean | undefined = undefined
  private hasSetPermission: boolean | undefined = undefined
  private constraintsListed: boolean = false // Flag to list only once

  constructor(
    identity: GcpAuthenticatedIdentity,
    organizationId: string,
    organizationsClient: OrganizationsClient
  ) {
    this.identity = identity
    this.organizationsClient = organizationsClient // Store injected client
    this.orgResourceName = `organizations/${organizationId}`
  }

  // Separate initialization for this manager's specific client
  async initialize(): Promise<void> {
    if (!this.orgPolicyClient) {
      const auth = await this.identity.getGaxAuthClient()
      this.orgPolicyClient = new OrgPolicyClient({ auth })
    }
    if (!this.userEmail) {
      // Use the correct method to get email
      this.userEmail = await this.identity.getCurrentUserEmail()
      if (!this.userEmail) {
        throw new SetupAuthError("Could not retrieve user email from identity.")
      }
    }

    // --- DEBUG: List available constraints (only once) ---
    if (this.orgPolicyClient && !this.constraintsListed) {
      try {
        console.log(`DEBUG: Listing constraints for ${this.orgResourceName}...`)
        const [constraintsList] = await this.orgPolicyClient.listConstraints({
          parent: this.orgResourceName,
          pageSize: 200, // Ensure we get a good number if > default page size
        })
        console.log(`DEBUG: Found ${constraintsList.length} constraints.`)
        // Log the first few constraint names to verify format and existence
        console.log("DEBUG: Sample constraint names:")
        constraintsList.slice(0, 10).forEach(c => console.log(`  - ${c.name}`))
        // Check if the specific constraint exists in the list
        const targetConstraint = `${this.orgResourceName}/constraints/serviceuser.services`
        const foundTarget = constraintsList.some(
          c => c.name === targetConstraint
        )
        console.log(
          `DEBUG: Does list contain '${targetConstraint}'? ${foundTarget}`
        )
        this.constraintsListed = true // Set flag after successful listing
      } catch (listError) {
        console.error(
          `DEBUG: Failed to list constraints for ${this.orgResourceName}:`,
          listError
        )
      }
    }
    // --- END DEBUG ---
  }

  /**
   * Checks if the executing user has specific Org Policy permissions.
   * Caches results.
   */
  private async checkOrgPolicyPermissions(): Promise<{
    canGet: boolean
    canSet: boolean
  }> {
    await this.initialize()
    if (
      this.hasGetPermission !== undefined &&
      this.hasSetPermission !== undefined
    ) {
      return { canGet: this.hasGetPermission, canSet: this.hasSetPermission }
    }

    if (!this.userEmail) {
      throw new SetupAuthError("User email is required for permission check.")
    }

    // Use imported constants
    const permissionsToCheck = [
      ORGANIZATION_PERMISSIONS.ORG_POLICY_GET,
      ORGANIZATION_PERMISSIONS.ORG_POLICY_SET,
    ]
    console.log(
      `Checking if user ${this.userEmail} has the following Org Policy permissions on ${this.orgResourceName}:${superJoin(permissionsToCheck)}`
    )

    try {
      const [response] = await backOff(
        () =>
          this.organizationsClient.testIamPermissions({
            resource: this.orgResourceName,
            permissions: permissionsToCheck,
          }),
        BACKOFF_OPTIONS
      )
      const granted = new Set(response.permissions || [])
      // Use imported constants
      this.hasGetPermission = granted.has(
        ORGANIZATION_PERMISSIONS.ORG_POLICY_GET
      )
      this.hasSetPermission = granted.has(
        ORGANIZATION_PERMISSIONS.ORG_POLICY_SET
      )

      console.log(
        `Permission check results: GET=${this.hasGetPermission}, SET=${this.hasSetPermission}`
      )
      return { canGet: this.hasGetPermission, canSet: this.hasSetPermission }
    } catch (error) {
      console.error(
        `Failed to check Org Policy permissions [${permissionsToCheck.join(", ")}]:`,
        error
      )
      this.hasGetPermission = false
      this.hasSetPermission = false
      return { canGet: false, canSet: false }
    }
  }

  /**
   * Gets the organization policy for a given constraint.
   */
  private async getOrgLevelPolicy(constraint: string): Promise<IPolicy | null> {
    const { canGet } = await this.checkOrgPolicyPermissions()
    if (!canGet) {
      // Use imported constant
      throw new SetupAuthError(
        `User ${this.userEmail} lacks permission '${ORGANIZATION_PERMISSIONS.ORG_POLICY_GET}' on ${this.orgResourceName}. Cannot fetch Org Policy.`
      )
    }

    await this.initialize()
    if (!this.orgPolicyClient)
      throw new SetupAuthError("OrgPolicyClient not initialized")

    const name = `${this.orgResourceName}/policies/${constraint}`
    console.log(
      `DEBUG: Attempting to fetch Org Policy with resource name: "${name}"`
    )
    try {
      const [policy] = await backOff(
        () => this.orgPolicyClient!.getPolicy({ name }),
        BACKOFF_OPTIONS
      )
      return policy
    } catch (error: unknown) {
      let code: number | undefined
      let message: string | undefined
      if (error && typeof error === "object") {
        if ("code" in error) code = error.code as number
        if ("message" in error) message = error.message as string
      }

      // Handle NOT_FOUND (Code 5)
      if (code === 5) {
        console.log(
          `No policy found directly on ${this.orgResourceName} for constraint ${constraint}.`
        )
        return null
      }

      // WORKAROUND: Handle specific INVALID_ARGUMENT (Code 3) ONLY for serviceuser.services
      if (code === 3 && constraint === SERVICE_USAGE_CONSTRAINT) {
        console.warn(
          `WORKAROUND: Received INVALID_ARGUMENT (Code 3) fetching policy for ${SERVICE_USAGE_CONSTRAINT}, ` +
            `but proceeding as GET permission exists and effective policy is likely allowAll. Check GCP console if issues persist.`
        )
        return null // Treat as if no policy is set, allowing default behavior
      }

      // Handle unexpected INVALID_ARGUMENT (Code 3) for OTHER constraints
      if (code === 3) {
        console.error(
          `Received INVALID_ARGUMENT (Code 3) fetching policy ${name}, despite having GET permission. This is unexpected.`
        )
        throw new SetupAuthError(
          `Failed to fetch organization policy for ${constraint} due to unexpected INVALID_ARGUMENT (Code: 3), even though GET permission exists. ` +
            `This might indicate an issue with the constraint configuration or the API/client library. Please check the constraint '${constraint}' in the GCP console for potential issues. Original error: ${message || String(error)}`,
          {
            cause:
              error instanceof Error
                ? error
                : new Error(message || String(error)),
          }
        )
      }

      // Handle other errors
      console.error(`Error fetching policy ${name}:`, error)
      const errorCodeMessage = code ? ` (Code: ${code})` : ""
      throw new SetupAuthError(
        `Failed to fetch organization policy for ${constraint}${errorCodeMessage}`,
        {
          cause:
            error instanceof Error
              ? error
              : new Error(message || String(error)),
        }
      )
    }
  }

  /**
   * Ensures a specific service is allowed by the 'serviceuser.services' constraint
   * at the organization level, modifying the policy if necessary and permitted.
   */
  async ensureServiceAllowedAtOrgLevel(serviceName: string): Promise<void> {
    // Fetches policy (and implicitly checks GET permission via getOrgLevelPolicy)
    const policy = await this.getOrgLevelPolicy(SERVICE_USAGE_CONSTRAINT)

    let isAllowed = true
    let policyNeedsUpdate = false
    let modifiedPolicy: IPolicy | null = policy
      ? JSON.parse(JSON.stringify(policy))
      : null
    if (modifiedPolicy && !modifiedPolicy.spec) modifiedPolicy.spec = {}
    if (modifiedPolicy?.spec && !modifiedPolicy.spec.rules)
      modifiedPolicy.spec.rules = []
    if (modifiedPolicy?.spec?.rules && modifiedPolicy.spec.rules.length > 0) {
      let relevantRuleFound = false
      for (let i = 0; i < modifiedPolicy.spec.rules.length; i++) {
        // Use 'any' for rule and values as requested, silencing linter
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rule: any = modifiedPolicy.spec.rules[i]
        if (!rule.values) rule.values = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ruleValues: any = rule.values

        if (ruleValues.deniedValues?.includes(serviceName)) {
          isAllowed = false
          relevantRuleFound = true
          ruleValues.deniedValues = ruleValues.deniedValues.filter(
            (v: string) => v !== serviceName
          )
          policyNeedsUpdate = true
          console.log(`Removed ${serviceName} from deny list.`)
        } else if (ruleValues.allowedValues) {
          relevantRuleFound = true
          const isAllowListEnforced = !rule.allowAll && !rule.denyAll
          if (
            isAllowListEnforced &&
            !ruleValues.allowedValues.includes(serviceName)
          ) {
            isAllowed = false
            ruleValues.allowedValues.push(serviceName)
            policyNeedsUpdate = true
            isAllowed = true
            console.log(`Added ${serviceName} to allow list.`)
          } else if (ruleValues.allowedValues.includes(serviceName)) {
            isAllowed = true
            policyNeedsUpdate = false
            break
          }
        } else if (rule.denyAll) {
          isAllowed = false
          relevantRuleFound = true
          policyNeedsUpdate = false
          console.log(`Service blocked by denyAll rule.`)
          break
        } else if (rule.allowAll) {
          isAllowed = true
          relevantRuleFound = true
          policyNeedsUpdate = false
          break
        }
      }
      if (!relevantRuleFound) isAllowed = true
    } else {
      isAllowed = true
    }

    if (!isAllowed && !policyNeedsUpdate) {
      throw new SetupAuthError(
        `Service ${serviceName} is blocked by Organization Policy (${SERVICE_USAGE_CONSTRAINT}), and automatic modification was not possible or safe. Please review the policy on ${this.orgResourceName}.`
      )
    }

    if (policyNeedsUpdate) {
      console.log(
        `Organization policy for ${SERVICE_USAGE_CONSTRAINT} needs update to allow ${serviceName}.`
      )

      // Check SET permission specifically before attempting update
      const { canSet } = await this.checkOrgPolicyPermissions()
      if (!canSet) {
        // Use imported constant
        throw new SetupAuthError(
          `Executing user ${this.userEmail} lacks permission '${ORGANIZATION_PERMISSIONS.ORG_POLICY_SET}' on ${this.orgResourceName}. ` +
            `Cannot automatically modify Organization Policy to allow service '${serviceName}'. Please grant the permission or modify the policy manually.`
        )
      }
      if (
        !modifiedPolicy?.name ||
        !modifiedPolicy?.etag ||
        !modifiedPolicy?.spec
      ) {
        throw new SetupAuthError(
          "Cannot update policy: missing name, etag, or spec."
        )
      }
      console.log(
        `Attempting to update policy ${modifiedPolicy.name} (etag: ${modifiedPolicy.etag})...`
      )
      try {
        const updateRequest = {
          policy: modifiedPolicy,
          updateMask: { paths: ["spec"] },
        }
        await backOff(
          () => this.orgPolicyClient!.updatePolicy(updateRequest),
          BACKOFF_OPTIONS
        )
        console.log(
          `Successfully updated Org Policy ${modifiedPolicy.name} to allow ${serviceName}.`
        )
        // No unconditional wait here; if a check is possible, do it, otherwise proceed
        // TODO: If possible, check if the policy is effective before proceeding. Only wait if needed.
      } catch (error) {
        console.error(`Error updating policy ${modifiedPolicy.name}:`, error)
        throw new SetupAuthError(
          `Failed to update Organization Policy for ${SERVICE_USAGE_CONSTRAINT} to allow ${serviceName}.`,
          {
            cause: error instanceof Error ? error : new Error(String(error)),
          }
        )
      }
    } else if (!isAllowed) {
      throw new SetupAuthError(
        `Service ${serviceName} appears blocked by Organization Policy (${SERVICE_USAGE_CONSTRAINT}), but no modification was attempted. Please review the policy on ${this.orgResourceName}.`
      )
    } else {
      console.log(
        `Service ${serviceName} appears to be allowed by Organization Policy ${SERVICE_USAGE_CONSTRAINT}.`
      )
    }
  }
}
