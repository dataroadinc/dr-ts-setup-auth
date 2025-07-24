import { GcpIdentityFactory } from "../../../providers/gcp/creds/identity.js"
import {
  enforceUserDomainOrFail,
  getAdcEmailOrNull,
  printGcloudAndAdcAccounts,
} from "../../../utils/env-handler.js"
import { SetupAuthError } from "../../../utils/error.js"
import { checkOptions, gcpViewOptions } from "./options.js"
import { GcpOrganizationViewer } from "./view-organization.js"
import { gcpViewProject } from "./view-project.js"
import { gcpViewServiceAccount } from "./view-service-account.js"

export async function gcpView(options: gcpViewOptions): Promise<void> {
  await _gcpView(options)
  console.log("✅ GCP view command completed successfully")
}

async function _gcpView(options: gcpViewOptions): Promise<void> {
  await checkOptions(options)

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

  try {
    // Create the appropriate identity based on the auth option
    let identity = GcpIdentityFactory.createIdentity({
      forceAuthType: options.auth,
    })
    const userEmail = await identity.getCurrentUserEmail()
    enforceUserDomainOrFail(userEmail)
    // Pass the identity to the appropriate view handler
    if (options.item === "project") {
      await gcpViewProject(options, identity)
    } else if (options.item === "organization") {
      const organizationView = new GcpOrganizationViewer(
        identity,
        options.gcpOauthOrganizationId!,
        options.enable || false
      )
      await organizationView.view()
    } else if (options.item === "service-account") {
      await gcpViewServiceAccount(options, identity)
    } else {
      throw new SetupAuthError("Invalid item")
    }
  } catch (error) {
    // Wrap non-SetupAuthError errors
    if (!(error instanceof SetupAuthError)) {
      throw new SetupAuthError(
        "An error occurred while viewing GCP resources",
        { cause: error }
      )
    }
    throw error
  }
}
