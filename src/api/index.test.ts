/**
 * Tests for the setup-auth programmatic API
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  SetupAuthAPI,
  registerCallbackUrls,
  updateCallbackUrls,
  type CallbackUrlConfig,
} from "./index.js"

// Mock the GCP dependencies
vi.mock("../providers/gcp/oauth/client.js", () => ({
  GcpOAuthWebClientManager: vi.fn().mockImplementation(() => ({
    createClient: vi.fn().mockResolvedValue({
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
    }),
    updateRedirectUris: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock("../providers/gcp/creds/identity.js", () => ({
  GcpIdentityFactory: {
    createIdentity: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock("../utils/redirect-urls.js", () => ({
  buildRedirectUriList: vi
    .fn()
    .mockReturnValue([
      "https://test-app.vercel.app/api/auth/callback/gcp",
      "https://test-app.com/api/auth/callback/gcp",
    ]),
}))

describe("SetupAuthAPI", () => {
  let api: SetupAuthAPI

  beforeEach(() => {
    // Reset the singleton instance
    ;(SetupAuthAPI as unknown as { instance: SetupAuthAPI | null }).instance = null
    api = SetupAuthAPI.getInstance()
  })

  describe("getInstance", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = SetupAuthAPI.getInstance()
      const instance2 = SetupAuthAPI.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe("validateCallbackUrlConfig", () => {
    it("should validate a valid GCP configuration", async () => {
      const config: CallbackUrlConfig = {
        provider: "gcp",
        platform: "vercel",
        projectConfig: {
          gcpProjectId: "test-project-id",
        },
      }

      // This should not throw
      await expect(api.registerCallbackUrls(config)).resolves.toBeDefined()
    })

    it("should reject configuration without provider", async () => {
      const config = {
        platform: "vercel",
        projectConfig: {
          gcpProjectId: "test-project-id",
        },
      } as CallbackUrlConfig

      const result = await api.registerCallbackUrls(config)
      expect(result.success).toBe(false)
      expect(result.error).toContain("OAuth provider is required")
    })

    it("should reject configuration without platform", async () => {
      const config = {
        provider: "gcp",
        projectConfig: {
          gcpProjectId: "test-project-id",
        },
      } as CallbackUrlConfig

      const result = await api.registerCallbackUrls(config)
      expect(result.success).toBe(false)
      expect(result.error).toContain("Platform is required")
    })

    it("should reject GCP configuration without project ID", async () => {
      const config: CallbackUrlConfig = {
        provider: "gcp",
        platform: "vercel",
        projectConfig: {},
      }

      const result = await api.registerCallbackUrls(config)
      expect(result.success).toBe(false)
      expect(result.error).toContain(
        "GCP project ID is required for GCP provider"
      )
    })
  })

  describe("registerCallbackUrls", () => {
    it("should register GCP callback URLs successfully", async () => {
      const config: CallbackUrlConfig = {
        provider: "gcp",
        platform: "vercel",
        deploymentUrl: "https://test-app.vercel.app",
        callbackPath: "/api/auth/callback/gcp",
        projectConfig: {
          gcpProjectId: "test-project-id",
        },
      }

      const result = await api.registerCallbackUrls(config)

      expect(result.success).toBe(true)
      expect(result.registeredUrls).toBeDefined()
      expect(result.clientId).toBe("test-client-id")
      expect(result.providerDetails).toBeDefined()
    })

    it("should handle GitHub provider (not implemented)", async () => {
      const config: CallbackUrlConfig = {
        provider: "github",
        platform: "vercel",
        projectConfig: {
          githubAppName: "test-app",
        },
      }

      const result = await api.registerCallbackUrls(config)
      expect(result.success).toBe(false)
      expect(result.error).toContain(
        "GitHub OAuth app creation not yet implemented"
      )
    })

    it("should handle Azure provider (not implemented)", async () => {
      const config: CallbackUrlConfig = {
        provider: "azure",
        platform: "vercel",
        projectConfig: {
          azureTenantId: "test-tenant-id",
        },
      }

      const result = await api.registerCallbackUrls(config)
      expect(result.success).toBe(false)
      expect(result.error).toContain(
        "Azure AD app registration not yet implemented"
      )
    })

    it("should handle LinkedIn provider (not implemented)", async () => {
      const config: CallbackUrlConfig = {
        provider: "linkedin",
        platform: "vercel",
        projectConfig: {},
      }

      const result = await api.registerCallbackUrls(config)
      expect(result.success).toBe(false)
      expect(result.error).toContain(
        "LinkedIn OAuth app creation not yet implemented"
      )
    })
  })

  describe("updateCallbackUrls", () => {
    beforeEach(() => {
      // Mock environment variable
      process.env.GCP_OAUTH_CLIENT_ID =
        "test-client-id.apps.googleusercontent.com"
    })

    it("should update GCP callback URLs successfully", async () => {
      const config: CallbackUrlConfig = {
        provider: "gcp",
        platform: "vercel",
        deploymentUrl: "https://test-app.vercel.app",
        projectConfig: {
          gcpProjectId: "test-project-id",
        },
      }

      const result = await api.updateCallbackUrls(config)

      expect(result.success).toBe(true)
      expect(result.redirectUris).toBeDefined()
    })

    it("should fail when GCP client ID is not found", async () => {
      delete process.env.GCP_OAUTH_CLIENT_ID

      const config: CallbackUrlConfig = {
        provider: "gcp",
        platform: "vercel",
        projectConfig: {
          gcpProjectId: "test-project-id",
        },
      }

      const result = await api.updateCallbackUrls(config)
      expect(result.success).toBe(false)
      expect(result.error).toContain("GCP OAuth client ID not found")
    })
  })
})

describe("Convenience functions", () => {
  beforeEach(() => {
    // Reset the singleton instance
    ;(SetupAuthAPI as unknown as { instance: SetupAuthAPI | null }).instance = null
  })

  it("should export registerCallbackUrls function", async () => {
    const config: CallbackUrlConfig = {
      provider: "gcp",
      platform: "vercel",
      projectConfig: {
        gcpProjectId: "test-project-id",
      },
    }

    const result = await registerCallbackUrls(config)
    expect(result.success).toBe(true)
  })

  it("should export updateCallbackUrls function", async () => {
    process.env.GCP_OAUTH_CLIENT_ID =
      "test-client-id.apps.googleusercontent.com"

    const config: CallbackUrlConfig = {
      provider: "gcp",
      platform: "vercel",
      projectConfig: {
        gcpProjectId: "test-project-id",
      },
    }

    const result = await updateCallbackUrls(config)
    expect(result.success).toBe(true)
  })
})
