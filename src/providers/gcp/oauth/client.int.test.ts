import { describe, it, expect } from "vitest"
import path from "path"
import { fileURLToPath } from "url"
import { SetupAuthError } from "@/utils/error.js"
import dotenv from "dotenv"
import { GcpOAuthWebClientManager } from "./client.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Always load .env.local from the repo root (four levels up)
const envPath = path.resolve(__dirname, "../../../../../../.env.local")
dotenv.config({ path: envPath })

const projectId = process.env.GCP_OAUTH_PROJECT_ID
const credentials = process.env.GCP_OAUTH_APPLICATION_CREDENTIALS

if (!projectId || !credentials) {
  console.warn(
    `Skipping integration tests: GCP_OAUTH_PROJECT_ID or GCP_OAUTH_APPLICATION_CREDENTIALS not set. Tried loading from: ${envPath}`
  )
  process.exit(0)
}

const uniqueSuffix = Date.now().toString()
const displayName = `Test OAuth2 Client ${uniqueSuffix}`
const redirectUris = ["https://example.com/callback"]
const origins = ["https://example.com"]

describe("GcpOAuthWebClientManager Integration Tests", () => {
  it("createClient creates a new OAuth2 client and returns credentials", async () => {
    const manager = new GcpOAuthWebClientManager(projectId)
    let clientId: string | undefined
    try {
      try {
        const { clientId: createdId, clientSecret } =
          await manager.createClient(displayName, redirectUris, origins)
        clientId = createdId
        expect(typeof clientId).toBe("string")
        expect(clientId.length).toBeGreaterThan(0)
        // Client secret should be the placeholder since Google doesn't allow programmatic retrieval
        expect(clientSecret).toBe("RETRIEVE_FROM_CONSOLE")
        console.log(`✅ OAuth client created with ID: ${clientId}`)
      } catch (err) {
        // Fail fast: skip test if GCP_AUTH_REQUIRED error is thrown
        if (err instanceof SetupAuthError && err.code === "GCP_AUTH_REQUIRED") {
          console.warn(
            "[SKIP] GCP authentication required for integration test. " +
              err.message
          )
          return // skip test
        }
        throw err
      }
    } finally {
      if (clientId) {
        await manager.deleteClient(clientId)
      }
    }
  })
})

// More integration tests for listClients, getClientDetails, updateRedirectUris, deleteClient will follow
