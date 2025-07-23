import {
  GCP_OAUTH_ALLOWED_DOMAINS,
  GCP_OAUTH_CLIENT_ID,
  GCP_OAUTH_CLIENT_SECRET,
} from "@/utils/env-handler.js"

/**
 * Get existing OAuth credentials from the environment, this function
 * assumes that loadEnvVariables() has already been called.
 */
export async function checkExistingOAuthSettings(): Promise<{
  hasClientId: boolean
  hasClientSecret: boolean
  hasAllowedDomains: boolean
  clientId: string | undefined
  clientSecret: string | undefined
  allowedDomains: string | undefined
}> {
  const result = {
    hasClientId: false,
    hasClientSecret: false,
    hasAllowedDomains: false,
    clientId: undefined as string | undefined,
    clientSecret: undefined as string | undefined,
    allowedDomains: undefined as string | undefined,
  }

  if (process.env[GCP_OAUTH_CLIENT_ID]) {
    result.hasClientId = true
    result.clientId = process.env[GCP_OAUTH_CLIENT_ID]!
  }

  if (process.env[GCP_OAUTH_CLIENT_SECRET]) {
    result.hasClientSecret = true
    result.clientSecret = process.env[GCP_OAUTH_CLIENT_SECRET]!
  }

  if (process.env[GCP_OAUTH_ALLOWED_DOMAINS]) {
    result.hasAllowedDomains = true
    result.allowedDomains = process.env[GCP_OAUTH_ALLOWED_DOMAINS]!
  }

  return result
}
