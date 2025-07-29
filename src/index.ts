#!/usr/bin/env node
import { Command } from "@commander-js/extra-typings"
import { addCommandAzureSetupOAuth } from "./commands/azure.js"
import {
  addCommandGcpSetupOAuth,
  addCommandGcpSetupServiceAccount,
  addCommandGcpView,
} from "./commands/gcp/index.js"
import { addCommandGitHubSetupAuth } from "./commands/github.js"
import { addCommandLogin } from "./commands/login.js"
import { addCommandVercelSetupPostDeployWebhook } from "./commands/setup-webhook.js"
import { addCommandUpdateRedirectUrls } from "./commands/update-redirect-urls.js"
import {
  AZURE_AD_CLIENT_ID,
  AZURE_AD_CLIENT_SECRET,
  GCP_OAUTH_ORGANIZATION_ID,
  GCP_OAUTH_PROJECT_ID,
  GITHUB_OAUTH_ID,
  GITHUB_OAUTH_SECRET,
  loadEnvVariables,
  NEXTAUTH_URL,
  VERCEL_ACCESS_TOKEN,
  VERCEL_PROJECT_NAME,
} from "./utils/env-handler.js"

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason)
  // Application specific logging, throwing an error, or other logic here
  // Optionally exit the process if this is considered fatal
  // process.exit(1);
})

process.on("uncaughtException", error => {
  console.error("Uncaught Exception:", error)
  // Application specific logging
  // Optionally exit the process if this is considered fatal
  // process.exit(1);
})

await loadEnvVariables()

// Create the CLI program
const program = new Command()

program
  .name("setup-auth")
  .version("0.0.1")
  .showSuggestionAfterError(true)
  .enablePositionalOptions()
  .description(
    "CLI tool and programmatic API for automated OAuth setup across cloud platforms"
  )
  .option(
    "--platform <platform>",
    "Platform (vercel, opennext, netlify, custom)",
    "vercel"
  )
  .option(
    "--vercel-project-name <name>",
    `Vercel project name, defaults to environment variable ${VERCEL_PROJECT_NAME}`,
    process.env.VERCEL_PROJECT_NAME
  )
  .option(
    "--vercel-access-token <token>",
    `Vercel access token, defaults to environment variable ${VERCEL_ACCESS_TOKEN}`,
    process.env.VERCEL_ACCESS_TOKEN
  )
  .option(
    "--azure-ad-client-id <id>",
    `Azure AD client ID, defaults to environment variable ${AZURE_AD_CLIENT_ID}`,
    process.env.AZURE_AD_CLIENT_ID
  )
  .option(
    "--azure-ad-client-secret <secret>",
    `Azure AD client secret, defaults to environment variable ${AZURE_AD_CLIENT_SECRET}`,
    process.env.AZURE_AD_CLIENT_SECRET
  )
  .option(
    "--gcp-oauth-project-id <id>",
    `GCP project ID, defaults to environment variable ${GCP_OAUTH_PROJECT_ID} or will be derived from project name`,
    process.env.GCP_OAUTH_PROJECT_ID
  )
  .option(
    "--gcp-oauth-organization-id <id>",
    `GCP organization ID, defaults to environment variable ${GCP_OAUTH_ORGANIZATION_ID}`,
    process.env.GCP_OAUTH_ORGANIZATION_ID
  )
  .option(
    "--github-oauth-id <id>",
    `GitHub OAuth ID, defaults to environment variable ${GITHUB_OAUTH_ID}`,
    process.env.GITHUB_OAUTH_ID
  )
  .option(
    "--github-oauth-secret <secret>",
    `GitHub OAuth secret, defaults to environment variable ${GITHUB_OAUTH_SECRET}`,
    process.env.GITHUB_OAUTH_SECRET
  )
  .option(
    "--nextauth-url <url>",
    `NextAuth URL, defaults to environment variable ${NEXTAUTH_URL}`,
    process.env.NEXTAUTH_URL
  )
  .option(
    "--deployment-url <url>",
    "Deployment URL to add to redirect URIs",
    process.env.VERCEL_URL
  )
  .option(
    "--callback-path <path>",
    "Custom callback path",
    "/api/auth/callback"
  )
  .option(
    "--redirect-options <options>",
    "Redirect URL options as JSON string",
    "{}"
  )

// Add commands
await addCommandAzureSetupOAuth(program)
await addCommandGcpSetupOAuth(program)
await addCommandGcpSetupServiceAccount(program)
await addCommandGcpView(program)
await addCommandGitHubSetupAuth(program)
await addCommandLogin(program)
await addCommandVercelSetupPostDeployWebhook(program)
await addCommandUpdateRedirectUrls(program)

// Parse and execute
await program.parseAsync()

// Export the programmatic API for use by other programs
export * from "./api/index.js"
