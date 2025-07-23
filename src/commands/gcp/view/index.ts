import { Command } from "@commander-js/extra-typings"
import { GCP_VIEW_ITEMS, gcpViewOptions } from "./options.js"
import { gcpView } from "./view.js"

export async function addCommandGcpView(program: Command): Promise<void> {
  program
    .command("gcp-view")
    .argument("<item>", `Item to view such as ${GCP_VIEW_ITEMS.join(", ")}`)
    .description("View various types of items around the OAuth2 setup")
    .option("--user", "Use user account authentication (gcloud auth login)")
    .option("--adc", "Use Application Default Credentials")
    .option("--service-account", "Use service account authentication")
    .option("--enable", "Attempt to grant missing permissions automatically")
    .action(async function _action() {
      const options = {
        ...this.optsWithGlobals(),
        item: this.args[0],
        enable: this.opts().enable || false,
      } as gcpViewOptions

      // Determine authentication type from options
      if (this.opts().user) {
        options.auth = "User Account"
      } else if (this.opts().adc) {
        options.auth = "ADC"
      } else if (this.opts().serviceAccount) {
        options.auth = "Service Account"
      }

      try {
        await gcpView(options)
      } catch (error) {
        if (error instanceof Error) {
          console.error("\n❌ Error during gcp-view:\n" + error.toString())
        } else {
          console.error("\n❌ Unknown error during gcp-view:", error)
        }
        process.exit(1)
      }
    })
}
