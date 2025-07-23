import { GcpCloudCliClient } from "@/providers/gcp/cloud-cli-client.js"
import { GcpIdentityFactory } from "@/providers/gcp/creds/identity.js"
import { GcpProjectOAuthSetup } from "@/providers/gcp/oauth/index.js"
import {
  enforceUserDomainOrFail,
  GCP_OAUTH_BRAND_RESOURCE_NAME,
  getAdcEmailOrNull,
  printGcloudAndAdcAccounts,
} from "@/utils/env-handler.js"
import { SetupAuthError } from "@/utils/error.js"
import { checkOptions, GcpSetupOAuthOptions } from "./options.js"

/**
 * Setup GCP OAuth for various deployment platforms.
 *
 * NOTE: This is the entry point for the setup-google-oauth command
 *
 * @param options Options for setting up GCP OAuth
 * @returns Result of the setup operation
 */
export async function gcpSetupOAuth(
  options: GcpSetupOAuthOptions
): Promise<void> {
  console.log("Setting up GCP OAuth...")

  // Print both gcloud and ADC accounts for clarity
  await printGcloudAndAdcAccounts()

  // --- Automated ADC authentication if needed ---
  const expectedDomain = process.env.EKG_ORG_PRIMARY_DOMAIN
  if (!expectedDomain) {
    throw new SetupAuthError(
      "Missing required environment variable: EKG_ORG_PRIMARY_DOMAIN. This tool enforces a fail-fast approach and requires this variable to be set in your .env.local (e.g., EKG_ORG_PRIMARY_DOMAIN=your-domain.com)."
    )
  }

  // First try to get ADC email
  let adcEmail = await getAdcEmailOrNull()

  // If no ADC, attempt automatic authentication
  if (!adcEmail) {
    console.log("ADC not configured. Attempting automatic authentication...")
    const cli = new GcpCloudCliClient()
    try {
      await cli.autoApplicationDefaultAuthenticate()
      // Try again after authentication
      adcEmail = await getAdcEmailOrNull()
    } catch (error) {
      throw new SetupAuthError(
        "Failed to automatically configure Application Default Credentials.\n" +
          "This may be because:\n" +
          "1. You're running in a non-interactive environment (CI/CD)\n" +
          "2. gcloud is not installed or not in PATH\n" +
          "3. You need to manually run: gcloud auth application-default login\n",
        { cause: error }
      )
    }
  }

  // Verify we now have ADC email
  if (!adcEmail) {
    throw new SetupAuthError(
      "Could not determine Application Default Credentials (ADC) email after authentication attempt."
    )
  }

  // Check domain matches
  const adcDomain = adcEmail.split("@")[1] || ""
  if (adcDomain.toLowerCase() !== expectedDomain.toLowerCase()) {
    throw new SetupAuthError(
      `Application Default Credentials (ADC) are for '${adcEmail}', which does not match the required organization domain (${expectedDomain}).\n` +
        `Please run 'gcloud auth application-default login' and select your <user>@${expectedDomain} account.`
    )
  }
  // --- End automated ADC authentication ---

  try {
    // Call checkOptions to validate and populate options
    await checkOptions(options)

    // Now options object is guaranteed to have validated and determined values
    const platform = options.platform!
    const projectId = options.gcpOauthProjectId!
    const organizationId = options.gcpOauthOrganizationId!
    const vercelProjectName = options.vercelProjectName // Might be undefined if not Vercel

    // --- Identity validation and domain check ---
    const identity = GcpIdentityFactory.createAdcIdentity()
    const userEmail = await identity.getCurrentUserEmail()
    enforceUserDomainOrFail(userEmail)
    // --- End domain check ---

    // --- Read the Brand Resource Name from Env --- >
    const brandResourceName = process.env[GCP_OAUTH_BRAND_RESOURCE_NAME]
    if (!brandResourceName) {
      throw new SetupAuthError(
        `OAuth Brand resource name not found in environment variable ${GCP_OAUTH_BRAND_RESOURCE_NAME}. ` +
          `Please run 'gcp-setup-service-account' first.`
      )
    }
    console.log(`Using OAuth Brand Resource Name: ${brandResourceName}`)
    // --- End Brand Resource Name Read --- <

    console.log(`Platform: ${platform}`)
    console.log(`Using explicitly provided GCP project ID: ${projectId}`)
    console.log(
      `Using explicitly provided GCP organization ID: ${organizationId}`
    )
    if (vercelProjectName)
      console.log(`Using specified Vercel project name: ${vercelProjectName}`)

    // Instantiate GcpProjectOAuthSetup
    const setup = new GcpProjectOAuthSetup(
      identity,
      organizationId,
      projectId,
      projectId, // Use project ID as quota project ID
      brandResourceName,
      platform,
      undefined,
      vercelProjectName
    )

    await setup.setupForProject()
    console.log("✅ GCP OAuth setup completed successfully.")
  } catch (error) {
    if (error instanceof SetupAuthError) {
      console.error("\n❌ FATAL: " + error.message)
      if (error.isReauthenticationError && error.isReauthenticationError()) {
        console.error(
          "Hint: Your credentials are expired or invalid. Run `gcloud auth login` or `gcloud auth application-default login` to re-authenticate."
        )
        console.error("See: https://support.google.com/a/answer/9368756")
      } else {
        let hint = "Check your GCP permissions and environment variables."
        if (
          error.originalError &&
          typeof error.originalError === "object" &&
          "message" in error.originalError
        ) {
          hint = (error.originalError as { message?: string }).message || hint
        }
        console.error("Hint: " + hint)
      }
    } else {
      console.error("\n❌ Unknown fatal error:", error)
    }
    // Fail fast: abort immediately
    process.exit(1)
  }
}
