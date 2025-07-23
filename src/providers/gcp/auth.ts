// utils/google-auth.ts
import { SetupAuthError } from "@/utils/error.js"
import { ProjectsClient } from "@google-cloud/resource-manager"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAuthClient = any // Reverted to any

/**
 * Get authentication object for Google Cloud APIs
 * @param gcpOauthProjectId Optional project ID to use
 * @returns Authentication object with auth methods
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function gcpGetAuth(gcpOauthProjectId?: string): Promise<any> {
  // Reverted to any
  try {
    // Create resource manager client using application default credentials
    const projectsClient = new ProjectsClient({
      projectId: gcpOauthProjectId,
    })

    return projectsClient.auth
  } catch (error) {
    throw new SetupAuthError(
      "Authentication failed.\nEnsure you ran `gcloud auth application-default login`:",
      { cause: error }
    )
  }
}

/**
 * Get an authenticated client for Google Cloud APIs
 * @returns Authenticated client
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function gcpGetAuthClient(): Promise<any> {
  // Reverted to any
  try {
    const auth = await gcpGetAuth()
    const client = await auth.getClient()
    return client
  } catch (error) {
    throw new SetupAuthError("Error getting auth client:", { cause: error })
  }
}

/**
 * Get an access token for GCP APIs.
 * @returns Access token string
 */
export async function gcpGetAccessToken(): Promise<string> {
  if (process.env.GCP_ACCESS_TOKEN) {
    return process.env.GCP_ACCESS_TOKEN
  }

  try {
    // Retrieve the authentication client
    const authClient = await gcpGetAuthClient()

    // Fetch the access token
    const accessToken = await authClient.getAccessToken()

    // Handle the response format
    if (typeof accessToken === "string") {
      process.env.GCP_ACCESS_TOKEN = accessToken
      return accessToken
    } else if (accessToken && "token" in accessToken) {
      if (!accessToken.token) {
        throw new Error("Access token is undefined or invalid")
      }
      process.env.GCP_ACCESS_TOKEN = accessToken.token
      return accessToken.token
    } else {
      throw new Error("Access token is undefined or invalid")
    }
  } catch (error) {
    throw new SetupAuthError("Error retrieving access token:", { cause: error })
  }
}

export async function gcpGetAuthorizationHeader(): Promise<string> {
  const accessToken = await gcpGetAccessToken()
  return `Bearer ${accessToken}`
}

// GcpGetCurrentUserEmail function removed as logic moved to GcpAuthenticatedIdentity subclasses
