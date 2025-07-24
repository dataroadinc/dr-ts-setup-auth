// TODO: Implement GcpOAuthWebClientManager for standard OAuth2 clients (type: "Web application")
// This file previously managed IAP OAuth clients using @google-cloud/iap, which is not needed for Vercel deployments.

// The new manager will:
// - Create, list, update, and delete standard OAuth2 clients
// - Manage redirect URIs and JavaScript origins
// - Retrieve and store client ID and secret

import { SetupAuthError } from "../../../utils/error.js"
import { GcpCloudCliClient } from "../../gcp/cloud-cli-client.js"

export class GcpOAuthWebClientManager {
  private readonly projectId: string
  cli: GcpCloudCliClient
  private authenticated = false

  constructor(projectId: string) {
    this.projectId = projectId
    this.cli = new GcpCloudCliClient()
  }

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

  private async ensureAlphaCommandAuth(): Promise<void> {
    if (this.authenticated) {
      try {
        await this.cli.ensureAlphaCommandAuth()
      } catch {
        this.authenticated = false
        await this.cli.ensureAlphaCommandAuth()
        this.authenticated = true
      }
    } else {
      await this.cli.ensureAlphaCommandAuth()
      this.authenticated = true
    }
  }

  private async runWithAuth<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (
        error instanceof SetupAuthError &&
        error.code === "GCP_AUTH_REQUIRED"
      ) {
        console.log(
          "gcloud authentication expired. Attempting to re-authenticate..."
        )
        this.authenticated = false
        try {
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
          return await operation()
        } catch (reAuthError) {
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

  async createClient(
    displayName: string,
    redirectUris: string[],
    origins: string[]
  ): Promise<{ clientId: string; clientSecret: string }> {
    await this.ensureAlphaCommandAuth()
    await this.cli.checkInstalled()

    return this.runWithAuth(async () => {
      const timestamp = Date.now()
      const sanitizedName = displayName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
      const clientId = `${sanitizedName}-${timestamp}`

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

      if (origins && origins.length > 0) {
        console.log(
          "Note: JavaScript origins may need to be set manually in the Google Cloud Console"
        )
      }

      try {
        await this.cli.run(args, false)
        console.log(`✅ OAuth client created successfully with ID: ${clientId}`)

        console.log("Creating OAuth client credential to retrieve secret...")
        const credentialId = `auto-credential-${Date.now()}`
        const credentialArgs = [
          "alpha",
          "iam",
          "oauth-clients",
          "credentials",
          "create",
          credentialId,
          `--client-id=${clientId}`,
          "--location=global",
          `--project=${this.projectId}`,
        ]

        await this.cli.run(credentialArgs, false)

        // Get the client secret
        const secretArgs = [
          "alpha",
          "iam",
          "oauth-clients",
          "credentials",
          "describe",
          credentialId,
          "--location=global",
          `--project=${this.projectId}`,
        ]

        const secretResult = (await this.cli.run(secretArgs, true)) as {
          secret?: string
          clientSecret?: string
        }
        console.log("DEBUG secretResult:", secretResult)
        const clientSecret =
          secretResult.secret || secretResult.clientSecret || ""

        console.log(`✅ OAuth client credential created successfully`)
        console.log(`Client ID: ${clientId}`)
        console.log(`Client Secret: ${clientSecret}`)

        return { clientId, clientSecret }
      } catch (error) {
        console.error("Failed to create OAuth client:", error)
        throw error
      }
    })
  }

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
      ]
      const result = (await this.cli.run(args, true)) as string
      const lines = result.trim().split("\n").slice(1) // Skip header
      return lines
        .filter(line => line.trim())
        .map(line => {
          const parts = line.split(/\s+/)
          return {
            clientId: parts[0] || "",
            displayName: parts.slice(1).join(" ") || "",
          }
        })
    })
  }

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
      ]
      const result = (await this.cli.run(args, true)) as string

      // Parse the output to extract details
      const lines = result.trim().split("\n")
      let displayName = ""
      let redirectUris: string[] = []
      let origins: string[] = []

      for (const line of lines) {
        if (line.includes("displayName:")) {
          displayName = line.split("displayName:")[1]?.trim() || ""
        } else if (line.includes("redirectUris:")) {
          const uris = line.split("redirectUris:")[1]?.trim() || ""
          redirectUris = uris
            ? uris.split(",").map((uri: string) => uri.trim())
            : []
        } else if (line.includes("origins:")) {
          const origs = line.split("origins:")[1]?.trim() || ""
          origins = origs
            ? origs.split(",").map((origin: string) => origin.trim())
            : []
        }
      }

      return {
        clientId,
        displayName,
        redirectUris,
        origins,
      }
    })
  }

  async updateRedirectUris(
    clientId: string,
    redirectUris: string[]
  ): Promise<void> {
    await this.ensureAlphaCommandAuth()
    await this.cli.checkInstalled()

    return this.runWithAuth(async () => {
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
      console.log(`✅ Updated redirect URIs for client: ${clientId}`)
    })
  }

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
      console.log(`✅ Deleted OAuth client: ${clientId}`)
    })
  }
}
