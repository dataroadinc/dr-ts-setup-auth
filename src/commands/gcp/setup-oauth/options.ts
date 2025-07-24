/**
 * Deal with the checking the options provided to the command:
 *
 * `setup-auth gcp-setup-oauth <options>`
 */

import { PlatformType, SetupAuthGlobalOptions } from "../../../types/index.js"
import {
  EKG_PROJECT_LONG,
  GCP_OAUTH_BRAND_NAME,
} from "../../../utils/env-handler.js"
import { SetupAuthError } from "../../../utils/error.js"

/**
 * CLI command options for GCP OAuth setup.
 * Extends SetupAuthGlobalOptions to include all global options.
 */
export type GcpSetupOAuthOptions = SetupAuthGlobalOptions

/**
 * Checks and populates options for the gcp-setup-oauth command.
 * Reads from command line options and environment variables.
 * Throws SetupAuthError if required options are missing or invalid.
 * Updates the passed options object directly.
 */
export async function checkOptions(
  options: GcpSetupOAuthOptions
): Promise<void> {
  // Return void, throw on error

  // --- Platform ---
  const platform = options.platform || process.env.PLATFORM
  if (!platform) {
    throw new SetupAuthError(
      "Platform type must be provided via --platform or PLATFORM env var."
    )
  }
  if (!["vercel", "netlify", "opennext"].includes(platform)) {
    throw new SetupAuthError(
      `Invalid platform specified: ${platform}. Valid options are 'vercel', 'netlify', 'opennext'.`
    )
  }
  options.platform = platform as PlatformType
  console.log(`Platform: ${platform}`)

  // --- Project ID ---
  const projectId = options.gcpOauthProjectId || process.env.GCP_PROJECT_ID
  if (!projectId) {
    throw new SetupAuthError(
      "GCP Project ID must be provided via --gcp-oauth-project-id or GCP_PROJECT_ID env var."
    )
  }
  options.gcpOauthProjectId = projectId
  console.log(`Using explicitly provided GCP project ID: ${projectId}`)

  // --- Organization ID ---
  const organizationId =
    options.gcpOauthOrganizationId || process.env.GCP_ORGANIZATION_ID
  if (!organizationId) {
    throw new SetupAuthError(
      "GCP Organization ID must be provided via --gcp-oauth-organization-id or GCP_ORGANIZATION_ID env var."
    )
  }
  options.gcpOauthOrganizationId = organizationId
  console.log(
    `Using explicitly provided GCP organization ID: ${organizationId}`
  )

  // --- Brand Name ---
  let oauthBrandName = options.oauthBrandName
  if (!oauthBrandName) {
    oauthBrandName = process.env[GCP_OAUTH_BRAND_NAME]
    if (oauthBrandName) {
      console.log(
        `Using GCP OAuth Brand Name from environment variable ${GCP_OAUTH_BRAND_NAME}: ${oauthBrandName}`
      )
    } else {
      oauthBrandName = process.env[EKG_PROJECT_LONG]
      if (oauthBrandName) {
        console.log(
          `Using Brand Name from environment variable ${EKG_PROJECT_LONG}: ${oauthBrandName}`
        )
      } else {
        throw new SetupAuthError(
          `Could not determine brand name. Please set --oauth-brand-name option, ` +
            `or set ${GCP_OAUTH_BRAND_NAME} or ${EKG_PROJECT_LONG} in your environment.`
        )
      }
    }
  }
  options.oauthBrandName = oauthBrandName
  console.log(`Using OAuth Brand Name: ${oauthBrandName}`)

  // --- Vercel Project Name (Conditional) ---
  if (options.platform === "vercel") {
    const vercelProjectName =
      options.vercelProjectName || process.env.VERCEL_PROJECT_NAME
    if (!vercelProjectName) {
      throw new SetupAuthError(
        "Vercel project name must be provided via --vercel-project-name or VERCEL_PROJECT_NAME env var for Vercel platform."
      )
    }
    options.vercelProjectName = vercelProjectName
    console.log(`Using specified Vercel project name: ${vercelProjectName}`)
  } else {
    // Ensure it's not set if platform isn't Vercel to avoid confusion
    options.vercelProjectName = undefined
  }

  // Removed old checks relying on separate helpers
  // const result1 = await gcpCheckOauthProjectId({ gcpOauthProjectId: options.gcpOauthProjectId! });
  // if (!result1.success) throw new SetupAuthError(result1.error!);
  // const result2 = await gcpCheckOauthOrganizationId({ gcpOauthOrganizationId: options.gcpOauthOrganizationId! });
  // if (!result2.success) throw new SetupAuthError(result2.error!);
  // const result3 = await gcpCheckOauthBrandName({ oauthBrandName: options.oauthBrandName! });
  // if (!result3.success) throw new SetupAuthError(result3.error!);

  // No need to return success/error, just complete or throw
}
