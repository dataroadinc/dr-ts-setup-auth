import { describe, it, expect } from "vitest"
import { GcpOAuthWebClientManager } from "./client.js"

class MockGcpCloudCliClient {
  async run(args: string[], expectJson: boolean): Promise<unknown> {
    // Check if this is a create command that should fail
    if (args.includes("create") && args.some(arg => arg.includes("fail"))) {
      throw new Error("gcloud error: creation failed")
    }
    // Check if this is a list command
    if (args.includes("list")) {
      if (args.some(arg => arg.includes("fail"))) {
        throw new Error("gcloud error: list failed")
      }
      return expectJson
        ? [
            { name: "oauth-clients/id1", displayName: "App1" },
            { name: "oauth-clients/id2", displayName: "App2" },
          ]
        : ""
    }
    // Check if this is a describe command
    if (args.includes("describe")) {
      if (args[args.indexOf("describe") + 1] === "fail") {
        throw new Error("gcloud error: describe failed")
      }
      return expectJson
        ? {
            name: "oauth-clients/id1",
            displayName: "App1",
            allowedRedirectUris: ["cb"],
            allowedJavascriptOrigins: ["o"],
          }
        : ""
    }
    // Check if this is an update command
    if (args.includes("update")) {
      if (args[args.indexOf("update") + 1] === "fail") {
        throw new Error("gcloud error: update failed")
      }
    }
    // Check if this is a delete command
    if (args.includes("delete")) {
      if (args[args.indexOf("delete") + 1] === "fail") {
        throw new Error("gcloud error: delete failed")
      }
    }
    return {}
  }
  async checkInstalled(): Promise<void> {
    return
  }
  async checkAuthenticated(): Promise<void> {
    return
  }
  async checkAlphaComponent(): Promise<void> {
    return
  }
  async autoAuthenticate(): Promise<void> {
    return
  }
  async checkApplicationDefaultAuthenticated(): Promise<void> {
    return
  }
  async autoApplicationDefaultAuthenticate(): Promise<void> {
    return
  }
  async ensureAlphaCommandAuth(): Promise<void> {
    return
  }
  async getVersion(): Promise<string> {
    return "Google Cloud SDK 999.0.0"
  }
  async getActiveAccount(): Promise<string | null> {
    return "test@example.com"
  }
  async getAdcEmail(): Promise<string | null> {
    return "test@example.com"
  }
}

describe("GcpOAuthWebClientManager Unit Tests", () => {
  it("createClient calls CLI with correct args and returns placeholder secret", async () => {
    const manager = new GcpOAuthWebClientManager(
      "mock-project"
    ) as unknown as GcpOAuthWebClientManager
    manager.cli = new MockGcpCloudCliClient()
    const result = await manager.createClient("Test App", ["https://cb"], [])
    expect(result.clientId).toMatch(/^test-app-\d+$/) // Should be sanitized name with timestamp
    expect(result.clientSecret).toBe("RETRIEVE_FROM_CONSOLE") // Placeholder for manual retrieval
  })

  it("createClient propagates errors from CLI", async () => {
    const manager = new GcpOAuthWebClientManager(
      "mock-project"
    ) as unknown as GcpOAuthWebClientManager
    manager.cli = new MockGcpCloudCliClient()
    await expect(
      manager.createClient("fail", ["https://cb"], [])
    ).rejects.toThrow(
      /Failed to create OAuth client.*gcloud error: creation failed/
    )
  })

  it("listClients calls CLI and parses result", async () => {
    const manager = new GcpOAuthWebClientManager(
      "mock-project"
    ) as unknown as GcpOAuthWebClientManager
    manager.cli = new MockGcpCloudCliClient()
    const result = await manager.listClients()
    expect(result).toEqual([
      { clientId: "id1", displayName: "App1" },
      { clientId: "id2", displayName: "App2" },
    ])
  })

  it("getClientDetails calls CLI and parses result", async () => {
    const manager = new GcpOAuthWebClientManager(
      "mock-project"
    ) as unknown as GcpOAuthWebClientManager
    manager.cli = new MockGcpCloudCliClient()
    const result = await manager.getClientDetails("id1")
    expect(result).toEqual({
      clientId: "id1",
      displayName: "App1",
      redirectUris: ["cb"],
      origins: ["o"],
    })
  })

  it("updateRedirectUris calls CLI and does not throw on success", async () => {
    const manager = new GcpOAuthWebClientManager(
      "mock-project"
    ) as unknown as GcpOAuthWebClientManager
    manager.cli = new MockGcpCloudCliClient()
    await expect(
      manager.updateRedirectUris("id1", ["cb"])
    ).resolves.not.toThrow()
  })

  it("deleteClient calls CLI and does not throw on success", async () => {
    const manager = new GcpOAuthWebClientManager(
      "mock-project"
    ) as unknown as GcpOAuthWebClientManager
    manager.cli = new MockGcpCloudCliClient()
    await expect(manager.deleteClient("id1")).resolves.not.toThrow()
  })

  it("listClients propagates errors from CLI", async () => {
    const manager = new GcpOAuthWebClientManager(
      "fail-project"
    ) as unknown as GcpOAuthWebClientManager
    const mockCli = new MockGcpCloudCliClient()
    // Override run method to throw error for list commands
    mockCli.run = async (args: string[]): Promise<unknown> => {
      if (args.includes("list")) {
        throw new Error("gcloud error: list failed")
      }
      return {}
    }
    manager.cli = mockCli
    await expect(manager.listClients()).rejects.toThrow(
      /gcloud error: list failed/
    )
  })

  it("getClientDetails propagates errors from CLI", async () => {
    const manager = new GcpOAuthWebClientManager(
      "mock-project"
    ) as unknown as GcpOAuthWebClientManager
    manager.cli = new MockGcpCloudCliClient()
    await expect(manager.getClientDetails("fail")).rejects.toThrow(
      /gcloud error/
    )
  })

  it("updateRedirectUris propagates errors from CLI", async () => {
    const manager = new GcpOAuthWebClientManager(
      "mock-project"
    ) as unknown as GcpOAuthWebClientManager
    manager.cli = new MockGcpCloudCliClient()
    await expect(manager.updateRedirectUris("fail", ["cb"])).rejects.toThrow(
      /gcloud error/
    )
  })

  it("deleteClient propagates errors from CLI", async () => {
    const manager = new GcpOAuthWebClientManager(
      "mock-project"
    ) as unknown as GcpOAuthWebClientManager
    manager.cli = new MockGcpCloudCliClient()
    await expect(manager.deleteClient("fail")).rejects.toThrow(/gcloud error/)
  })
})
