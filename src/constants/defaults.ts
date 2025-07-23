import { OAuthProvider } from "../types/index.js"

/**
 * Default callback paths for each auth oauthProvider
 */
export const DEFAULT_CALLBACK_PATHS: Record<OAuthProvider, string> = {
  gcp: "/api/auth/callback/gcp",
  github: "/api/auth/callback/github",
  azure: "/api/auth/callback/azure-ad",
  linkedin: "/api/auth/callback/linkedin",
}

/**
 * Default platform-specific settings
 */
export const DEFAULT_PLATFORMS = {
  vercel: {
    domain: "vercel.app",
    previewPattern: "{branch}--{project}",
  },
  opennext: {
    domain: "custom",
    previewPattern: "preview-{branch}.{project}",
  },
  netlify: {
    domain: "netlify.app",
    previewPattern: "deploy-preview-{pr}--{project}",
  },
}
