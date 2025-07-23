import { existsSync } from "fs"
import { resolve } from "path"
import { GcpCloudCliClient } from "@/providers/gcp/cloud-cli-client.js"
import { Command } from "@commander-js/extra-typings"

export async function addCommandLogin(program: Command): Promise<void> {
  program
    .command("login")
    .description(
      "Perform cloud provider login (GCP user, ADC, service account, Azure, AWS, etc.)"
    )
    .option("--gcp-user", "Perform GCP user login (gcloud auth login)")
    .option(
      "--gcp-adc",
      "Perform GCP ADC login (gcloud auth application-default login)"
    )
    .option(
      "--gcp-service-account <keyFile>",
      "Use a GCP service account key for authentication"
    )
    .option("--azure", "Azure login (future)")
    .option("--aws", "AWS login (future)")
    .action(async function _action() {
      const opts = this.optsWithGlobals()
      const hasOption =
        opts.gcpUser ||
        opts.gcpAdc ||
        opts.gcpServiceAccount ||
        opts.azure ||
        opts.aws
      if (!hasOption) {
        this.help()
        return
      }

      const cli = new GcpCloudCliClient()
      if (opts.gcpUser) {
        console.log("Performing GCP user login (gcloud auth login)...")
        await cli.run(["auth", "login"], false)
      }
      if (opts.gcpAdc) {
        console.log(
          "Performing GCP ADC login (gcloud auth application-default login)..."
        )
        await cli.run(["auth", "application-default", "login"], false)
      }
      if (opts.gcpServiceAccount) {
        const keyFile = resolve(opts.gcpServiceAccount as string)
        if (!existsSync(keyFile)) {
          console.error(`Error: Service account key file not found: ${keyFile}`)
          process.exit(1)
        }
        console.log(`Activating service account using key file: ${keyFile}`)
        try {
          // Activate the service account
          await cli.run(
            ["auth", "activate-service-account", `--key-file=${keyFile}`],
            false
          )
          console.log("✅ Service account activated successfully")

          // Also set it as ADC
          console.log(
            "Setting service account as Application Default Credentials..."
          )
          process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFile
          console.log(`✅ GOOGLE_APPLICATION_CREDENTIALS set to: ${keyFile}`)

          // Show the active account
          const activeAccount = await cli.getActiveAccount()
          console.log(`Active account is now: ${activeAccount}`)
        } catch (error) {
          console.error("Failed to activate service account:", error)
          process.exit(1)
        }
      }
      if (opts.azure) {
        console.log("Azure login is not yet implemented. Coming soon!")
      }
      if (opts.aws) {
        console.log("AWS login is not yet implemented. Coming soon!")
      }
    })
}
