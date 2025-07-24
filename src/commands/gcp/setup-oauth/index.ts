/**
 * GCP Setup OAuth command.
 *
 * This command assumes that the root admin user in GCP has already
 * successfully executed the `gcp-setup-service-account` command.
 * The GCP service account credentials will have been saved in the
 * `GCP_OAUTH_APPLICATION_CREDENTIALS` environment variable and those
 * credentials will be used by this command to create and configure
 * the GCP OAuth2 Client.
 *
 * ===========================================================================
 * CRITICAL REQUIREMENT: This script MUST run without ANY user interaction
 * ===========================================================================
 * - The script must be fully automated from start to finish
 * - No manual steps or user intervention should be required
 * - No prompts or questions should be shown
 * - Errors must be handled gracefully with automated fallbacks
 * - Must result in a complete, working setup or clear error message
 */

import { hookSaveEnvironmentVariables } from "../../../utils/env-handler.js"
import { Command } from "@commander-js/extra-typings"
import { GcpSetupOAuthOptions } from "./options.js"
import { gcpSetupOAuth } from "./setup.js"

export async function addCommandGcpSetupOAuth(program: Command): Promise<void> {
  program
    .command("gcp-setup-oauth")
    .description(
      '[DEVELOPER] Per-deployment setup: Creates/updates OAuth clients for end-user authentication ("Login with Google")'
    )
    .hook("postAction", hookSaveEnvironmentVariables)
    .action(async function _action() {
      const options = {
        ...this.optsWithGlobals(),
      } as GcpSetupOAuthOptions

      try {
        await gcpSetupOAuth(options)
      } catch (error) {
        // Explicitly call toString() after checking type
        if (error instanceof Error) {
          console.error("\n❌ Error during setup-oauth:\n" + error.toString())
        } else {
          // Fallback for non-Error types
          console.error("\n❌ Unknown error during setup-oauth:", error)
        }
        process.exit(1)
      }
    })
}
