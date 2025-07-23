import { Command } from "@commander-js/extra-typings"

/**
 * Define the GitHub command
 *
 * @param program The program instance
 */
export async function addCommandGitHubSetupAuth(
  program: Command
): Promise<void> {
  program
    .command("github-setup-oauth")
    .description(
      'Set up "Login with GitHub" (GitHub OAuth) for the given project'
    )
    .action((): void => {
      console.log("GitHub OAuth setup functionality coming soon!")
    })
}
