import { GCP_OAUTH_ORGANIZATION_ID } from "@/utils/env-handler.js"
import { SetupAuthError } from "@/utils/error.js"
import { OrganizationsClient, protos } from "@google-cloud/resource-manager"
import { GcpAuthenticatedIdentity } from "./creds/identity.js"
import { GcpOrganizationIamManager } from "./iam/organization-iam.js"

export type GcpOrganization =
  protos.google.cloud.resourcemanager.v3.IOrganization
type IamBinding = protos.google.iam.v1.IBinding

interface IamPolicy {
  bindings: IamBinding[]
  version?: number
  etag?: string
}

export class GcpOrganizationManager {
  private initialized = false
  private client!: OrganizationsClient
  private identity: GcpAuthenticatedIdentity
  private organizationId: string
  private iamManager: GcpOrganizationIamManager | undefined = undefined

  constructor(identity: GcpAuthenticatedIdentity, organizationId: string) {
    this.organizationId = organizationId
    this.identity = identity
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }
    try {
      console.log("OrganizationManager: Initializing GAX auth client...")
      const auth = await this.identity.getGaxAuthClient()
      console.log("OrganizationManager: Creating OrganizationsClient...")
      this.client = new OrganizationsClient({ auth })
      console.log("OrganizationManager: OrganizationsClient created.")

      // Create and initialize IAM Manager *after* client is created, passing the client
      console.log(
        "OrganizationManager: Initializing IAM Manager and passing client..."
      )
      this.iamManager = new GcpOrganizationIamManager(
        this.identity,
        this.organizationId,
        this.client
      )
      await this.iamManager.initialize() // Initialize the IAM manager itself (might do further setup)
      console.log("OrganizationManager: IAM Manager initialized.")

      this.initialized = true // Set initialized flag only after everything succeeds
    } catch (error) {
      console.error(
        "Error during GcpOrganizationManager initialization:",
        error
      )
      if (error instanceof Error) {
        throw new SetupAuthError(
          `Failed to initialize client: ${error.message}`,
          { cause: error }
        )
      }
      throw new SetupAuthError("Failed to initialize client: Unknown error")
    }
  }

  async getOrganization(): Promise<GcpOrganization> {
    try {
      const [organization] = await this.client.getOrganization({
        name: `organizations/${this.organizationId}`,
      })
      return organization
    } catch (error) {
      if (error instanceof Error) {
        throw new SetupAuthError(
          `Failed to get organization: ${error.message}`,
          { cause: error }
        )
      }
      throw new SetupAuthError("Failed to get organization: Unknown error")
    }
  }

  /**
   * Get the IAM policy for the organization
   *
   * TODO: This duplicates the functionality of the GcpOrganizationIamManager.getIamPolicy() method.
   *       We should refactor this to use the GcpOrganizationIamManager.getIamPolicy() method.
   */
  async getIamPolicy(): Promise<IamPolicy> {
    try {
      const [policy] = await this.client.getIamPolicy({
        resource: `organizations/${this.organizationId}`,
      })
      return policy as IamPolicy
    } catch (error) {
      if (error instanceof Error) {
        throw new SetupAuthError(`Failed to get IAM policy: ${error.message}`, {
          cause: error,
        })
      }
      throw new SetupAuthError("Failed to get IAM policy: Unknown error")
    }
  }

  /**
   * Get all IAM roles and their members for the organization
   *
   * TODO: This duplicates the functionality of the GcpOrganizationIamManager.getIamRoles() method.
   *       We should refactor this to use the GcpOrganizationIamManager.getIamRoles() method.
   */
  async getIamRoles(): Promise<{ role: string; members: string[] }[]> {
    try {
      const [policy] = await this.client.getIamPolicy({
        resource: `organizations/${this.organizationId}`,
      })

      return (policy.bindings || []).map((binding: IamBinding) => ({
        role: binding.role || "",
        members: binding.members || [],
      }))
    } catch (error) {
      if (error instanceof Error) {
        throw new SetupAuthError(`Failed to get IAM roles: ${error.message}`, {
          cause: error,
        })
      }
      throw new SetupAuthError("Failed to get IAM roles: Unknown error")
    }
  }

  async ensurePermissions(): Promise<void> {
    await this.initialize()
    if (!this.iamManager) {
      throw new SetupAuthError("IAM Manager was not initialized correctly.")
    }
    await this.iamManager.ensurePermissions()
  }
}

export async function gcpSetOauthOrganizationId(options: {
  gcpOauthOrganizationId?: string
}): Promise<void> {
  // Validate project ID format
  if (!options.gcpOauthOrganizationId) {
    throw new SetupAuthError("Organization ID cannot be empty")
  }

  if (
    options.gcpOauthOrganizationId.length < 6 ||
    options.gcpOauthOrganizationId.length > 30
  ) {
    throw new SetupAuthError(
      `Organization ID must be between 6 and 30 characters long. Got ${options.gcpOauthOrganizationId.length} characters: "${options.gcpOauthOrganizationId}"`
    )
  }

  // If a GCP organization ID is provided, set it in the environment
  process.env.GCP_OAUTH_ORGANIZATION_ID = options.gcpOauthOrganizationId
}

export async function gcpGetOauthOrganizationId(options: {
  gcpOauthOrganizationId?: string
}): Promise<{
  success: boolean
  gcpOauthOrganizationId?: string
  error?: string
}> {
  // If the GCP organization ID is explicitly provided, use it
  if (options.gcpOauthOrganizationId) {
    const gcpOauthOrganizationId = options.gcpOauthOrganizationId
    console.log(
      `Using explicitly provided GCP organization ID: ${gcpOauthOrganizationId}`
    )
    return { success: true, gcpOauthOrganizationId: gcpOauthOrganizationId }
  }

  // If the GCP organization ID is provided in the environment, use it.
  // (../../.env.local has been loaded into process.env)
  if (process.env[GCP_OAUTH_ORGANIZATION_ID]) {
    options.gcpOauthOrganizationId = process.env[GCP_OAUTH_ORGANIZATION_ID]
    console.log(
      `Using GCP organization ID from environment: ${options.gcpOauthOrganizationId}`
    )
    return {
      success: true,
      gcpOauthOrganizationId: options.gcpOauthOrganizationId,
    }
  }

  // Fall back to other environment variables
  if (process.env.EKG_ORG_SHORT) {
    options.gcpOauthOrganizationId = process.env.EKG_ORG_SHORT
    console.log(
      `Found organization name in environment variable EKG_ORG_SHORT: ${options.gcpOauthOrganizationId}`
    )
    return {
      success: true,
      gcpOauthOrganizationId: options.gcpOauthOrganizationId,
    }
  }

  return {
    success: false,
    error:
      "Could not determine organization name.\n" +
      `Please set ${GCP_OAUTH_ORGANIZATION_ID} or EKG_ORG_SHORT `,
  }
}

export async function gcpCheckOauthOrganizationId(options: {
  gcpOauthOrganizationId?: string
}): Promise<{ success: boolean; error?: string }> {
  const { success, gcpOauthOrganizationId, error } =
    await gcpGetOauthOrganizationId(options)
  if (!success) return { success: false, error }

  try {
    // Validate and set the project ID in environment variables
    await gcpSetOauthOrganizationId({
      gcpOauthOrganizationId: gcpOauthOrganizationId!,
    })
    // Update the options with the validated project ID
    options.gcpOauthOrganizationId = gcpOauthOrganizationId!
    return { success: true }
  } catch (error) {
    if (error instanceof SetupAuthError) {
      return { success: false, error: error.message }
    }
    return {
      success: false,
      error: `Failed to validate organization ID: ${error}`,
    }
  }
}
