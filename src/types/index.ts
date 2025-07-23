export interface SuccessOrError {
  success: boolean
  error?: string
}

/**
 * Configuration for the OAuth redirect URLs
 */
export interface RedirectUrlsConfig {
  /** GCP project ID */
  gcpOauthProjectId: string
  /** OAuth client ID (without the .apps.googleusercontent.com suffix) */
  clientId: string
  /** Additional URLs to include in the redirect URIs */
  additionalUrls?: string[]
  /** Wildcard patterns to include in the redirect URIs */
  wildcardPatterns?: string[]
}

/**
 * OAuth oauthProvider types supported by the setup-auth package
 */
export type OAuthProvider = "gcp" | "github" | "azure" | "linkedin"

/**
 * Platform types supported by the setup-auth package
 */
export type PlatformType = "vercel" | "opennext" | "netlify"

/**
 * Global options for the setup-auth package
 */
export interface SetupAuthGlobalOptions {
  /** OAuth brand name */
  oauthBrandName?: string
  /** OAuth oauthProvider */
  oauthProvider?: OAuthProvider
  /** Platform to use for the setup */
  platform?: PlatformType
  /** Vercel project name */
  vercelProjectName?: string
  /** Vercel access token */
  vercelAccessToken?: string
  /** Azure client ID */
  azureOauthClientId?: string
  /** Azure client secret */
  azureOauthSecret?: string
  /** GitHub OAuth ID */
  githubOauthId?: string
  /** GitHub OAuth secret */
  githubOauthSecret?: string
  /** GCP OAuth project ID */
  gcpOauthProjectId?: string
  /** GCP OAuth quota project ID */
  gcpOauthQuotaProjectId?: string
  /** GCP OAuth organization ID */
  gcpOauthOrganizationId?: string
  /** GCP OAuth allowed domains */
  gcpOauthAllowedDomains?: string
  /** NextAuth URL */
  nextAuthUrl?: string
}

/**
 * Result of updating redirect URLs
 */
export interface UpdateResult {
  /** Whether the update was successful */
  success: boolean
  /** Any error message if the update failed */
  error?: string
  /** The redirect URIs that were set or would be set in simulation mode */
  redirectUris?: string[]
}
