/**
 * Programmatic API for setup-auth
 *
 * This module provides a stable, versioned API that programs can use
 * to register callback URLs and perform OAuth setup operations without
 * relying on CLI commands.
 */

import {
  OAuthProvider,
  PlatformType,
  RedirectUrlsConfig,
  UpdateResult,
} from "../types/index.js"
import {
  buildRedirectUriList,
  getRedirectOptions,
} from "../utils/redirect-urls.js"
import { GcpOAuthWebClientManager } from "../providers/gcp/oauth/client.js"
import { GcpIdentityFactory } from "../providers/gcp/creds/identity.js"
import { SetupAuthError } from "../utils/error.js"

/**
 * Configuration for callback URL registration
 */
export interface CallbackUrlConfig {
  /** The OAuth provider (gcp, github, azure, linkedin) */
  provider: OAuthProvider
  /** The platform (vercel, opennext, netlify) */
  platform: PlatformType
  /** The deployment URL to register */
  deploymentUrl?: string
  /** Custom callback path (optional) */
  callbackPath?: string
  /** Additional URLs to include */
  additionalUrls?: string[]
  /** Wildcard patterns to include */
  wildcardPatterns?: string[]
  /** Project-specific configuration */
  projectConfig?: {
    /** GCP project ID (required for GCP provider) */
    gcpProjectId?: string
    /** GCP organization ID (required for GCP provider) */
    gcpOrganizationId?: string
    /** GitHub OAuth app name (required for GitHub provider) */
    githubAppName?: string
    /** Azure tenant ID (required for Azure provider) */
    azureTenantId?: string
  }
}

/**
 * Result of callback URL registration
 */
export interface CallbackUrlRegistrationResult {
  /** Whether the registration was successful */
  success: boolean
  /** Error message if registration failed */
  error?: string
  /** The registered callback URLs */
  registeredUrls?: string[]
  /** The OAuth client ID (if applicable) */
  clientId?: string
  /** Provider-specific details */
  providerDetails?: Record<string, unknown>
}

/**
 * Main API class for setup-auth operations
 */
export class SetupAuthAPI {
  private static instance: SetupAuthAPI | null = null

  private constructor() {}

  /**
   * Get the singleton instance of SetupAuthAPI
   */
  static getInstance(): SetupAuthAPI {
    if (!SetupAuthAPI.instance) {
      SetupAuthAPI.instance = new SetupAuthAPI()
    }
    return SetupAuthAPI.instance
  }

  /**
   * Register callback URLs for an OAuth provider
   *
   * @param config Configuration for callback URL registration
   * @returns Promise resolving to registration result
   */
  async registerCallbackUrls(
    config: CallbackUrlConfig
  ): Promise<CallbackUrlRegistrationResult> {
    try {
      // Validate configuration
      this.validateCallbackUrlConfig(config)

      // Build redirect URI list
      const redirectUris = await this.buildRedirectUris(config)

      // Register with the appropriate provider
      switch (config.provider) {
        case "gcp":
          return await this.registerGcpCallbackUrls(config, redirectUris)
        case "github":
          return await this.registerGitHubCallbackUrls(config, redirectUris)
        case "azure":
          return await this.registerAzureCallbackUrls(config, redirectUris)
        case "linkedin":
          return await this.registerLinkedInCallbackUrls(config, redirectUris)
        default:
          throw new SetupAuthError(
            `Unsupported OAuth provider: ${config.provider}`
          )
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Update existing callback URLs for an OAuth provider
   *
   * @param config Configuration for callback URL update
   * @returns Promise resolving to update result
   */
  async updateCallbackUrls(config: CallbackUrlConfig): Promise<UpdateResult> {
    try {
      // Validate configuration
      this.validateCallbackUrlConfig(config)

      // Build redirect URI list
      const redirectUris = await this.buildRedirectUris(config)

      // Update with the appropriate provider
      switch (config.provider) {
        case "gcp":
          return await this.updateGcpCallbackUrls(config, redirectUris)
        case "github":
          return await this.updateGitHubCallbackUrls(config, redirectUris)
        case "azure":
          return await this.updateAzureCallbackUrls(config, redirectUris)
        case "linkedin":
          return await this.updateLinkedInCallbackUrls(config, redirectUris)
        default:
          throw new SetupAuthError(
            `Unsupported OAuth provider: ${config.provider}`
          )
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Validate callback URL configuration
   */
  private validateCallbackUrlConfig(config: CallbackUrlConfig): void {
    if (!config.provider) {
      throw new SetupAuthError("OAuth provider is required")
    }
    if (!config.platform) {
      throw new SetupAuthError("Platform is required")
    }

    // Provider-specific validation
    switch (config.provider) {
      case "gcp":
        if (!config.projectConfig?.gcpProjectId) {
          throw new SetupAuthError(
            "GCP project ID is required for GCP provider"
          )
        }
        break
      case "github":
        if (!config.projectConfig?.githubAppName) {
          throw new SetupAuthError(
            "GitHub app name is required for GitHub provider"
          )
        }
        break
      case "azure":
        if (!config.projectConfig?.azureTenantId) {
          throw new SetupAuthError(
            "Azure tenant ID is required for Azure provider"
          )
        }
        break
    }
  }

  /**
   * Build redirect URIs based on configuration
   */
  private async buildRedirectUris(
    config: CallbackUrlConfig
  ): Promise<string[]> {
    // Create options object for the redirect URL utilities
    const options = {
      platform: config.platform,
      oauthProvider: config.provider,
      deploymentUrl: config.deploymentUrl,
      callbackPath: config.callbackPath,
      redirectOptions: {
        gcpOauthProjectId: config.projectConfig?.gcpProjectId || "",
        clientId: "", // Will be filled by provider-specific logic
        additionalUrls: config.additionalUrls,
        wildcardPatterns: config.wildcardPatterns,
      },
    }

    return buildRedirectUriList(options)
  }

  /**
   * Register callback URLs for GCP
   */
  private async registerGcpCallbackUrls(
    config: CallbackUrlConfig,
    redirectUris: string[]
  ): Promise<CallbackUrlRegistrationResult> {
    if (!config.projectConfig?.gcpProjectId) {
      throw new SetupAuthError("GCP project ID is required")
    }

    const identity = await GcpIdentityFactory.createIdentity()
    const oauthClient = new GcpOAuthWebClientManager(
      identity,
      config.projectConfig.gcpProjectId
    )

    // Create or get OAuth client
    const displayName = `${config.platform.charAt(0).toUpperCase() + config.platform.slice(1)} OAuth Client`
    const { clientId, clientSecret } = await oauthClient.createClient(
      displayName,
      redirectUris,
      [] // No JavaScript origins for server-side auth
    )

    return {
      success: true,
      registeredUrls: redirectUris,
      clientId,
      providerDetails: {
        clientSecret,
        projectId: config.projectConfig.gcpProjectId,
      },
    }
  }

  /**
   * Update callback URLs for GCP
   */
  private async updateGcpCallbackUrls(
    config: CallbackUrlConfig,
    redirectUris: string[]
  ): Promise<UpdateResult> {
    if (!config.projectConfig?.gcpProjectId) {
      throw new SetupAuthError("GCP project ID is required")
    }

    // Get client ID from environment or config
    const clientId = process.env.GCP_OAUTH_CLIENT_ID?.replace(
      /\.apps\.googleusercontent\.com$/,
      ""
    )
    if (!clientId) {
      throw new SetupAuthError(
        "GCP OAuth client ID not found. Please run setup first."
      )
    }

    const identity = await GcpIdentityFactory.createIdentity()
    const oauthClient = new GcpOAuthWebClientManager(
      identity,
      config.projectConfig.gcpProjectId
    )

    await oauthClient.updateRedirectUris(clientId, redirectUris)

    return {
      success: true,
      redirectUris,
    }
  }

  /**
   * Register callback URLs for GitHub
   */
  private async registerGitHubCallbackUrls(
    config: CallbackUrlConfig,
    redirectUris: string[]
  ): Promise<CallbackUrlRegistrationResult> {
    // TODO: Implement GitHub OAuth app creation
    throw new SetupAuthError("GitHub OAuth app creation not yet implemented")
  }

  /**
   * Update callback URLs for GitHub
   */
  private async updateGitHubCallbackUrls(
    config: CallbackUrlConfig,
    redirectUris: string[]
  ): Promise<UpdateResult> {
    // TODO: Implement GitHub OAuth app update
    throw new SetupAuthError("GitHub OAuth app update not yet implemented")
  }

  /**
   * Register callback URLs for Azure
   */
  private async registerAzureCallbackUrls(
    config: CallbackUrlConfig,
    redirectUris: string[]
  ): Promise<CallbackUrlRegistrationResult> {
    // TODO: Implement Azure AD app registration
    throw new SetupAuthError("Azure AD app registration not yet implemented")
  }

  /**
   * Update callback URLs for Azure
   */
  private async updateAzureCallbackUrls(
    config: CallbackUrlConfig,
    redirectUris: string[]
  ): Promise<UpdateResult> {
    // TODO: Implement Azure AD app update
    throw new SetupAuthError("Azure AD app update not yet implemented")
  }

  /**
   * Register callback URLs for LinkedIn
   */
  private async registerLinkedInCallbackUrls(
    config: CallbackUrlConfig,
    redirectUris: string[]
  ): Promise<CallbackUrlRegistrationResult> {
    // TODO: Implement LinkedIn OAuth app creation
    throw new SetupAuthError("LinkedIn OAuth app creation not yet implemented")
  }

  /**
   * Update callback URLs for LinkedIn
   */
  private async updateLinkedInCallbackUrls(
    config: CallbackUrlConfig,
    redirectUris: string[]
  ): Promise<UpdateResult> {
    // TODO: Implement LinkedIn OAuth app update
    throw new SetupAuthError("LinkedIn OAuth app update not yet implemented")
  }
}

/**
 * Convenience function to register callback URLs
 *
 * @param config Configuration for callback URL registration
 * @returns Promise resolving to registration result
 */
export async function registerCallbackUrls(
  config: CallbackUrlConfig
): Promise<CallbackUrlRegistrationResult> {
  return SetupAuthAPI.getInstance().registerCallbackUrls(config)
}

/**
 * Convenience function to update callback URLs
 *
 * @param config Configuration for callback URL update
 * @returns Promise resolving to update result
 */
export async function updateCallbackUrls(
  config: CallbackUrlConfig
): Promise<UpdateResult> {
  return SetupAuthAPI.getInstance().updateCallbackUrls(config)
}

// Export types for external use
export type { CallbackUrlConfig, CallbackUrlRegistrationResult }
