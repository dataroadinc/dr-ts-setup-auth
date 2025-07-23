import fs from "fs/promises"
import { GCP_OAUTH_APPLICATION_CREDENTIALS } from "@/utils/env-handler.js"
import { SetupAuthError } from "@/utils/error.js"
import axios from "axios"
import {
  AuthClient,
  GoogleAuth as AuthLibGoogleAuth,
  GoogleAuthOptions,
} from "google-auth-library"
import { GoogleAuth as GaxGoogleAuth } from "google-gax"

export type GcpAuthClient = {
  getAccessToken(): Promise<{ token: string | null | undefined }>
  // Add other common methods/properties used across the codebase
  projectId?: string
  quotaProjectId?: string
}

// Base class for managing GCP authentication
export abstract class GcpAuthenticatedIdentity {
  protected authLibGoogleAuth: AuthLibGoogleAuth<AuthClient>
  protected gaxGoogleAuth: GaxGoogleAuth
  protected options: GoogleAuthOptions

  constructor(options: GoogleAuthOptions) {
    this.options = options
    this.authLibGoogleAuth = new AuthLibGoogleAuth(options)
    this.gaxGoogleAuth = new GaxGoogleAuth({
      ...options,
    })
  }

  async getAccessToken(): Promise<string> {
    console.log("Getting access token...")
    try {
      const client = await this.authLibGoogleAuth.getClient()
      if (!client) {
        throw new Error("Failed to get client object from authLibGoogleAuth")
      }
      const response = await client.getAccessToken()
      if (!response || !response.token) {
        throw new Error("Failed to get access token from auth library client")
      }
      return response.token
    } catch (error) {
      throw new SetupAuthError("Failed to get access token", { cause: error })
    }
  }

  abstract getCurrentUserEmail(): Promise<string>

  /**
   * Get the base GoogleAuth client from google-auth-library.
   * Use this for most authentication needs.
   */
  async getAuthClient(): Promise<AuthLibGoogleAuth<AuthClient>> {
    return this.authLibGoogleAuth
  }

  /**
   * Get the base GoogleAuth client from google-gax.
   * Use this when working with Google Cloud client libraries that specifically need gax auth.
   */
  async getGaxAuthClient(): Promise<GaxGoogleAuth> {
    return this.gaxGoogleAuth
  }

  /**
   * Get an auth client configured for use with Resource Manager APIs
   * (organizations, projects, folders, etc.)
   */
  async getAuthClientForResourceManager(): Promise<
    AuthLibGoogleAuth<AuthClient>
  > {
    return this.authLibGoogleAuth
  }

  /**
   * Get an auth client configured for use with IAM services
   */
  async getAuthClientForIAM(): Promise<AuthLibGoogleAuth<AuthClient>> {
    return this.authLibGoogleAuth
  }

  /**
   * Get an auth client configured for use with OAuth2 services
   */
  async getAuthClientForOAuth2(): Promise<AuthLibGoogleAuth<AuthClient>> {
    return this.authLibGoogleAuth
  }
}

// Subclass for User Account Authentication (gcloud auth login)
export class GcpUserAccountIdentity extends GcpAuthenticatedIdentity {
  constructor() {
    super({
      scopes: [
        "https://www.googleapis.com/auth/cloud-platform",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      clientOptions: {
        universeDomain: "googleapis.com",
      },
    })
    console.log("Using user account authentication")
  }

  async getCurrentUserEmail(): Promise<string> {
    console.log(
      "Attempting to retrieve user email via User Account Identity..."
    )
    try {
      const token = await this.getAccessToken()
      if (!token) {
        throw new Error("No access token available for user account")
      }

      const response = await axios.get(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${token}`
      )
      if (response.data && response.data.email) {
        console.log("User email retrieved via tokeninfo:", response.data.email)
        return response.data.email
      }
      throw new SetupAuthError(
        "Could not determine user's email from tokeninfo response."
      )
    } catch (error: unknown) {
      console.warn(
        "Tokeninfo approach failed for User Account:",
        error instanceof Error ? error.message : error
      )

      function isGaxiosReauthError(err: unknown): boolean {
        if (err && typeof err === "object") {
          if (
            "response" in err &&
            typeof err.response === "object" &&
            err.response &&
            "data" in err.response
          ) {
            const data = err.response.data as {
              error_subtype?: string
              error?: string
              error_description?: string
            }
            const descriptionIncludesReauth =
              data?.error_description?.includes("reauth") ?? false
            return (
              data?.error_subtype === "invalid_rapt" ||
              (data?.error === "invalid_grant" && descriptionIncludesReauth)
            )
          }
        }
        return false
      }

      let rootCause: unknown = error
      while (rootCause instanceof SetupAuthError && rootCause.originalError) {
        rootCause = rootCause.originalError
      }

      if (isGaxiosReauthError(rootCause)) {
        throw new SetupAuthError(
          `Failed to retrieve user email.\n\n⚠️ Reauthentication required. Please log in again using:\n\n    gcloud auth login\n`,
          { cause: error }
        )
      }

      throw new SetupAuthError(
        "Failed to retrieve email for User Account. Ensure you are logged in (`gcloud auth login`) and have permissions.",
        {
          cause: error,
        }
      )
    }
  }
}

// Subclass for ADC (Application Default Credentials)
export class GcpAdcIdentity extends GcpAuthenticatedIdentity {
  constructor() {
    // Revert to simple super call letting the library handle discovery
    super({
      scopes: [
        "https://www.googleapis.com/auth/cloud-platform",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      clientOptions: {
        universeDomain: "googleapis.com",
      },
    })
    console.log("Using Application Default Credentials")
  }

  async getCurrentUserEmail(): Promise<string> {
    // Revert log message
    console.log("Attempting to retrieve user email via ADC...")
    try {
      // Revert log messages inside try block
      const token = await this.getAccessToken() // Uses the library's default mechanism
      const response = await axios.get(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${token}`
      )
      if (response.data && response.data.email) {
        console.log("ADC email retrieved via tokeninfo:", response.data.email)
        return response.data.email
      }
      throw new SetupAuthError("Could not determine email associated with ADC.")
    } catch (error: unknown) {
      // Revert log message
      console.warn(
        "Failed to retrieve email via ADC:",
        error instanceof Error ? error.message : error
      )
      function isGaxiosReauthError(err: unknown): boolean {
        if (err && typeof err === "object") {
          if (
            "response" in err &&
            typeof err.response === "object" &&
            err.response &&
            "data" in err.response
          ) {
            const data = err.response.data as {
              error_subtype?: string
              error?: string
              error_description?: string
            }
            const descriptionIncludesReauth =
              data?.error_description?.includes("reauth") ?? false
            return (
              data?.error_subtype === "invalid_rapt" ||
              (data?.error === "invalid_grant" && descriptionIncludesReauth)
            )
          }
        }
        return false
      }

      let rootCause: unknown = error
      while (rootCause instanceof SetupAuthError && rootCause.originalError) {
        rootCause = rootCause.originalError
      }

      if (isGaxiosReauthError(rootCause)) {
        throw new SetupAuthError(
          `Failed to retrieve ADC email.\n\n⚠️ Reauthentication required for Application Default Credentials. Please log in again using:\n\n    gcloud auth application-default login\n`,
          { cause: error }
        )
      }

      throw new SetupAuthError(
        "Failed to retrieve email using Application Default Credentials. Ensure ADC are configured correctly (`gcloud auth application-default login`) or provide a service account key.",
        { cause: error }
      )
    }
  }
}

// Subclass for Service Account Authentication
export class GcpServiceAccountIdentity extends GcpAuthenticatedIdentity {
  constructor(keyFilePath: string) {
    super({
      keyFile: keyFilePath,
      scopes: [
        "https://www.googleapis.com/auth/cloud-platform",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      clientOptions: {
        universeDomain: "googleapis.com",
      },
    })
    console.log(
      `Using service account authentication with key file: ${keyFilePath}`
    )
  }

  async getCurrentUserEmail(): Promise<string> {
    console.log(
      "Attempting to retrieve email address of the service account..."
    )
    try {
      const credentials = await this.authLibGoogleAuth.getCredentials()
      if (credentials.client_email) {
        console.log(
          "Service Account email from credentials:",
          credentials.client_email
        )
        return credentials.client_email
      } else {
        if (this.options.keyFile && typeof this.options.keyFile === "string") {
          try {
            const keyFileContent = await fs.readFile(
              this.options.keyFile,
              "utf-8"
            )
            const keyData = JSON.parse(keyFileContent)
            if (keyData.client_email) {
              console.log(
                "Service Account email from key file:",
                keyData.client_email
              )
              return keyData.client_email
            }
          } catch (parseError) {
            console.warn(
              "Could not parse key file to get service account email:",
              parseError
            )
          }
        }
        throw new SetupAuthError(
          "Could not determine Service Account email from credentials or key file."
        )
      }
    } catch (error) {
      throw new SetupAuthError("Failed to retrieve Service Account email.", {
        cause: error,
      })
    }
  }
}

export type AuthenticationType = "Service Account" | "ADC" | "User Account"

export type AuthenticationContext = {
  forceAuthType?: AuthenticationType
  serviceAccountPath?: string
}

/**
 * Determines the authentication type based on the command context and environment.
 * NOTE: This might be less critical now that email retrieval is in specific classes.
 */
export function detectAuthenticationType(
  context?: AuthenticationContext
): AuthenticationType {
  if (context?.forceAuthType) {
    return context.forceAuthType
  }
  if (
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    context?.serviceAccountPath
  ) {
    return "Service Account"
  }
  return "ADC"
}

export class GcpIdentityFactory {
  static createIdentity(
    context?: AuthenticationContext
  ): GcpAuthenticatedIdentity {
    const authType = detectAuthenticationType(context)

    switch (authType) {
      case "Service Account":
        return GcpIdentityFactory.createServiceAccountIdentity(
          context?.serviceAccountPath
        )
      case "ADC":
        return GcpIdentityFactory.createAdcIdentity()
      case "User Account":
        return GcpIdentityFactory.createUserIdentity()
      default:
        throw new Error(`Unsupported authentication type detected: ${authType}`)
    }
  }

  static createAdcIdentity(): GcpAuthenticatedIdentity {
    return new GcpAdcIdentity()
  }

  static createUserIdentity(): GcpAuthenticatedIdentity {
    return new GcpUserAccountIdentity()
  }

  static createServiceAccountIdentity(
    keyFilePath: string | undefined
  ): GcpAuthenticatedIdentity {
    const keyFilePath2 =
      keyFilePath || process.env[GCP_OAUTH_APPLICATION_CREDENTIALS]
    if (!keyFilePath2) {
      throw new SetupAuthError(
        `Service account key path not found in environment variable ${GCP_OAUTH_APPLICATION_CREDENTIALS}. ` +
          `Please run the 'gcp-setup-service-account' command first.`
      )
    }
    return new GcpServiceAccountIdentity(keyFilePath2)
  }
}
