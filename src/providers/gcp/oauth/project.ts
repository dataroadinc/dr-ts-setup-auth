// Import constants from the central IAM constants file
import { protos, ServiceUsageClient } from "@google-cloud/service-usage"
import { PlatformType } from "../../../types/index.js"
import { SetupAuthError } from "../../../utils/error.js"
import { getVercelClient } from "../../../utils/vercel/index.js"
import { GcpCloudCliClient } from "../../gcp/cloud-cli-client.js"
import { GcpAuthenticatedIdentity } from "../../gcp/creds/identity.js"
import { GcpOAuthBrandClient, GcpProjectManager } from "../../index.js"
import { PUBLIC_SERVICES, REQUIRED_SERVICES } from "../iam/constants.js"
import { GcpOAuthWebClientManager } from "./client.js"

/**
 * This class orchestrates project-level OAuth setup and configuration in GCP.
 *
 * It serves as the main coordinator in the OAuth client management system, working with:
 * - GcpOAuthBrandClient (consent screen management)
 * - GcpOAuthClientClient (client credential management)
 * - GcpIamManager (permissions)
 * - GcpProjectManager (project management)
 * - VercelClient (Vercel deployment management)
 *
 * Key responsibilities:
 * - Orchestrating the complete OAuth setup process
 * - Managing OAuth client creation and configuration
 * - Handling redirect URI updates
 * - Integrating with deployment platforms (e.g., Vercel)
 * - Providing webhook support for automated updates
 *
 * The class coordinates between different components to provide a seamless
 * OAuth setup experience, handling everything from initial setup to ongoing
 * management of OAuth configurations.
 */
export class GcpProjectOAuthSetup {
  private initialized: boolean
  private readonly identity: GcpAuthenticatedIdentity
  private readonly projectId: string
  private readonly quotaProjectId: string
  private readonly oauthBrandName: string
  private readonly platform: PlatformType
  private readonly vercelProjectName?: string
  private readonly defaultRedirectUri: string
  private readonly oauthClient: GcpOAuthWebClientManager
  private readonly projectManager: GcpProjectManager
  private serviceUsageClient: ServiceUsageClient | undefined
  private readonly brandClient: GcpOAuthBrandClient
  private clientId: string | undefined
  private clientSecret: string | undefined
  private allowedDomains?: string

  constructor(
    identity: GcpAuthenticatedIdentity,
    organizationId: string,
    projectId: string,
    quotaProjectId: string,
    oauthBrandName: string,
    platform: PlatformType,
    clientId?: string,
    vercelProjectName?: string,
    allowedDomains?: string
  ) {
    console.log(
      `DEBUG: GcpProjectOAuthSetup constructor received oauthBrandName: '${oauthBrandName}'`
    )

    this.initialized = false
    this.identity = identity
    this.brandClient = new GcpOAuthBrandClient(projectId, identity)
    this.projectId = projectId
    this.quotaProjectId = quotaProjectId
    this.oauthBrandName = oauthBrandName
    this.platform = platform
    this.vercelProjectName = vercelProjectName
    this.defaultRedirectUri = this.getDefaultRedirectUri()
    this.clientId = clientId
    this.allowedDomains = allowedDomains
    this.oauthClient = new GcpOAuthWebClientManager(this.projectId)
    this.projectManager = new GcpProjectManager(identity, organizationId)
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }
    await this.projectManager.initialize()
    await this.brandClient.initialize()

    if (!this.serviceUsageClient) {
      const authInstance = await this.identity.getAuthClient()
      this.serviceUsageClient = new ServiceUsageClient({
        auth: authInstance,
        quotaProjectId: this.quotaProjectId,
      })
    }

    this.initialized = true
  }

  /**
   * Set up OAuth for a project, this is the main method to call to get the whole process done.
   */
  async setupForProject(): Promise<void> {
    // --- GCP CLI Automation: Ensure all prerequisites are met automatically ---
    const cli = new GcpCloudCliClient()
    try {
      await cli.checkInstalled()
      await cli.checkAlphaComponent()
      await cli.autoAuthenticate()
    } catch (err) {
      throw new SetupAuthError(
        "GCP CLI automation failed: " +
          (err instanceof Error ? err.message : String(err)),
        { cause: err }
      )
    }
    // --- End automation block ---
    await this.initialize()
    await this.step_0_checkProject()
    await this.step_1_enableServices()
    await this.step_2_updateOrCreateBrand()
    await this.step_3_determineRedirectUri()

    await this.setupForVercelProject()
    await this.setupForOpenNextProject()
    await this.setupForNetlifyProject()
  }

  async setupForVercelProject(): Promise<void> {
    if (this.platform !== "vercel") return
    console.log("\n--- Updating Vercel specifics ---")

    if (!this.clientId) {
      throw new SetupAuthError("Cannot update Vercel: Client ID is missing.")
    }
    if (!this.clientSecret) {
      console.warn(
        "Client Secret is not available (client likely pre-existed). Cannot update Vercel secret variable."
      )
    }

    console.log("Adding all active Vercel deployment redirect URIs...")
    const vercelClient = await getVercelClient()
    const deploymentUrls = await vercelClient.getDeployments()
    const baseOrigin = this.defaultRedirectUri.split("/api/auth")[0]
    const callbackPath = "/callback/google"
    const allRedirectUris = [
      ...new Set([
        `${baseOrigin}${callbackPath}`,
        ...deploymentUrls.map((url: string) => `${url}${callbackPath}`),
      ]),
    ]

    // Fail fast: let errors propagate
    await this.oauthClient.updateRedirectUris(this.clientId!, allRedirectUris)
    console.log("✅ Successfully updated redirect URIs (Placeholder)")

    // await updateVercelWithOAuthCredentials(
    //   vercelClient,
    //   this.clientId,
    //   this.clientSecret,
    //   this.allowedDomains
    // )
    // console.log("✅ Attempted Vercel environment variable update.")
  }

  async setupForOpenNextProject(): Promise<void> {
    // Update redirect URIs to include all Vercel deployments
    if (this.platform !== "opennext") return

    console.log("\n--- Updating OpenNext specifics ---")
  }

  async setupForNetlifyProject(): Promise<void> {
    // Update redirect URIs to include all Netlify deployments
    if (this.platform !== "netlify") return

    console.log("\n--- Updating Netlify specifics ---")
  }

  /**
   * Step 0: Check if the project is valid
   */
  async step_0_checkProject(): Promise<void> {
    console.log(
      "\n--- Step 0: Check if the project is valid and create if needed... ---"
    )

    if (await this.projectManager.projectExists(this.projectId)) {
      console.log(`✅ GCP project ${this.projectId} already exists`)
      return
    }

    console.log(`Creating GCP project ${this.projectId}...`)
    await this.projectManager.createProject(this.projectId)
    console.log(`✅ Created GCP project ${this.projectId}`)
  }

  // Step 1: Enable Required services (running as Service Account)
  async step_1_enableServices(): Promise<void> {
    await this.initialize()
    if (!this.serviceUsageClient) {
      throw new SetupAuthError("ServiceUsageClient failed to initialize")
    }
    console.log("\n--- Step 1: Ensuring required services are enabled... ---")
    try {
      const [services] = await this.serviceUsageClient.listServices({
        parent: `projects/${this.projectId}`,
        filter: "state:ENABLED",
      })

      const enabledApis = new Set<string>(
        services
          .map(
            (service: protos.google.api.serviceusage.v1.IService) =>
              service.name?.split("/").pop() || ""
          )
          .filter(Boolean)
      )

      // Use imported PUBLIC_SERVICES, casting for comparison
      for (const publicApi of PUBLIC_SERVICES) {
        enabledApis.add(publicApi)
      }

      // Use imported REQUIRED_SERVICES
      const apisToEnable = Object.values(REQUIRED_SERVICES).filter(
        (api: string) =>
          !enabledApis.has(api) &&
          !(PUBLIC_SERVICES as ReadonlyArray<string>).includes(api)
      )

      if (apisToEnable.length > 0) {
        console.log("APIs to enable:", apisToEnable)
        for (const api of apisToEnable) {
          console.log(`Enabling API: ${api}...`)
          const [operation] = await this.serviceUsageClient.enableService({
            name: `projects/${this.projectId}/services/${api}`,
          })
          await operation.promise()
          console.log(`✅ API ${api} enabled successfully.`)
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      } else {
        console.log("All required APIs are already enabled.")
      }
    } catch (error: unknown) {
      console.error(
        "Failed to enable required APIs using service account:",
        error
      )
      // Extract details carefully from unknown type
      let reason = "Unknown Reason"
      let details = error instanceof Error ? error.message : String(error)
      if (error && typeof error === "object") {
        if ("reason" in error) reason = String(error.reason)
        if ("details" in error) details = String(error.details)
      }
      throw new SetupAuthError(
        `API enablement failed (Reason: ${reason}). Ensure the service account has necessary permissions (like serviceusage.serviceUsageAdmin) and check project/org policies. Details: ${details}`,
        { cause: error instanceof Error ? error : new Error(details) }
      )
    }
  }

  /**
   * Step 2: Assume Brand (Consent Screen) was created by setup-service-account.
   */
  async step_2_updateOrCreateBrand(): Promise<void> {
    console.log("\n--- Step 2: Assuming Brand (Consent Screen) exists... ---")
    console.log(
      `Proceeding with OAuth client setup assuming brand '${this.oauthBrandName}' exists.`
    )
  }

  async step_3_determineRedirectUri(): Promise<void> {
    console.log(
      "\n--- Step 3: Determine the redirect URI based on the platform... ---"
    )

    // Get client ID and secret from environment variables
    const envClientId = process.env.GCP_OAUTH_CLIENT_ID
    const envClientSecret = process.env.GCP_OAUTH_CLIENT_SECRET

    // Check if OAuth credentials are actually present (not empty, not placeholder)
    const hasValidClientId =
      envClientId && envClientId.trim() !== "" && envClientId !== "PLACEHOLDER"
    const hasValidClientSecret =
      envClientSecret &&
      envClientSecret.trim() !== "" &&
      envClientSecret !== "PLACEHOLDER"

    if (!hasValidClientId || !hasValidClientSecret) {
      // Create a new OAuth client automatically
      console.log(
        "OAuth credentials not found in .env.local. Creating a new OAuth client..."
      )

      const displayName = `${this.platform.charAt(0).toUpperCase() + this.platform.slice(1)} OAuth Client`
      const redirectUris = [this.defaultRedirectUri]
      const origins: string[] = [] // JavaScript origins not needed for server-side auth

      try {
        const { clientId, clientSecret } = await this.oauthClient.createClient(
          displayName,
          redirectUris,
          origins
        )
        this.clientId = clientId
        this.clientSecret = clientSecret

        console.log("\n✅ OAuth client created successfully!")
        console.log(`Client ID: ${clientId}`)
        console.log(`Client Secret: ${clientSecret}`)

        // Automatically save to .env.local
        console.log("\nSaving OAuth credentials to .env.local...")
        const { updateOrAddEnvVariable } = await import(
          "../../../utils/env-handler.js"
        )
        await updateOrAddEnvVariable("GCP_OAUTH_CLIENT_ID", clientId)
        await updateOrAddEnvVariable("GCP_OAUTH_CLIENT_SECRET", clientSecret)
        console.log("✅ OAuth credentials saved to .env.local")

        return // Client created with correct redirect URI, no need to verify/update
      } catch (error) {
        throw new SetupAuthError(
          "Failed to create OAuth client automatically.",
          { cause: error }
        )
      }
    }

    // Use the credentials from environment
    this.clientId = envClientId
    this.clientSecret = envClientSecret
    console.log(`Using OAuth client from .env.local: ${this.clientId}`)

    // Check if the OAuth client exists and has the correct redirect URI
    try {
      console.log("Verifying OAuth client configuration...")
      const details = await this.oauthClient.getClientDetails(this.clientId)
      console.log(`Current redirect URIs: ${details.redirectUris.join(", ")}`)

      if (!details.redirectUris.includes(this.defaultRedirectUri)) {
        console.log(`Adding redirect URI: ${this.defaultRedirectUri}`)
        const updatedUris = [...details.redirectUris, this.defaultRedirectUri]
        await this.oauthClient.updateRedirectUris(this.clientId, updatedUris)
        console.log("✅ Redirect URI added successfully")
      } else {
        console.log("✅ Redirect URI already configured")
      }
    } catch (error) {
      console.error("Error verifying OAuth client:", error)

      // Check if this is a Console-created OAuth client
      if (this.clientId.endsWith(".apps.googleusercontent.com")) {
        throw new SetupAuthError(
          `The OAuth client ${this.clientId} appears to be created via Google Cloud Console.\n\n` +
            "Console-created OAuth clients cannot be managed via gcloud CLI.\n" +
            "You have two options:\n" +
            "1. Continue managing this client manually in the Google Cloud Console, OR\n" +
            "2. Create a new OAuth client using this tool:\n" +
            "   - Remove GCP_OAUTH_CLIENT_ID and GCP_OAUTH_CLIENT_SECRET from .env.local\n" +
            "   - Run this command again to create a new OAuth client automatically\n" +
            "   - Follow the instructions to retrieve the new client secret\n\n" +
            "For more information, see: https://support.google.com/cloud/answer/15549257",
          { cause: error }
        )
      }

      throw new SetupAuthError(
        `Failed to verify OAuth client ${this.clientId}. ` +
          "Please ensure the client ID in .env.local is correct and the client exists in your GCP project.",
        { cause: error }
      )
    }
  }

  private getDefaultRedirectUri(): string {
    switch (this.platform) {
      case "vercel":
        if (!this.vercelProjectName) {
          throw new SetupAuthError(
            "Vercel project name is required for Vercel platform"
          )
        }
        return `https://${this.vercelProjectName}.vercel.app/api/auth`
      case "opennext":
        return process.env.PRODUCTION_URL
          ? `${process.env.PRODUCTION_URL}/api/auth`
          : `http://localhost:3000/api/auth`
      case "netlify":
        return `https://${this.projectId}.netlify.app/api/auth`
      default:
        throw new SetupAuthError(`Unsupported platform: ${this.platform}`)
    }
  }
}
