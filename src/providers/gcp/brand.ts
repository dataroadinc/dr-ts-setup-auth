/**
 * This file is using the @google-cloud/iap package, do NOT revert back to the googleapis package.
 */
import { GcpAuthenticatedIdentity } from "@/providers/gcp/creds/identity.js"
import { EKG_PROJECT_LONG, GCP_OAUTH_BRAND_NAME } from "@/utils/env-handler.js"
import { SetupAuthError } from "@/utils/error.js"
import { IdentityAwareProxyOAuthServiceClient, protos } from "@google-cloud/iap"
import { backOff } from "exponential-backoff"
import { BACKOFF_OPTIONS } from "./iam/base-iam.js"

// Remove unused interface
// interface OAuthBrand { ... }

// Type alias for convenience
type IapBrand = protos.google.cloud.iap.v1.IBrand

/**
 * This class manages OAuth brands (consent screens) in GCP projects.
 * It is a core component of the OAuth client management system, working alongside:
 * - GcpOAuthClientClient (client credential management)
 * - GcpProjectOAuthSetup (orchestration)
 * - GcpIamManager (permissions)
 *
 * Key responsibilities:
 * - Creating and managing OAuth consent screens (brands)
 * - Handling support email configuration
 * - Managing application display names
 * - Providing brand verification and retrieval
 *
 * @example
 * ```typescript
 * const brandClient = new GcpOAuthBrandClient(gaxInstance, projectId);
 *
 * // Create or get a brand
 * const brandName = await brandClient.createOrGetBrand("My Application");
 * ```
 *
 * TODO: Why are we using axios and not the GCP SDK? At least document here why.
 */
export class GcpOAuthBrandClient {
  private projectId: string
  private identity: GcpAuthenticatedIdentity
  private iapClient: IdentityAwareProxyOAuthServiceClient | undefined
  private initialized: boolean = false

  constructor(projectId: string, identity: GcpAuthenticatedIdentity) {
    this.projectId = projectId
    this.identity = identity
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    try {
      // Use GaxAuthClient for compatibility with @google-cloud libraries
      const gaxAuth = await this.identity.getGaxAuthClient()
      this.iapClient = new IdentityAwareProxyOAuthServiceClient({
        auth: gaxAuth,
      })
      this.initialized = true
    } catch (error) {
      throw new SetupAuthError("Failed to initialize GcpOAuthBrandClient", {
        cause: error,
      })
    }
  }

  private formatProjectName(): string {
    return `projects/${this.projectId}`
  }

  private formatBrandName(brandId: string): string {
    // Brand ID is usually the project number, but the resource name includes project ID
    // Example: projects/PROJECT_ID/brands/PROJECT_NUMBER
    // The SDK methods often just need the parent (project name)
    // Let's assume brandId passed is the project number if needed, but often only parent is required.
    // For get/create, we typically need the parent project name.
    // The actual brand resource name is returned by the API.
    return `projects/${this.projectId}/brands/${brandId}`
  }

  /**
   * Tries to find an existing brand for the project.
   * GCP typically allows only one brand per project, associated with the project number.
   * @returns The found brand object or null if none exists.
   */
  private async findExistingBrand(): Promise<IapBrand | null> {
    await this.initialize()
    if (!this.iapClient) throw new SetupAuthError("IAP Client not initialized")

    const parent = this.formatProjectName()
    console.log(`Listing brands for project ${parent}...`)

    try {
      // Destructure the response object containing the brands array
      const [response] = await backOff(
        () => this.iapClient!.listBrands({ parent }),
        {
          ...BACKOFF_OPTIONS,
          retry: (e: unknown) => {
            // Type error as unknown
            let code: number | undefined
            if (e && typeof e === "object" && "code" in e) {
              code = e.code as number
            }
            const retryable = code === 8 || code === 13 || code === 14 // RESOURCE_EXHAUSTED, INTERNAL, UNAVAILABLE
            if (retryable)
              console.warn(`Retrying listBrands due to error code ${code}`)
            return retryable
          },
        }
      )

      // Access the brands array within the response object
      const brandsList = response.brands

      if (brandsList && brandsList.length > 0) {
        console.log(`Found existing brand: ${brandsList[0].name}`)
        return brandsList[0]
      } else {
        console.log("No existing brand found for this project.")
        return null
      }
    } catch (error: unknown) {
      // ... existing error handling ...
      console.error("Error listing existing brands:", error)
      const message = error instanceof Error ? error.message : String(error)
      throw new SetupAuthError(
        `Failed to list OAuth Brands for project ${this.projectId}. ` +
          `Ensure the user/SA has 'clientauthconfig.brands.list' permission. Original Error: ${message}`,
        { cause: error instanceof Error ? error : new Error(message) }
      )
    }
  }

  /**
   * Creates a new OAuth Brand (Consent Screen).
   * @param applicationTitle The desired title for the consent screen (e.g., project name).
   * @returns The newly created brand object.
   */
  private async createBrand(applicationTitle: string): Promise<IapBrand> {
    await this.initialize()
    if (!this.iapClient) throw new SetupAuthError("IAP Client not initialized")

    const parent = this.formatProjectName()
    console.log(
      `Attempting to create a new brand for project ${parent} with title '${applicationTitle}'...`
    )

    try {
      const userEmail = await this.identity.getCurrentUserEmail() // Needed for support email
      if (!userEmail)
        throw new SetupAuthError("Could not get user email for brand creation.")

      const [brand] = await backOff(
        () =>
          this.iapClient!.createBrand({
            parent,
            brand: {
              applicationTitle: applicationTitle,
              supportEmail: userEmail,
              // Org internal only is default, we might need flags later to set external
            },
          }),
        BACKOFF_OPTIONS
      )

      console.log(`Successfully created brand: ${brand.name}`)
      return brand
    } catch (error: unknown) {
      // Log the detailed error first
      console.error("DEBUG: Raw error during createBrand SDK call:", error)

      // Initialize variables for specific details
      let code: number | string | undefined
      let details: string | undefined
      let message = "Unknown error during brand creation."

      // Attempt to extract details
      if (error instanceof Error) {
        message = error.message
        // Check for gRPC-like error properties
        if (typeof error === "object" && error !== null) {
          if ("code" in error) code = error.code as number | string
          if ("details" in error) details = error.details as string
        }
      } else {
        message = String(error)
      }

      // Check for specific known issues
      if (message.includes("permission denied") || code === 7) {
        throw new SetupAuthError(
          `Permission denied creating OAuth Brand for project ${this.projectId}. ` +
            `Ensure the user/SA has 'clientauthconfig.brands.create' permission. Original Error: ${message}`,
          { cause: error instanceof Error ? error : new Error(message) }
        )
      }
      if (message.includes("Brand already exists")) {
        console.warn(
          "Brand creation failed because it already exists (unexpected). Attempting to find it again."
        )
        const existing = await this.findExistingBrand()
        if (existing) return existing
        throw new SetupAuthError(
          "Brand already exists but could not be retrieved after creation attempt.",
          {
            cause: error instanceof Error ? error : new Error(message),
          }
        )
      }

      // Throw a more generic error including extracted details if possible
      throw new SetupAuthError(
        `Failed to create OAuth Brand for project ${this.projectId}. Code: ${code ?? "N/A"}, Details: ${details ?? "N/A"}, Message: ${message}`,
        { cause: error instanceof Error ? error : new Error(message) }
      )
    }
  }

  /**
   * Gets an existing OAuth brand or creates a new one if none exists.
   * @param applicationTitle The title to use if creating a new brand.
   * @returns The resource name of the brand (e.g., projects/PROJECT_ID/brands/PROJECT_NUMBER).
   */
  async createOrGetBrand(applicationTitle: string): Promise<string> {
    await this.initialize()

    const existingBrand = await this.findExistingBrand()

    if (existingBrand?.name) {
      // Optionally update the brand if needed?
      // For now, just return the existing one.
      console.log(`Using existing brand: ${existingBrand.name}`)
      return existingBrand.name
    }

    // If no brand exists, create one
    console.log("No existing brand found, creating a new one...")
    const newBrand = await this.createBrand(applicationTitle)

    if (!newBrand?.name) {
      // This shouldn't happen if createBrand succeeded, but check defensively
      throw new SetupAuthError(
        "Brand creation process did not return a valid brand name."
      )
    }

    return newBrand.name
  }

  // Keep getBrandByName if used elsewhere, otherwise it can be removed.
  // It might need refactoring based on how Brand IDs vs Names are handled.
  async getBrandByName(name: string): Promise<IapBrand | null> {
    await this.initialize()
    if (!this.iapClient) throw new SetupAuthError("IAP Client not initialized")
    console.warn("getBrandByName might be unreliable, prefer findExistingBrand")
    try {
      const [brand] = await this.iapClient.getBrand({
        name: this.formatBrandName(name),
      })
      return brand
    } catch (error) {
      console.error(`Error getting brand by name ${name}:`, error)
      return null // Treat errors as "not found"
    }
  }
}

async function gcpGetOauthBrandName(options: {
  oauthBrandName?: string
}): Promise<{ success: boolean; oauthBrandName?: string; error?: string }> {
  // If the GCP OAuth brand name is explicitly provided, use it
  if (options.oauthBrandName) {
    const oauthBrandName = options.oauthBrandName
    console.log(
      `Using explicitly provided GCP OAuth brand name: ${oauthBrandName}`
    )
    return { success: true, oauthBrandName: oauthBrandName }
  }

  // If the GCP OAuth Brand Name is provided in the environment, use it.
  // (.env.local has been loaded into process.env)
  if (process.env[GCP_OAUTH_BRAND_NAME]) {
    options.oauthBrandName = process.env[GCP_OAUTH_BRAND_NAME]
    console.log(
      `Using GCP OAuth Brand Name from environment: ${options.oauthBrandName}`
    )
    return { success: true, oauthBrandName: options.oauthBrandName }
  }

  // Fall back to other environment variables
  if (process.env[EKG_PROJECT_LONG]) {
    options.oauthBrandName = process.env.EKG_PROJECT_LONG
    console.log(
      `Found brand name in environment variable ${EKG_PROJECT_LONG}: ${options.oauthBrandName}`
    )
    return { success: true, oauthBrandName: options.oauthBrandName }
  }

  return {
    success: false,
    error:
      "Could not determine brand name.\n" +
      `Please set ${GCP_OAUTH_BRAND_NAME} or ${EKG_PROJECT_LONG} ` +
      "in .env.local or environment variables.",
  }
}

export async function gcpCheckOauthBrandName(options: {
  oauthBrandName: string
}): Promise<{ success: boolean; error?: string }> {
  const { success, oauthBrandName, error } = await gcpGetOauthBrandName(options)
  if (!success) return { success: false, error }

  process.env.GCP_OAUTH_BRAND_NAME = oauthBrandName!

  options.oauthBrandName = oauthBrandName!

  return { success: true }
}
