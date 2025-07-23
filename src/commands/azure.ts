import { Command } from "@commander-js/extra-typings"

/**
 * Define the Azure command
 *
 * @param program The program instance
 */
export async function addCommandAzureSetupOAuth(
  program: Command
): Promise<void> {
  program
    .command("azure-setup-oauth")
    .description(
      'Set up "Login with Microsoft" (Azure AD OAuth) for the given project'
    )
    .action(() => {
      console.log("Azure AD OAuth setup functionality coming soon!")
    })
}
