// TODO: Implement GcpOAuthWebClientManager for standard OAuth2 clients (type: "Web application")
// This file previously managed IAP OAuth clients using @google-cloud/iap, which is not needed for Vercel deployments.

// The new manager will:
// - Create, list, update, and delete standard OAuth2 clients
// - Manage redirect URIs and JavaScript origins
// - Retrieve and store client ID and secret

import { GcpCloudCliClient } from "@/providers/gcp/cloud-cli-client.js"
import { SetupAuthError } from "@/utils/error.js"

export class GcpOAuthWebClientManager {
  private readonly projectId: string
  public cli: GcpCloudCliClient
  private authenticated = false

  constructor(projectId: string) {
    this.projectId = projectId
    this.cli = new GcpCloudCliClient()
  }

  /**
   * Ensures gcloud CLI is authenticated, attempting automatic authentication if needed
   */
  private async ensureAuthenticated(): Promise<void> {
    if (this.authenticated) return

    try {
      await this.cli.checkAuthenticated()
      this.authenticated = true
    } catch {
      console.log(
        "gcloud CLI not authenticated. Attempting automatic authentication..."
      )
      await this.cli.autoAuthenticate()
      this.authenticated = true
    }
  }

  /**
   * Ensures authentication is valid for alpha commands, which have stricter requirements.
   */
  private async ensureAlphaCommandAuth(): Promise<void> {
    if (this.authenticated) {
      // Even if we think we're authenticated, alpha commands might need fresh auth
      try {
        await this.cli.ensureAlphaCommandAuth()
      } catch {
        // If alpha auth fails, reset our authentication state and try again
        this.authenticated = false
        await this.cli.ensureAlphaCommandAuth()
        this.authenticated = true
      }
    } else {
      await this.cli.ensureAlphaCommandAuth()
      this.authenticated = true
    }
  }

  /**
   * Wrapper to handle authentication errors during command execution
   */
  private async runWithAuth<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      // Check if this is an authentication error that happened during execution
      if (
        error instanceof SetupAuthError &&
        error.code === "GCP_AUTH_REQUIRED"
      ) {
        console.log(
          "gcloud authentication expired. Attempting to re-authenticate..."
        )
        this.authenticated = false // Reset authentication state

        try {
          // Check if we're in an interactive environment before attempting re-authentication
          const isInteractive = process.stdin.isTTY && process.stdout.isTTY
          if (!isInteractive) {
            throw new SetupAuthError(
              "GCP authentication expired and cannot be renewed automatically.\n" +
                "What went wrong: gcloud CLI authentication expired during execution and cannot prompt for login in non-interactive mode.\n" +
                "What to do: Run 'gcloud auth login' and 'gcloud auth application-default login' in your terminal, then re-run this command.\n" +
                "(If this could have been automated, it would have been.)",
              { code: "GCP_AUTH_REQUIRED", cause: error }
            )
          }

          await this.ensureAuthenticated()
          // Retry the operation
          return await operation()
        } catch (reAuthError) {
          // If re-authentication fails (e.g., non-interactive mode), fail gracefully
          throw new SetupAuthError(
            "GCP authentication expired and cannot be renewed automatically.\n" +
              "What went wrong: gcloud CLI authentication expired during execution and cannot prompt for login in non-interactive mode.\n" +
              "What to do: Run 'gcloud auth login' and 'gcloud auth application-default login' in your terminal, then re-run this command.\n" +
              "(If this could have been automated, it would have been.)",
            { code: "GCP_AUTH_REQUIRED", cause: reAuthError }
          )
        }
      }
      throw error
    }
  }

  /**
   * Creates a new OAuth2 client of type "Web application" using gcloud CLI.
   * Note: Due to Google's platform limitation, the client secret cannot be retrieved
   * programmatically and must be manually copied from the Google Cloud Console.
   * @returns clientId and a placeholder clientSecret ("RETRIEVE_FROM_CONSOLE")
   */
  async createClient(
    displayName: string,
    redirectUris: string[],
    origins: string[]
  ): Promise<{ clientId: string; clientSecret: string }> {
    await this.ensureAlphaCommandAuth()
    await this.cli.checkInstalled()

    return this.runWithAuth(async () => {
      // Generate a unique client ID based on display name and timestamp
      const timestamp = Date.now()
      const sanitizedName = displayName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
      const clientId = `${sanitizedName}-${timestamp}`

      // Build the gcloud command arguments
      const args = [
        "alpha",
        "iam",
        "oauth-clients",
        "create",
        clientId,
        "--location=global",
        "--client-type=confidential-client",
        `--display-name=${displayName}`,
        "--allowed-grant-types=authorization-code-grant,refresh-token-grant",
        "--allowed-scopes=https://www.googleapis.com/auth/cloud-platform,openid,email",
        `--allowed-redirect-uris=${redirectUris.join(",")}`,
        `--project=${this.projectId}`,
      ]

      // Add allowed origins if provided
      if (origins && origins.length > 0) {
        // Note: The gcloud command might not support origins directly,
        // we'll need to check and potentially update after creation
        console.log(
          "Note: JavaScript origins may need to be set manually in the Google Cloud Console"
        )
      }

      try {
        await this.cli.run(args, false)
        console.log(`✅ OAuth client created successfully with ID: ${clientId}`)

        // Create a credential to get the client secret
        console.log("Creating OAuth client credential to retrieve secret...")
        const credentialId = `auto-credential-${Date.now()}`
        const credentialArgs = [
          "alpha",
          "iam",
          "oauth-clients",
          "credentials",
          "create",
          credentialId,
          "--location=global",
          `--oauth-client=${clientId}`,
          `--project=${this.projectId}`,
          "--format=json",
        ]

        try {
          const credentialResult = (await this.cli.run(
            credentialArgs,
            true
          )) as {
            clientSecret?: string
            name?: string
          }

          if (credentialResult && credentialResult.clientSecret) {
            console.log("✅ OAuth client credential created successfully!")

            // Return the client ID and the actual secret
            return {
              clientId: clientId,
              clientSecret: credentialResult.clientSecret,
            }
          } else {
            throw new Error(
              "Failed to retrieve client secret from credential creation"
            )
          }
        } catch (credError) {
          console.error("Failed to create credential:", credError)
          throw new SetupAuthError(
            `OAuth client created but failed to retrieve secret: ${credError instanceof Error ? credError.message : String(credError)}`,
            { code: "OAUTH_CREDENTIAL_CREATE_FAILED", cause: credError }
          )
        }
      } catch (error) {
        throw new SetupAuthError(
          `Failed to create OAuth client: ${error instanceof Error ? error.message : String(error)}`,
          {
            code: "OAUTH_CLIENT_CREATE_FAILED",
            cause: error,
          }
        )
      }
    })
  }

  /**
   * Lists all OAuth2 clients for the project using gcloud CLI.
   */
  async listClients(): Promise<
    Array<{ clientId: string; displayName: string }>
  > {
    await this.ensureAlphaCommandAuth()
    await this.cli.checkInstalled()

    return this.runWithAuth(async () => {
      const args = [
        "alpha",
        "iam",
        "oauth-clients",
        "list",
        "--location=global",
        `--project=${this.projectId}`,
        "--format=json",
      ]
      const result = (await this.cli.run(args, true)) as Array<{
        name?: string
        displayName?: string
      }>
      return (result || []).map(c => ({
        clientId: c.name ? c.name.split("/").pop() || "" : "",
        displayName: c.displayName || "",
      }))
    })
  }

  /**
   * Retrieves details for a specific OAuth2 client using gcloud CLI.
   */

  async getClientDetails(clientId: string): Promise<{
    clientId: string
    displayName: string
    redirectUris: string[]
    origins: string[]
  }> {
    await this.ensureAlphaCommandAuth()
    await this.cli.checkInstalled()

    return this.runWithAuth(async () => {
      const args = [
        "alpha",
        "iam",
        "oauth-clients",
        "describe",
        clientId,
        "--location=global",
        `--project=${this.projectId}`,
        "--format=json",
      ]
      const result = (await this.cli.run(args, true)) as {
        name?: string
        displayName?: string
        allowedRedirectUris?: string[]
        allowedJavascriptOrigins?: string[]
      }
      return {
        clientId: result.name ? result.name.split("/").pop() || "" : "",
        displayName: result.displayName || "",
        redirectUris: result.allowedRedirectUris || [],
        origins: result.allowedJavascriptOrigins || [],
      }
    })
  }

  /**
   * Updates redirect URIs and origins for a given OAuth2 client using gcloud CLI.
   */
  async updateRedirectUris(
    clientId: string,
    redirectUris: string[]
  ): Promise<void> {
    await this.ensureAlphaCommandAuth()
    await this.cli.checkInstalled()

    return this.runWithAuth(async () => {
      // See: gcloud alpha iam oauth-clients update --help (argument: --allowed-redirect-uris)
      const args = [
        "alpha",
        "iam",
        "oauth-clients",
        "update",
        clientId,
        "--location=global",
        `--allowed-redirect-uris=${redirectUris.join(",")}`,
        `--project=${this.projectId}`,
      ]
      await this.cli.run(args, false)
    })
  }

  /**
   * Deletes an OAuth2 client by client ID using gcloud CLI.
   */

  async deleteClient(clientId: string): Promise<void> {
    await this.ensureAlphaCommandAuth()
    await this.cli.checkInstalled()

    return this.runWithAuth(async () => {
      const args = [
        "alpha",
        "iam",
        "oauth-clients",
        "delete",
        clientId,
        "--location=global",
        `--project=${this.projectId}`,
      ]
      await this.cli.run(args, false)
    })
  }
}
