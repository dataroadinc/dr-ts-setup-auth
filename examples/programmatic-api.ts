/**
 * Example usage of the setup-auth programmatic API
 *
 * This example demonstrates how to register and update callback URLs
 * programmatically without relying on CLI commands.
 */

import {
  registerCallbackUrls,
  updateCallbackUrls,
  type CallbackUrlConfig,
} from "../src/api/index.js"

/**
 * Example: Register callback URLs for a new deployment
 */
async function registerNewDeployment() {
  console.log("Registering callback URLs for new deployment...")

  const config: CallbackUrlConfig = {
    provider: "gcp",
    platform: "vercel",
    deploymentUrl: "https://my-app-abc123.vercel.app",
    callbackPath: "/api/auth/callback/gcp",
    additionalUrls: [
      "https://my-app.com/api/auth/callback/gcp",
      "https://staging.my-app.com/api/auth/callback/gcp",
    ],
    wildcardPatterns: ["https://my-app-*.vercel.app/api/auth/callback/gcp"],
    projectConfig: {
      gcpProjectId: process.env.GCP_OAUTH_PROJECT_ID!,
      gcpOrganizationId: process.env.GCP_OAUTH_ORGANIZATION_ID,
    },
  }

  const result = await registerCallbackUrls(config)

  if (result.success) {
    console.log("✅ Callback URLs registered successfully!")
    console.log("📋 Registered URLs:", result.registeredUrls)
    console.log("🆔 OAuth Client ID:", result.clientId)
    console.log("🔧 Provider Details:", result.providerDetails)
  } else {
    console.error("❌ Registration failed:", result.error)
  }
}

/**
 * Example: Update callback URLs for an existing deployment
 */
async function updateExistingDeployment() {
  console.log("Updating callback URLs for existing deployment...")

  const config: CallbackUrlConfig = {
    provider: "gcp",
    platform: "vercel",
    deploymentUrl: "https://my-app-def456.vercel.app",
    projectConfig: {
      gcpProjectId: process.env.GCP_OAUTH_PROJECT_ID!,
    },
  }

  const result = await updateCallbackUrls(config)

  if (result.success) {
    console.log("✅ Callback URLs updated successfully!")
    console.log("📋 Updated URLs:", result.redirectUris)
  } else {
    console.error("❌ Update failed:", result.error)
  }
}

/**
 * Example: GitHub OAuth app registration (when implemented)
 */
async function registerGitHubApp() {
  console.log("Registering GitHub OAuth app...")

  const config: CallbackUrlConfig = {
    provider: "github",
    platform: "vercel",
    deploymentUrl: "https://my-app.vercel.app",
    callbackPath: "/api/auth/callback/github",
    projectConfig: {
      githubAppName: "my-github-app",
    },
  }

  const result = await registerCallbackUrls(config)

  if (result.success) {
    console.log("✅ GitHub OAuth app registered successfully!")
    console.log("📋 Registered URLs:", result.registeredUrls)
    console.log("🆔 Client ID:", result.clientId)
  } else {
    console.error("❌ GitHub registration failed:", result.error)
  }
}

/**
 * Example: Azure AD app registration (when implemented)
 */
async function registerAzureApp() {
  console.log("Registering Azure AD app...")

  const config: CallbackUrlConfig = {
    provider: "azure",
    platform: "vercel",
    deploymentUrl: "https://my-app.vercel.app",
    callbackPath: "/api/auth/callback/azure",
    projectConfig: {
      azureTenantId: process.env.AZURE_AD_TENANT_ID!,
    },
  }

  const result = await registerCallbackUrls(config)

  if (result.success) {
    console.log("✅ Azure AD app registered successfully!")
    console.log("📋 Registered URLs:", result.registeredUrls)
    console.log("🆔 Client ID:", result.clientId)
  } else {
    console.error("❌ Azure registration failed:", result.error)
  }
}

/**
 * Example: Error handling with retry logic
 */
async function registerWithRetry(config: CallbackUrlConfig, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Attempt ${attempt}/${maxRetries}...`)

    const result = await registerCallbackUrls(config)

    if (result.success) {
      console.log("✅ Registration successful!")
      return result
    }

    console.error(`❌ Attempt ${attempt} failed:`, result.error)

    if (attempt < maxRetries) {
      const delay = 1000 * attempt // Exponential backoff
      console.log(`⏳ Retrying in ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw new Error("Failed to register callback URLs after all retries")
}

/**
 * Example: Environment-specific configuration
 */
function getConfigForEnvironment(environment: string): CallbackUrlConfig {
  const baseConfig: CallbackUrlConfig = {
    provider: "gcp",
    platform: "vercel",
    callbackPath: "/api/auth/callback/gcp",
    projectConfig: {
      gcpProjectId: process.env[`${environment.toUpperCase()}_GCP_PROJECT_ID`]!,
    },
  }

  switch (environment) {
    case "development":
      return {
        ...baseConfig,
        deploymentUrl: process.env.DEV_DEPLOYMENT_URL,
        additionalUrls: ["http://localhost:3000/api/auth/callback/gcp"],
      }
    case "staging":
      return {
        ...baseConfig,
        deploymentUrl: process.env.STAGING_DEPLOYMENT_URL,
        additionalUrls: ["https://staging.my-app.com/api/auth/callback/gcp"],
      }
    case "production":
      return {
        ...baseConfig,
        deploymentUrl: process.env.PROD_DEPLOYMENT_URL,
        additionalUrls: ["https://my-app.com/api/auth/callback/gcp"],
        wildcardPatterns: ["https://my-app-*.vercel.app/api/auth/callback/gcp"],
      }
    default:
      throw new Error(`Unknown environment: ${environment}`)
  }
}

/**
 * Example: Validation function
 */
function validateConfig(config: CallbackUrlConfig): string[] {
  const errors: string[] = []

  if (!config.provider) {
    errors.push("Provider is required")
  }

  if (!config.platform) {
    errors.push("Platform is required")
  }

  if (!config.projectConfig) {
    errors.push("Project configuration is required")
  } else {
    switch (config.provider) {
      case "gcp":
        if (!config.projectConfig.gcpProjectId) {
          errors.push("GCP project ID is required for GCP provider")
        }
        break
      case "github":
        if (!config.projectConfig.githubAppName) {
          errors.push("GitHub app name is required for GitHub provider")
        }
        break
      case "azure":
        if (!config.projectConfig.azureTenantId) {
          errors.push("Azure tenant ID is required for Azure provider")
        }
        break
    }
  }

  return errors
}

/**
 * Main example function
 */
async function main() {
  console.log("🚀 Setup Auth Programmatic API Examples")
  console.log("==========================================\n")

  // Validate environment variables
  if (!process.env.GCP_OAUTH_PROJECT_ID) {
    console.error("❌ GCP_OAUTH_PROJECT_ID environment variable is required")
    process.exit(1)
  }

  try {
    // Example 1: Register new deployment
    await registerNewDeployment()
    console.log()

    // Example 2: Update existing deployment
    await updateExistingDeployment()
    console.log()

    // Example 3: Environment-specific configuration
    const devConfig = getConfigForEnvironment("development")
    const validationErrors = validateConfig(devConfig)

    if (validationErrors.length > 0) {
      console.error("❌ Configuration validation failed:")
      validationErrors.forEach(error => console.error(`  - ${error}`))
    } else {
      console.log("✅ Configuration validation passed")
    }
    console.log()

    // Example 4: Retry logic
    console.log("Testing retry logic with invalid config...")
    const invalidConfig: CallbackUrlConfig = {
      provider: "gcp",
      platform: "vercel",
      projectConfig: {
        gcpProjectId: "invalid-project-id",
      },
    }

    try {
      await registerWithRetry(invalidConfig, 2)
    } catch (error) {
      console.log("✅ Retry logic worked as expected (failed after retries)")
    }
  } catch (error) {
    console.error("❌ Example failed:", error)
    process.exit(1)
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}
