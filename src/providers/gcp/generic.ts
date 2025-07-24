import { SetupAuthError } from "../../utils/error.js"
import { OrganizationsClient } from "@google-cloud/resource-manager"
import { gcpGetAuth } from "./auth.js"

export async function gcpGetOAuthOrganizationID(): Promise<string> {
  try {
    // Check for predefined environment variable first
    const envOrgId = process.env.GCP_OAUTH_ORGANIZATION_ID
    if (envOrgId) {
      return envOrgId
    }

    // Use OrganizationsClient directly
    const auth = await gcpGetAuth() // Get auth client
    const client = new OrganizationsClient({ auth })

    console.log("Searching for organizations...")
    const organizations = []
    // Search organizations accessible to the authenticated user - handle pagination
    for await (const org of client.searchOrganizationsAsync()) {
      organizations.push(org)
    }
    console.log(`Found ${organizations.length} organization(s)`)

    if (organizations.length === 0) {
      throw new SetupAuthError(
        "No organizations found. Ensure credentials have Organization Viewer permissions."
      )
    }
    if (organizations.length > 1) {
      // TODO: Ideally, prompt the user to choose or provide the ID via env var
      console.warn(
        "Multiple organizations found:",
        organizations.map(o => ({ name: o.name, displayName: o.displayName }))
      )
      throw new SetupAuthError(
        `Multiple organizations found (${organizations.length}). Set GCP_OAUTH_ORGANIZATION_ID environment variable to specify which one to use.`
      )
    }

    // Extract ID from the organization name (format: "organizations/1234567890")
    const organizationId = organizations[0].name?.split("/").pop()
    if (!organizationId) {
      throw new SetupAuthError("Failed to parse organization ID from response.")
    }

    console.log(
      `Using organization ID: ${organizationId} (Display Name: ${organizations[0].displayName})`
    )
    // Optionally set it back to the environment for subsequent calls within the same process
    // process.env.GCP_OAUTH_ORGANIZATION_ID = organizationId;
    return organizationId
  } catch (error) {
    // Improve error logging
    console.error("Error during organization ID retrieval:", error)
    if (error instanceof SetupAuthError) {
      throw error // Re-throw known errors
    }
    // Wrap unknown errors
    throw new SetupAuthError("Organization ID retrieval failed unexpectedly.", {
      cause: error,
    })
  }
}
