import { Command } from "@commander-js/extra-typings"
import {
  OAuthProvider,
  PlatformType,
  RedirectUrlsConfig,
} from "../types/index.js"

export interface GCPRedirectUrlsOptions {
  /** Platform to use for the setup */
  platform: PlatformType
  /** Provider to use for the setup */
  oauthProvider: OAuthProvider
  /** Vercel project name */
  vercelProjectName?: string
  /** Vercel access token */
  vercelAccessToken?: string
  /** Azure client ID */
  azureOauthClientId?: string
  /** Azure client secret */
  azureOauthSecret?: string
  /** GitHub OAuth ID */
  githubOauthId?: string
  /** GitHub OAuth secret */
  githubOauthSecret?: string
  /** GCP project ID */
  gcpOauthProjectId?: string
  /** GCP organization ID */
  gcpOauthOrganizationId?: string
  /** NextAuth URL */
  nextAuthUrl?: string
  deploymentUrl?: string
  callbackPath?: string | undefined
  url?: string | undefined
  redirectOptions: RedirectUrlsConfig
}

/**
 * Define the update-redirect-urls command.
 *
 * @param program The program instance
 */
export async function addCommandUpdateRedirectUrls(
  program: Command
): Promise<void> {
  program
    .command("update-redirect-urls")
    .description("Update OAuth redirect URLs for a deployment")
    .option("--callback-path <path>", "Custom callback path")
    .option("-u, --url <url>", "Deployment URL to add to redirect URIs")
    .action(async function _action() {
      const options = this.optsWithGlobals() as GCPRedirectUrlsOptions

      const oauthProvider = options.oauthProvider as OAuthProvider
      const platform = options.platform as PlatformType
      const deploymentUrl = options.deploymentUrl || process.env.VERCEL_URL

      console.log(
        `Updating ${oauthProvider} redirect URLs for ${platform} platform`
      )

      if (deploymentUrl) {
        console.log(`Deployment URL: ${deploymentUrl}`)
      }
      // TODO: Implement the update-redirect-urls command
    })
}
