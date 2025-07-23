import { Command } from "@commander-js/extra-typings"
import { GcpSetupServiceAccountOptions } from "./options.js"
import { gcpSetupServiceAccount } from "./setup.js"

export async function addCommandGcpSetupServiceAccount(
  program: Command
): Promise<void> {
  program
    .command("gcp-setup-service-account")
    .description(
      "[ADMIN ONLY] One-time setup: Creates service account, IAM roles, and OAuth consent screen for automation infrastructure"
    )
    .action(async function _action() {
      const options = {
        ...this.optsWithGlobals(),
      } as GcpSetupServiceAccountOptions

      try {
        await gcpSetupServiceAccount(options)
      } catch (error) {
        // Explicitly call toString() after checking type
        if (error instanceof Error) {
          console.error(
            "\n❌ Error during setup-service-account:\n" + error.toString()
          )
        } else {
          // Fallback for non-Error types
          console.error(
            "\n❌ Unknown error during setup-service-account:",
            error
          )
        }
        process.exit(1)
      }
    })
}
