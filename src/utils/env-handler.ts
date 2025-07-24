/**
 * This file is used to deal with storing and updating environment variables
 * in the root .env.local file.
 *
 * TODO: One day we should support an environment name as a parameter,
 *       and use that environment's `.env.<env-name>` file instead.
 *       For example, for a vercel project, we would use something like
 *       `.env.vercel.<production|preview|development>` etc.
 */
import { GcpCloudCliClient } from "../providers/gcp/cloud-cli-client.js"
import { config } from "dotenv"
import * as fs from "fs/promises"
import * as path from "path"
import { SetupAuthError } from "./error.js"
import { fileExists } from "./file.js"

export const AZURE_AD_CLIENT_ID = "AZURE_AD_CLIENT_ID"
export const AZURE_AD_CLIENT_SECRET = "AZURE_AD_CLIENT_SECRET"
export const AZURE_AD_TENANT_ID = "AZURE_AD_TENANT_ID"
export const EKG_BASE_EXTERNAL = "EKG_BASE_EXTERNAL"
export const EKG_ORG_LONG = "EKG_ORG_LONG"
export const EKG_ORG_SHORT = "EKG_ORG_SHORT"
export const EKG_PROJECT_DESCRIPTION = "EKG_PROJECT_DESCRIPTION"
export const EKG_PROJECT_LABEL = "EKG_PROJECT_LABEL"
export const EKG_PROJECT_LONG = "EKG_PROJECT_LONG"
export const EKG_PROJECT_NAME = "EKG_PROJECT_NAME"
export const EKG_PROJECT_SHORT = "EKG_PROJECT_SHORT"
export const GCP_OAUTH_ALLOWED_DOMAINS = "GCP_OAUTH_ALLOWED_DOMAINS"
export const GCP_OAUTH_CLIENT_ID = "GCP_OAUTH_CLIENT_ID"
export const GCP_OAUTH_CLIENT_SECRET = "GCP_OAUTH_CLIENT_SECRET"
export const GCP_OAUTH_ORGANIZATION_ID = "GCP_OAUTH_ORGANIZATION_ID"
export const GCP_OAUTH_ORIGINS = "GCP_OAUTH_ORIGINS"
export const GCP_OAUTH_PROJECT_ID = "GCP_OAUTH_PROJECT_ID"
export const GCP_OAUTH_QUOTA_PROJECT_ID = "GCP_OAUTH_QUOTA_PROJECT_ID"
export const GCP_OAUTH_BRAND_NAME = "GCP_OAUTH_BRAND_NAME"
export const GCP_OAUTH_REDIRECT_URIS = "GCP_OAUTH_REDIRECT_URIS"
export const GCP_OAUTH_APPLICATION_CREDENTIALS =
  "GCP_OAUTH_APPLICATION_CREDENTIALS"
export const GCP_OAUTH_BRAND_RESOURCE_NAME = "GCP_OAUTH_BRAND_RESOURCE_NAME"
export const GITHUB_OAUTH_ID = "GITHUB_OAUTH_ID"
export const GITHUB_OAUTH_ID_PROD = "GITHUB_OAUTH_ID_PROD"
export const GITHUB_OAUTH_SECRET = "GITHUB_OAUTH_SECRET"
export const GITHUB_OAUTH_SECRET_PROD = "GITHUB_OAUTH_SECRET_PROD"
export const NEXTAUTH_URL = "NEXTAUTH_URL"
export const VERCEL_ACCESS_TOKEN = "VERCEL_ACCESS_TOKEN"
export const VERCEL_PROJECT_NAME = "VERCEL_PROJECT_NAME"
export const VERCEL_TEAM_ID = "VERCEL_TEAM_ID"
export const VERCEL_PROJECT_ID = "VERCEL_PROJECT_ID"

/**
 * Validate that all required environment variables are set.
 */
export function validateRequiredEnvVars(): void {
  // Check if we're running the gcp-setup-oauth command
  const isSetupOAuthCommand = process.argv.includes("gcp-setup-oauth")

  // Base required variables for all commands
  const requiredVars = [
    GCP_OAUTH_ALLOWED_DOMAINS,
    GCP_OAUTH_ORGANIZATION_ID,
    GCP_OAUTH_PROJECT_ID,
    GCP_OAUTH_APPLICATION_CREDENTIALS,
    VERCEL_TEAM_ID,
    VERCEL_PROJECT_ID,
  ]

  // Only require OAuth client variables for commands other than gcp-setup-oauth
  // This allows gcp-setup-oauth to create these automatically
  if (!isSetupOAuthCommand) {
    requiredVars.push(GCP_OAUTH_CLIENT_ID, GCP_OAUTH_CLIENT_SECRET)
  }

  const missing = requiredVars.filter(
    v => !process.env[v] || process.env[v]?.trim() === ""
  )
  if (missing.length > 0) {
    throw new SetupAuthError(
      `Missing required environment variables: ${missing.join(", ")}.\n` +
        "Please set these in your .env.local file before running setup-auth.\n" +
        "See the documentation for details on required variables."
    )
  }
}

export async function loadEnvVariables(): Promise<void> {
  // Only load environment variables from the root .env.local file
  // We're in a monorepo, so we should use the root .env.local
  const envFilePath = getEnvFilePath()
  if (await fileExists(envFilePath)) {
    config({ path: envFilePath })
    // console.log(`Loaded environment from ${envFilePath}`);
    // Validate required env vars after loading
    validateRequiredEnvVars()
  } else {
    console.error(
      "Root .env.local file not found. Some features may not work correctly."
    )
    process.exit(1)
  }
}

/**
 * Store the GCP project ID (GCP_OAUTH_PROJECT_ID) in the root .env.local file.
 */
export async function gcpStoreOAuthProjectID(
  gcpOauthProjectId: string
): Promise<void> {
  try {
    await updateOrAddEnvVariable(GCP_OAUTH_PROJECT_ID, gcpOauthProjectId)
    console.log(
      `✅ Stored GCP project ID in root .env.local: ${gcpOauthProjectId}`
    )
  } catch (error) {
    throw new SetupAuthError(
      `❌ Failed to store GCP project ID in root .env.local:`,
      { cause: error }
    )
  }
}

/**
 * Store the GCP organization ID (GCP_OAUTH_ORGANIZATION_IDin the root .env.local file.
 */
export async function gcpStoreOAuthOrganizationID(
  organizationId: string
): Promise<void> {
  try {
    await updateOrAddEnvVariable(GCP_OAUTH_ORGANIZATION_ID, organizationId)
    console.log(
      `✅ Stored GCP organization ID in root .env.local: ${GCP_OAUTH_ORGANIZATION_ID}=${organizationId}`
    )
  } catch (error) {
    throw new SetupAuthError(
      `❌ Failed to store GCP organization ID in root .env.local:`,
      { cause: error }
    )
  }
}

/**
 * Update or add an environment variable in the .env.local file.
 */
export async function updateOrAddEnvVariable(
  key: string,
  value: string | string[] | undefined
): Promise<void> {
  if (Array.isArray(value)) {
    value = value.join(",")
  }

  const envFilePath = getEnvFilePath()

  let envContent = ""
  let updatedKey = false
  let valueToUse = value || ""

  if (await fileExists(envFilePath)) {
    const lines = (await fs.readFile(envFilePath, "utf8")).split("\n")

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(`${key}=`)) {
        const existingValue = lines[i].replace(`${key}=`, "").trim()

        if (existingValue === valueToUse) {
          return
        }

        lines[i] = `${key}=${valueToUse}`
        updatedKey = true
        break
      }
    }

    if (!updatedKey) {
      lines.push(`${key}=${valueToUse}`)
    }

    envContent = lines.join("\n")
  } else {
    envContent = `${key}=${value}\n`
  }

  await fs.writeFile(envFilePath, envContent)
}

/**
 * Get the absolute path to the .env.local file.
 *
 * TODO: This should eventually support the current environment name as a parameter,
 *       and use that environment's `.env.<env-name>` file instead.
 */
function getEnvFilePath(): string {
  return path.resolve(process.cwd(), ".env.local")
}

/**
 * Update .env.local with GCP OAuth credentials
 */
export async function updateEnvFileWithOAuth(
  clientId: string,
  clientSecret: string,
  allowedDomains?: string
): Promise<void> {
  try {
    await updateOrAddEnvVariable(GCP_OAUTH_CLIENT_ID, clientId)
    await updateOrAddEnvVariable(GCP_OAUTH_CLIENT_SECRET, clientSecret)
    await updateOrAddEnvVariable(GCP_OAUTH_ALLOWED_DOMAINS, allowedDomains)

    console.log(`✅ Updated root .env.local with OAuth credentials`)
  } catch (error) {
    throw new SetupAuthError("❌ Failed to update .env.local file:", {
      cause: error,
    })
  }
}

/**
 * Get GCP OAuth project ID from env or create one with a random suffix
 */
export function gcpGetOAuthProjectID(baseProjectName?: string): string {
  if (process.env[GCP_OAUTH_PROJECT_ID]) {
    return process.env[GCP_OAUTH_PROJECT_ID]!.trim()
  }

  if (!baseProjectName) {
    if (process.env.EKG_PROJECT_NAME) {
      baseProjectName = process.env.EKG_PROJECT_NAME
    } else {
      throw new SetupAuthError("No base project name provided")
    }
  }

  // If the baseProjectName already looks like a valid GCP project ID, use it directly
  if (
    baseProjectName &&
    baseProjectName.match(/^[a-z][-a-z0-9]{4,28}[a-z0-9]$/)
  ) {
    console.log(`Using provided name as GCP project ID: ${baseProjectName}`)
    process.env[GCP_OAUTH_PROJECT_ID] = baseProjectName
    return baseProjectName
  }

  // Generate a random 5-digit number
  const randomSuffix = Math.floor(10000 + Math.random() * 90000)

  // Create a GCP compatible project ID (lowercase letters, numbers, and hyphens)
  const sanitizedBase = baseProjectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-") // Replace invalid chars with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, "") // Remove leading/trailing hyphens

  // Ensure the final ID is not too long (max 30 chars for GCP project IDs)
  const maxBaseLength = 23 // 30 - 1 (hyphen) - 6 (suffix with hyphen)
  const truncatedBase = sanitizedBase.substring(0, maxBaseLength)

  // Create the final project ID
  const projectID = `${truncatedBase}-${randomSuffix}`

  console.log(`Generated GCP project ID with random suffix: ${projectID}`)
  process.env[GCP_OAUTH_PROJECT_ID] = projectID
  return projectID
}

/**
 * Returns the email associated with the current Application Default Credentials (ADC) token, or null if not available.
 */
export async function getAdcEmailOrNull(): Promise<string | null> {
  try {
    const cli = new GcpCloudCliClient()
    return await cli.getAdcEmail()
  } catch {
    return null
  }
}

/**
 * Enforces that the authenticated user's email domain matches the required org domain.
 * Throws SetupAuthError if EKG_ORG_PRIMARY_DOMAIN is missing or does not match userEmail.
 */
export function enforceUserDomainOrFail(userEmail: string): void {
  const expectedDomain = process.env.EKG_ORG_PRIMARY_DOMAIN
  if (!expectedDomain) {
    throw new SetupAuthError(
      "Missing required environment variable: EKG_ORG_PRIMARY_DOMAIN. This tool enforces a fail-fast approach and requires this variable to be set in your .env.local (e.g., EKG_ORG_PRIMARY_DOMAIN=your-domain.com).",
      { cause: new Error("EKG_ORG_PRIMARY_DOMAIN not set") }
    )
  }
  const userDomain = userEmail?.split("@")[1] || ""
  if (userDomain.toLowerCase() !== expectedDomain.toLowerCase()) {
    throw new SetupAuthError(
      `Authenticated user (${userEmail}) does not match the required organization domain (${expectedDomain}).\n` +
        `Please run 'gcloud auth login <your-user>@${expectedDomain}' and try again.`,
      {
        cause: new Error(
          `User domain mismatch: got ${userDomain}, expected ${expectedDomain}`
        ),
      }
    )
  }
}

export async function hookSaveEnvironmentVariables(): Promise<void> {
  console.log("hookSaveEnvironmentVariables")
}

/**
 * Prints both the gcloud active account and the ADC account (email) to the console.
 */
export async function printGcloudAndAdcAccounts(): Promise<void> {
  try {
    const cli = new GcpCloudCliClient()
    const gcloudAccount = await cli.getActiveAccount()
    const adcEmail = await cli.getAdcEmail()
    console.log(`gcloud active account: ${gcloudAccount || "(not set)"}`)
    console.log(
      `ADC (Application Default Credentials) account: ${adcEmail || "(not set)"}`
    )
  } catch {
    console.warn("Could not print gcloud/ADC account info.")
  }
}
