import { gcpCheckOauthOrganizationId } from "@/providers/gcp/organization.js"
import { gcpCheckOauthProjectId } from "@/providers/gcp/project/index.js"
import { SetupAuthGlobalOptions } from "@/types/index.js"
import {
  GCP_OAUTH_ORGANIZATION_ID,
  GCP_OAUTH_PROJECT_ID,
  updateOrAddEnvVariable,
} from "@/utils/env-handler.js"
import { SetupAuthError } from "@/utils/error.js"

/**
 * CLI command options for GCP service account setup.
 * Extends SetupAuthGlobalOptions to include all global options.
 * No additional options are needed for this command as it uses
 * the global options for GCP service account configuration.
 */
export type GcpSetupServiceAccountOptions = SetupAuthGlobalOptions

export async function gcpCheckServiceAccountOptions(
  options: GcpSetupServiceAccountOptions
): Promise<{ success: boolean; error?: string }> {
  const result1 = await gcpCheckOauthProjectId({
    gcpOauthProjectId: options.gcpOauthProjectId!,
  })
  if (!result1.success) throw new SetupAuthError(result1.error!)

  const result2 = await gcpCheckOauthOrganizationId({
    gcpOauthOrganizationId: options.gcpOauthOrganizationId!,
  })
  if (!result2.success) throw new SetupAuthError(result2.error!)

  console.log("Storing GCP project ID and organization ID in environment...")
  await updateOrAddEnvVariable(GCP_OAUTH_PROJECT_ID, options.gcpOauthProjectId)
  console.log("Stored GCP project ID in environment...")
  await updateOrAddEnvVariable(
    GCP_OAUTH_ORGANIZATION_ID,
    options.gcpOauthOrganizationId
  )
  console.log("Stored GCP organization ID in environment...")

  return { success: true }
}
