import fs from "fs/promises" // Needed for file operations
import path from "path" // Needed for path operations
import { gcpCallAPI } from "@/providers/gcp/api-call.js"
// Import the Brand client
import { GcpOAuthBrandClient } from "@/providers/gcp/brand.js"
import { GcpCloudCliClient } from "@/providers/gcp/cloud-cli-client.js"
import { GcpIdentityFactory } from "@/providers/gcp/creds/identity.js"
import { BACKOFF_OPTIONS } from "@/providers/gcp/iam/base-iam.js" // For retry options

// Import constants from central file
import {
  PROJECT_ROLES,
  REQUIRED_SERVICES,
} from "@/providers/gcp/iam/constants.js"
import { GcpOrganizationManager } from "@/providers/gcp/organization.js"
import { GcpOrgPolicyManager } from "@/providers/gcp/orgpolicy/index.js" // Org policy manager
import { GcpProjectManager } from "@/providers/gcp/project/index.js"
import {
  enforceUserDomainOrFail,
  GCP_OAUTH_APPLICATION_CREDENTIALS,
  GCP_OAUTH_BRAND_RESOURCE_NAME,
  getAdcEmailOrNull,
  printGcloudAndAdcAccounts,
  updateOrAddEnvVariable,
} from "@/utils/env-handler.js"
import { SetupAuthError } from "@/utils/error.js"
import { sleep, waitForIamPropagation } from "@/utils/sleep.js" // Import sleep and waitForIamPropagation utilities
import { OrganizationsClient } from "@google-cloud/resource-manager" // Needed for Org Policy Manager
import { ServiceUsageClient } from "@google-cloud/service-usage" // Import ServiceUsageClient
import axios from "axios"
import { backOff } from "exponential-backoff" // For potential retry

import { GcpSetupServiceAccountOptions } from "./options.js"

interface GcpIamBinding {
  role: string
  members: string[]
}

interface GcpIamPolicy {
  bindings: GcpIamBinding[]
  etag?: string
}

interface GcpServiceAccountKeyResponse {
  privateKeyData?: string
}

interface GcpServiceAccountResponse {
  email: string
  name: string
  displayName: string
  description: string
}

interface GcpServiceAccountKeysResponse {
  keys?: Array<{ name: string }>
}

/**
 * Setup a GCP service account that can be used to execute the gcp-setup-oauth command.
 *
 * NOTE: This is the entry point for the gcp-setup-service-account command
 *
 * @param options Options for setting up the GCP service account
 * @returns Result of the setup operation
 */
export async function gcpSetupServiceAccount(
  options: GcpSetupServiceAccountOptions
): Promise<void> {
  await _gcpSetupServiceAccount(options)
  console.log("✅ Service account setup completed successfully.")
}

/**
 * Set up a GCP service account.
 *
 * @param options Options for setting up the service account
 */
async function _gcpSetupServiceAccount(
  options: GcpSetupServiceAccountOptions
): Promise<void> {
  console.log("Setting up GCP service account...")

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

  // --- Step 1 ---
  console.log(
    "\n--- Step 1: Validate authentication & ensure prerequisite APIs ---"
  )

  const identity = GcpIdentityFactory.createAdcIdentity()
  let userEmail: string | undefined
  try {
    console.log("Attempting to validate identity by fetching email...")
    userEmail = await identity.getCurrentUserEmail()
    enforceUserDomainOrFail(userEmail)
    console.log(`Identity validated successfully for user: ${userEmail}`)
  } catch (error) {
    console.error("Failed to validate identity:", error)
    throw new SetupAuthError("Identity validation failed. Cannot proceed.", {
      cause: error,
    })
  }

  // --- Step 1A: Ensure project exists (create if missing) ---
  console.log("\n--- Step 1A: Get or create the project ---")
  const orgId = options.gcpOauthOrganizationId!
  const projectId = options.gcpOauthProjectId!
  const projectManager = new GcpProjectManager(identity, orgId)
  await projectManager.initialize()
  await projectManager.createProject(projectId)
  // --- End Step 1A ---

  // --- Step 1B: Ensure current user has required IAM roles for API enablement ---
  console.log(
    "\n--- Step 1B: Ensure current user has required IAM roles for API enablement ---"
  )
  const projectIamManager = await projectManager.getIamManager(projectId)
  await projectIamManager.ensurePermissions() // This will grant roles like serviceusage.serviceUsageAdmin if missing
  // (No unconditional wait here; IAM manager handles propagation waits only if needed)
  // --- End Step 1B ---

  // --- Ensure Org Policy API is enabled before using its manager ---
  console.log(
    "Ensuring prerequisite API 'orgpolicy.googleapis.com' is enabled..."
  )
  const auth = await identity.getGaxAuthClient()
  const serviceUsageClient = new ServiceUsageClient({ auth })
  const projectResourceName = `projects/${projectId}`

  // List of APIs to ensure are enabled
  const prerequisiteApis = [
    REQUIRED_SERVICES.ORG_POLICY, // Needed for Org Policy checks
    REQUIRED_SERVICES.IAP, // Needed for Brand management
  ]

  for (const apiName of prerequisiteApis) {
    console.log(`Ensuring prerequisite API '${apiName}' is enabled...`)
    const apiResourceName = `${projectResourceName}/services/${apiName}`
    try {
      await backOff(
        () => serviceUsageClient.enableService({ name: apiResourceName }),
        BACKOFF_OPTIONS
      )
      console.log(`Service ${apiName} enabled or already enabled.`)
      await sleep(1000)
    } catch (error) {
      if (error instanceof Error && error.message.includes("already enabled")) {
        console.log(`Service ${apiName} is already enabled.`)
      } else {
        console.error(
          `Failed to enable prerequisite service ${apiName}:`,
          error
        )
        throw new SetupAuthError(
          `Could not enable the required API (${apiName}) needed for setup. Please ensure the user ${userEmail} has 'serviceusage.services.enable' permission on project ${projectId}.`,
          { cause: error }
        )
      }
    }
  }
  // --- End Prerequisite API Check ---

  // --- Step 1.5 ---
  console.log("\n--- Step 1.5: Early Org Policy Check ---")
  const organizationsClient = new OrganizationsClient({ auth }) // Reuse auth
  const orgPolicyManager = new GcpOrgPolicyManager(
    identity,
    orgId,
    organizationsClient
  )
  await orgPolicyManager.initialize()

  // TODO: Move to a more general place and merge with other declarations of PUBLIC_SERVICES in the codebase
  const scriptCriticalServices = [
    REQUIRED_SERVICES.RESOURCE_MANAGER,
    REQUIRED_SERVICES.SERVICE_USAGE,
    REQUIRED_SERVICES.IAM,
    REQUIRED_SERVICES.CREDENTIALS,
    REQUIRED_SERVICES.ORG_POLICY,
  ]
  for (const serviceName of scriptCriticalServices) {
    console.log(`Ensuring service '${serviceName}' is allowed by Org Policy...`)
    await orgPolicyManager.ensureServiceAllowedAtOrgLevel(serviceName)
  }
  console.log("✅ Organization Policy check passed for critical services.")
  // --- End Early Org Policy Check ---

  // --- Step 2 ---
  console.log("\n--- Step 2: Ensure Organization IAM Permissions ---")
  const organizationManager = new GcpOrganizationManager(identity, orgId)
  await organizationManager.ensurePermissions()

  // Initialize project manager
  // (projectManager already initialized above)

  // --- Step 3 ---
  // (project creation already handled above)

  // Create project IAM manager
  // (projectIamManager already initialized above)

  // --- Step 4 ---
  console.log("\n--- Step 4: Ensure project permissions & enable services ---")
  // Org Policy check is done, so this focuses on IAM and enabling APIs
  await projectIamManager.ensurePermissions()

  // --- Step 4.5: Create/Ensure OAuth Brand (Consent Screen) --- > NEW STEP
  console.log("\n--- Step 4.5: Ensure OAuth Brand (Consent Screen) exists ---")
  const appTitle = process.env.EKG_PROJECT_LONG
  if (!appTitle) {
    throw new SetupAuthError(
      "Brand application title not found in env var EKG_PROJECT_LONG."
    )
  }
  let brandResourceName: string
  try {
    const brandClient = new GcpOAuthBrandClient(
      options.gcpOauthProjectId!,
      identity
    )
    await brandClient.initialize()
    brandResourceName = await brandClient.createOrGetBrand(appTitle)
    if (!brandResourceName || !brandResourceName.includes("/brands/")) {
      throw new SetupAuthError(
        `Failed to create or retrieve a valid brand resource name. Received: ${brandResourceName}`
      )
    }
    console.log(`✅ Ensured OAuth Brand exists: ${brandResourceName}`)
    // Save the Brand Resource Name to env
    await updateOrAddEnvVariable(
      GCP_OAUTH_BRAND_RESOURCE_NAME,
      brandResourceName
    )
    console.log(
      `✅ Saved Brand resource name to .env.local as ${GCP_OAUTH_BRAND_RESOURCE_NAME}`
    )
  } catch (brandError) {
    console.error("❌ Failed to create or get OAuth Brand:", brandError)
    // Make this error fatal - no fallback
    throw new SetupAuthError(
      "Failed to ensure OAuth Brand exists. Cannot proceed.",
      { cause: brandError }
    )
  }
  // --- End Step 4.5 ---

  // --- Step 5 ---
  console.log("\n--- Step 5: Create the service account ---")
  const serviceAccountId = "oauth-redirect-updater"
  const serviceAccountName = "OAuth Redirect URI Updater"
  const serviceAccountDescription =
    "Updates OAuth redirect URIs for Vercel deployments"
  const serviceAccountEmail = `${serviceAccountId}@${options.gcpOauthProjectId!}.iam.gserviceaccount.com`
  try {
    const response = (await gcpCallAPI(
      `https://iam.googleapis.com/v1/projects/${options.gcpOauthProjectId}/serviceAccounts`,
      "POST",
      {
        accountId: serviceAccountId,
        serviceAccount: {
          displayName: serviceAccountName,
          description: serviceAccountDescription,
        },
      }
    )) as GcpServiceAccountResponse
    console.log(`✅ Service account created: ${response.email}`)
  } catch (error) {
    let isAlreadyExistsError = false
    // Check if it's our SetupAuthError containing an Axios error with the specific 409 status
    if (
      error instanceof SetupAuthError &&
      error.originalError &&
      axios.isAxiosError(error.originalError)
    ) {
      const axiosError = error.originalError
      interface ErrorBody {
        error?: { status?: string }
      }
      const responseData = axiosError.response?.data as ErrorBody | undefined
      if (
        axiosError.response?.status === 409 &&
        responseData?.error?.status === "ALREADY_EXISTS"
      ) {
        isAlreadyExistsError = true
      }
    } else if (
      error instanceof Error &&
      error.message?.includes("ALREADY_EXISTS")
    ) {
      // Catch cases where the raw error might indicate existence
      // Be cautious here, might need refinement based on actual error types
      isAlreadyExistsError = true
    }

    if (isAlreadyExistsError) {
      // Log the user-friendly info message
      console.log(`ℹ️ Service account '${serviceAccountId}' already exists.`)
    } else {
      // Log and re-throw unexpected errors
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      console.error(
        `Failed to create service account (re-throwing): ${errorMessage}`
      )
      throw error // Re-throw unexpected errors
    }
  }

  // --- Step 6 ---
  console.log("\n--- Step 6: Assign roles to service account ---")
  await assignRolesToServiceAccount(
    options.gcpOauthProjectId!,
    serviceAccountEmail
  )

  // --- Step 7: Ensure Single Service Account Key --- > REFACTORED
  console.log(
    `\n--- Step 7: Ensure single key file for service account ${serviceAccountEmail}... ---`
  )
  const keyDir = path.resolve(process.cwd(), ".gcp")
  const keyPath = path.join(keyDir, "oauth-redirect-updater-key.json")
  const keyResourcePathBase = `projects/${options.gcpOauthProjectId}/serviceAccounts/${serviceAccountEmail}`

  try {
    // 1. List existing user-managed keys
    console.log("Listing existing user-managed keys...")
    let existingKeys: { name: string }[] = []
    try {
      const listResponse = (await gcpCallAPI(
        `https://iam.googleapis.com/v1/${keyResourcePathBase}/keys?keyTypes=USER_MANAGED`,
        "GET"
      )) as GcpServiceAccountKeysResponse
      existingKeys = listResponse?.keys || [] // Assuming the response has a 'keys' array
      console.log(`Found ${existingKeys.length} existing user-managed key(s).`)
    } catch (listError) {
      // If listing fails (e.g., 404 if no keys?), treat as no keys found, but log warning
      if (
        listError instanceof SetupAuthError &&
        listError.originalError &&
        axios.isAxiosError(listError.originalError) &&
        listError.originalError.response?.status === 404
      ) {
        console.log("No existing user-managed keys found (API returned 404).")
        existingKeys = []
      } else {
        console.warn(
          "Warning: Failed to list existing keys, proceeding with creation attempt anyway.",
          listError
        )
      }
    }

    // 2. Delete existing user-managed keys
    if (existingKeys.length > 0) {
      console.log("Deleting existing user-managed keys...")
      for (const key of existingKeys) {
        const keyId = key.name.split("/").pop()
        console.log(`Deleting key: ${keyId}...`)
        try {
          // Use the full key name (resource path) for deletion
          await gcpCallAPI(
            `https://iam.googleapis.com/v1/${key.name}`,
            "DELETE"
          )
          console.log(`Deleted key: ${keyId}`)
        } catch (deleteError) {
          // Log warning but continue trying to delete others and create new
          console.warn(`Warning: Failed to delete key ${keyId}.`, deleteError)
        }
      }
      console.log("Finished deleting existing keys.")
      // Add a small delay after deleting keys
      await sleep(2000)
    }

    // 3. Create a new key
    console.log("Creating new service account key...")
    const keyResponse = (await gcpCallAPI(
      `https://iam.googleapis.com/v1/${keyResourcePathBase}/keys`,
      "POST",
      {
        privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE",
        keyAlgorithm: "KEY_ALG_RSA_2048",
      }
    )) as GcpServiceAccountKeyResponse

    if (!keyResponse?.privateKeyData) {
      throw new SetupAuthError(
        "Failed to retrieve private key data from new key creation response."
      )
    }
    const keyData = Buffer.from(keyResponse.privateKeyData, "base64").toString(
      "utf-8"
    )

    // 4. Save key file and update env
    await fs.mkdir(keyDir, { recursive: true })
    await fs.writeFile(keyPath, keyData)
    console.log(`✅ New key file created successfully at ${keyPath}`)
    await updateOrAddEnvVariable(GCP_OAUTH_APPLICATION_CREDENTIALS, keyPath)
    console.log(
      `✅ Service account key path saved to .env.local as ${GCP_OAUTH_APPLICATION_CREDENTIALS}`
    )
  } catch (keyError) {
    console.error(`❌ Error during Step 7 (Ensure Single Key):`, keyError)
    throw new SetupAuthError(
      "Failed during service account key management. Cannot proceed.",
      { cause: keyError }
    )
  }

  // --- Final Wait ---
  // Wait for IAM propagation: try to list keys for the service account, retry if permission denied
  await waitForIamPropagation(
    async () => {
      try {
        // Try listing keys; if it works, propagation is done
        await gcpCallAPI(
          `https://iam.googleapis.com/v1/${keyResourcePathBase}/keys?keyTypes=USER_MANAGED`,
          "GET"
        )
        return true
      } catch (err: unknown) {
        // If error is permission denied, return false to retry; otherwise, rethrow
        const msg = err instanceof Error ? err.message : String(err)
        if (
          msg.includes("PERMISSION_DENIED") ||
          msg.includes("not authorized")
        ) {
          return false
        }
        throw err
      }
    },
    {
      timeoutMs: 30000,
      intervalMs: 2000,
      description: "service account IAM propagation",
    }
  )
}

// Updated to use imported PROJECT_ROLES
async function assignRolesToServiceAccount(
  gcpOauthProjectId: string,
  serviceAccountEmail: string
): Promise<void> {
  // Grant Project Owner instead of Editor
  const requiredRoles = [
    PROJECT_ROLES.OWNER,
    PROJECT_ROLES.LOGGING_WRITER,
    PROJECT_ROLES.SERVICE_USAGE_ADMIN,
    PROJECT_ROLES.SERVICE_USAGE_CONSUMER,
    PROJECT_ROLES.IAP_SETTINGS_ADMIN,
    "roles/iap.admin",
    PROJECT_ROLES.SERVICE_MANAGEMENT_ADMIN,
  ]
  const serviceAccountMember = `serviceAccount:${serviceAccountEmail}`
  let policyModified = false

  try {
    console.log(
      `Fetching current IAM policy for project ${gcpOauthProjectId}...`
    )
    // TODO: Why not use the google SDK libaries to get the current policy? And/or use the GcpProjectIamManager class?
    const currentPolicyResponse = (await gcpCallAPI(
      `https://cloudresourcemanager.googleapis.com/v1/projects/${gcpOauthProjectId}:getIamPolicy`,
      "POST"
    )) as GcpIamPolicy

    const currentPolicy: GcpIamPolicy = currentPolicyResponse || {
      bindings: [],
    }
    currentPolicy.bindings = currentPolicy.bindings || []

    for (const role of requiredRoles) {
      let binding = currentPolicy.bindings.find(b => b.role === role)

      if (binding) {
        binding.members = binding.members || []
        if (!binding.members.includes(serviceAccountMember)) {
          console.log(
            `Adding ${serviceAccountMember} to existing role ${role}...`
          )
          binding.members.push(serviceAccountMember)
          policyModified = true
        }
      } else {
        console.log(
          `Creating new binding for role ${role} with member ${serviceAccountMember}...`
        )
        binding = { role, members: [serviceAccountMember] }
        currentPolicy.bindings.push(binding)
        policyModified = true
      }
    }

    if (policyModified) {
      console.log(
        `Setting updated IAM policy for project ${gcpOauthProjectId}...`
      )
      await gcpCallAPI(
        `https://cloudresourcemanager.googleapis.com/v1/projects/${gcpOauthProjectId}:setIamPolicy`,
        "POST",
        { policy: currentPolicy }
      )
      console.log(`✅ Successfully updated IAM policy.`)
    } else {
      console.log(
        "ℹ️ All required roles already assigned to service account. No policy update needed."
      )
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new SetupAuthError(
        `Failed to assign roles to service account: ${error.message}`,
        { cause: error }
      )
    }
    throw new SetupAuthError(
      "Failed to assign roles to service account: Unknown error",
      { cause: error }
    )
  }
}
