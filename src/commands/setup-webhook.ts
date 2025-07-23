import { Command } from "@commander-js/extra-typings"

export async function addCommandVercelSetupPostDeployWebhook(
  program: Command
): Promise<void> {
  program
    .command("setup-webhook")
    .description("Set up a webhook for automatic redirect URL updates")
    .option(
      "-p, --platform <platform>",
      "Platform (vercel, opennext, netlify, custom)",
      "vercel"
    )
    .action(() => {
      console.log("Webhook setup functionality coming soon!")
    })
}
