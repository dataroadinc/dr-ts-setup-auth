import { describe, it, expect } from "vitest"
import { GcpOAuthWebClientManager } from "./client.js"

class MockGcpCloudCliClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async run(args: string[], _expectJson: boolean): Promise<unknown> {
    // Check if this is a create command that should fail
    if (args.includes("create") && args.some(arg => arg.includes("fail"))) {
      throw new Error("gcloud error: creation failed")
    }
    // Check if this is a list command
    if (args.includes("list")) {
      if (args.some(arg => arg.includes("fail"))) {
        throw new Error("gcloud error: list failed")
      }
      return "NAME                DISPLAY_NAME\nid1                 App1\nid2                 App2"
    }
    // Check if this is a credentials describe command
    for (let i = 0; i < args.length - 1; i++) {
      if (
        String(args[i]) === "credentials" &&
        String(args[i + 1]) === "describe"
      ) {
        if (args.some(arg => String(arg).includes("fail"))) {
          throw new Error("gcloud error: credential describe failed")
        }
        return {
          secret: "mock-client-secret-12345",
          clientSecret: "mock-client-secret-12345",
        }
      }
    }
    // Check if this is a describe command
    if (args.includes("describe")) {
      if (args[args.indexOf("describe") + 1] === "fail") {
        throw new Error("gcloud error: describe failed")
      }
      return "name: oauth-clients/id1\ndisplayName: App1\nredirectUris: cb\norigins: o"
    }
    // Check if this is a credentials create command
    if (args.includes("credentials") && args.includes("create")) {
      if (args.some(arg => arg.includes("fail"))) {
        throw new Error("gcloud error: credential creation failed")
      }
      return ""
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
    return ""
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
    expect(result.clientSecret).toBe("mock-client-secret-12345") // Mock secret from credential creation
  })

  it("createClient propagates errors from CLI", async () => {
    const manager = new GcpOAuthWebClientManager(
      "mock-project"
    ) as unknown as GcpOAuthWebClientManager
    manager.cli = new MockGcpCloudCliClient()
    await expect(
      manager.createClient("fail", ["https://cb"], [])
    ).rejects.toThrow(/gcloud error: creation failed/)
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
