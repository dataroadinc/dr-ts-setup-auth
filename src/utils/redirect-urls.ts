import { GCPRedirectUrlsOptions } from "../commands/update-redirect-urls.js"
import { DEFAULT_CALLBACK_PATHS } from "../constants/defaults.js"
import {
  OAuthProvider,
  PlatformType,
  RedirectUrlsConfig,
} from "../types/index.js"

/**
 * Derive some redirect options from environment variables
 *
 * @param options `BuildRedirectUriListOptions`
 * @returns The redirect options as a `RedirectUrlsConfig` object
 */
export async function getRedirectOptions(
  options: GCPRedirectUrlsOptions
): Promise<RedirectUrlsConfig> {
  // Try to load from environment variables first
  const envProjectId = process.env.GCP_OAUTH_PROJECT_ID
  if (!envProjectId) {
    throw new Error(
      "GCP_OAUTH_PROJECT_ID is not set. Make sure it is set in your environment variables."
    )
  }
  const envClientId = process.env.GCP_OAUTH_CLIENT_ID?.replace(
    /\.apps\.googleusercontent\.com$/,
    ""
  )
  if (!envClientId) {
    throw new Error(
      "GCP_OAUTH_CLIENT_ID is not set. Make sure it is set in your environment variables."
    )
  }

  console.log("Using configuration from environment variables")
  return {
    gcpOauthProjectId: envProjectId,
    clientId: envClientId,
    additionalUrls: process.env.ADDITIONAL_REDIRECT_URLS?.split(","),
    wildcardPatterns: getDefaultWildcardPatterns(
      options.platform || "vercel",
      options.oauthProvider || "google"
    ),
  }
}

/**
 * Build a list of all needed redirect URIs
 *
 * @param options Options for building the redirect URI list
 * @returns List of redirect URIs
 */
export function buildRedirectUriList(
  options: GCPRedirectUrlsOptions
): string[] {
  const {
    redirectOptions,
    deploymentUrl,
    platform,
    oauthProvider,
    callbackPath,
  } = options

  if (!platform) {
    throw new Error(
      "Platform is not set. Make sure it is set in your environment variables."
    )
  }
  if (!oauthProvider) {
    throw new Error(
      "Provider is not set. Make sure it is set in your environment variables."
    )
  }

  const redirectUris: Set<string> = new Set()

  // Get the callback path for this oauthProvider
  const providerCallbackPath =
    callbackPath ||
    DEFAULT_CALLBACK_PATHS[oauthProvider] ||
    `/api/auth/callback/${oauthProvider}`

  // Add the main deployment URL for this platform
  const productionUrl = getPlatformDeploymentUrl(platform, providerCallbackPath)
  if (productionUrl) {
    redirectUris.add(productionUrl)
  }

  // Add the current deployment URL if available
  if (deploymentUrl) {
    // Ensure the URL has the correct format
    const fullUrl = deploymentUrl.startsWith("https://")
      ? `${deploymentUrl}${providerCallbackPath}`
      : `https://${deploymentUrl}${providerCallbackPath}`

    redirectUris.add(fullUrl)
    console.log(`Added current deployment URL: ${fullUrl}`)
  }

  // Add any additional URLs from redirectOptions
  if (redirectOptions.additionalUrls) {
    for (const url of redirectOptions.additionalUrls) {
      if (url && url.trim()) {
        redirectUris.add(url.trim())
        console.log(`Added additional URL: ${url.trim()}`)
      }
    }
  }

  // Add wildcard patterns if specified
  if (redirectOptions.wildcardPatterns) {
    for (const pattern of redirectOptions.wildcardPatterns) {
      if (pattern && pattern.trim()) {
        redirectUris.add(pattern.trim())
        console.log(`Added wildcard pattern: ${pattern.trim()}`)
      }
    }
  }

  return Array.from(redirectUris)
}

/**
 * Get the production URL for the specified platform and oauthProvider
 *
 * @param platform The platform
 * @param oauthProvider The authentication oauthProvider
 * @param callbackPath The callback path
 * @returns The production URL
 */
function getPlatformDeploymentUrl(
  platform: PlatformType,
  callbackPath: string
): string | null {
  // Could be extended with more platforms and custom domains
  const projectName =
    process.env.EKG_PROJECT_NAME ||
    process.env.PROJECT_NAME ||
    "your-project-name"

  switch (platform) {
    case "vercel":
      return `https://${projectName}.vercel.app${callbackPath}`
    case "netlify":
      return `https://${projectName}.netlify.app${callbackPath}`
    case "opennext":
      // For OpenNext, usually custom domains
      return process.env.PRODUCTION_URL
        ? `${process.env.PRODUCTION_URL}${callbackPath}`
        : null
    default:
      return null
  }
}

/**
 * Get default wildcard patterns for the specified platform and oauthProvider
 *
 * @param platform The platform
 * @param oauthProvider The authentication oauthProvider
 * @returns Default wildcard patterns
 */
function getDefaultWildcardPatterns(
  platform: PlatformType,
  oauthProvider: OAuthProvider
): string[] {
  const projectName =
    process.env.EKG_PROJECT_NAME ||
    process.env.PROJECT_NAME ||
    "your-project-name"
  const callbackPath =
    DEFAULT_CALLBACK_PATHS[oauthProvider] ||
    `/api/auth/callback/${oauthProvider}`

  switch (platform) {
    case "vercel":
      return [`https://${projectName}-*${callbackPath}`]
    case "netlify":
      return [`https://deploy-preview-*--${projectName}${callbackPath}`]
    default:
      return []
  }
}
