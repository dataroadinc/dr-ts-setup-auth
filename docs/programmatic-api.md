# Programmatic API for setup-auth

## Overview

The setup-auth package now provides a stable, programmatic API that allows
programs to register callback URLs and perform OAuth setup operations without
relying on CLI commands. This enables seamless integration with deployment
pipelines, CI/CD systems, and other automation tools.

## Installation

```bash
pnpm add @dataroadinc/setup-auth
```

## Basic Usage

### Import the API

```typescript
import {
  registerCallbackUrls,
  updateCallbackUrls,
  type CallbackUrlConfig,
} from "@dataroadinc/setup-auth"
```

### Register Callback URLs

```typescript
const config: CallbackUrlConfig = {
  provider: "gcp",
  platform: "vercel",
  deploymentUrl: "https://my-app-abc123.vercel.app",
  callbackPath: "/api/auth/callback/gcp",
  projectConfig: {
    gcpProjectId: "my-gcp-project-id",
    gcpOrganizationId: "my-gcp-org-id",
  },
}

const result = await registerCallbackUrls(config)

if (result.success) {
  console.log("Callback URLs registered successfully:", result.registeredUrls)
  console.log("OAuth Client ID:", result.clientId)
} else {
  console.error("Registration failed:", result.error)
}
```

### Update Existing Callback URLs

```typescript
const config: CallbackUrlConfig = {
  provider: "gcp",
  platform: "vercel",
  deploymentUrl: "https://my-app-def456.vercel.app",
  projectConfig: {
    gcpProjectId: "my-gcp-project-id",
  },
}

const result = await updateCallbackUrls(config)

if (result.success) {
  console.log("Callback URLs updated successfully:", result.redirectUris)
} else {
  console.error("Update failed:", result.error)
}
```

## Configuration Options

### CallbackUrlConfig

| Property           | Type            | Required | Description                                                        |
| ------------------ | --------------- | -------- | ------------------------------------------------------------------ |
| `provider`         | `OAuthProvider` | Yes      | OAuth provider: `'gcp'`, `'github'`, `'azure'`, `'linkedin'`       |
| `platform`         | `PlatformType`  | Yes      | Platform: `'vercel'`, `'opennext'`, `'netlify'`                    |
| `deploymentUrl`    | `string`        | No       | Current deployment URL to register                                 |
| `callbackPath`     | `string`        | No       | Custom callback path (defaults to `/api/auth/callback/{provider}`) |
| `additionalUrls`   | `string[]`      | No       | Additional URLs to include in redirect URIs                        |
| `wildcardPatterns` | `string[]`      | No       | Wildcard patterns for dynamic URLs                                 |
| `projectConfig`    | `object`        | Yes      | Provider-specific configuration                                    |

### Provider-Specific Configuration

#### GCP Configuration

```typescript
const gcpConfig: CallbackUrlConfig = {
  provider: "gcp",
  platform: "vercel",
  projectConfig: {
    gcpProjectId: "my-gcp-project-id",
    gcpOrganizationId: "my-gcp-org-id", // Optional
  },
}
```

#### GitHub Configuration

```typescript
const githubConfig: CallbackUrlConfig = {
  provider: "github",
  platform: "vercel",
  projectConfig: {
    githubAppName: "my-github-app-name",
  },
}
```

#### Azure Configuration

```typescript
const azureConfig: CallbackUrlConfig = {
  provider: "azure",
  platform: "vercel",
  projectConfig: {
    azureTenantId: "my-azure-tenant-id",
  },
}
```

## Integration Examples

### Vercel Deployment Hook

```typescript
// vercel.json
{
  "functions": {
    "api/auth/setup.js": {
      "runtime": "nodejs18.x"
    }
  }
}
```

```typescript
// api/auth/setup.js
import { registerCallbackUrls } from "@dataroadinc/setup-auth"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { deploymentUrl } = req.body

  const config = {
    provider: "gcp",
    platform: "vercel",
    deploymentUrl,
    projectConfig: {
      gcpProjectId: process.env.GCP_OAUTH_PROJECT_ID,
    },
  }

  const result = await registerCallbackUrls(config)

  if (result.success) {
    res.status(200).json({
      success: true,
      clientId: result.clientId,
      registeredUrls: result.registeredUrls,
    })
  } else {
    res.status(500).json({
      success: false,
      error: result.error,
    })
  }
}
```

### Next.js API Route

```typescript
// pages/api/auth/setup.ts
import { NextApiRequest, NextApiResponse } from "next"
import { updateCallbackUrls } from "@dataroadinc/setup-auth"

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const config = {
    provider: "gcp" as const,
    platform: "vercel" as const,
    deploymentUrl: process.env.VERCEL_URL,
    projectConfig: {
      gcpProjectId: process.env.GCP_OAUTH_PROJECT_ID!,
    },
  }

  const result = await updateCallbackUrls(config)

  if (result.success) {
    res.status(200).json({
      success: true,
      redirectUris: result.redirectUris,
    })
  } else {
    res.status(500).json({
      success: false,
      error: result.error,
    })
  }
}
```

### CI/CD Pipeline Integration

```yaml
# .github/workflows/deploy.yml
name: Deploy and Setup Auth

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "18"

      - name: Install dependencies
        run: pnpm install

      - name: Deploy to Vercel
        run: vercel --prod

      - name: Setup OAuth Callback URLs
        run: |
          node -e "
          const { registerCallbackUrls } = require('@dataroadinc/setup-auth');

          registerCallbackUrls({
            provider: 'gcp',
            platform: 'vercel',
            deploymentUrl: process.env.VERCEL_URL,
            projectConfig: {
              gcpProjectId: process.env.GCP_OAUTH_PROJECT_ID
            }
          }).then(result => {
            if (result.success) {
              console.log('OAuth setup successful:', result.clientId);
            } else {
              console.error('OAuth setup failed:', result.error);
              process.exit(1);
            }
          });
          "
        env:
          VERCEL_URL: ${{ steps.deploy.outputs.url }}
          GCP_OAUTH_PROJECT_ID: ${{ secrets.GCP_OAUTH_PROJECT_ID }}
```

## Error Handling

The API returns structured results with success/error information:

```typescript
interface CallbackUrlRegistrationResult {
  success: boolean
  error?: string
  registeredUrls?: string[]
  clientId?: string
  providerDetails?: Record<string, unknown>
}
```

### Common Error Scenarios

```typescript
const result = await registerCallbackUrls(config)

if (!result.success) {
  switch (result.error) {
    case "GCP project ID is required":
      console.error("Please provide a valid GCP project ID")
      break
    case "GCP OAuth client ID not found":
      console.error("Please run setup first to create OAuth client")
      break
    case "Authentication failed":
      console.error("Please check your GCP credentials")
      break
    default:
      console.error("Unknown error:", result.error)
  }
}
```

## Environment Variables

The API uses the same environment variables as the CLI:

### GCP Configuration

```bash
GCP_OAUTH_PROJECT_ID=your-project-id
GCP_OAUTH_ORGANIZATION_ID=your-organization-id
GCP_OAUTH_CLIENT_ID=your-client-id
GCP_OAUTH_CLIENT_SECRET=your-client-secret
```

### Vercel Configuration

```bash
VERCEL_ACCESS_TOKEN=your-vercel-token
VERCEL_PROJECT_NAME=your-project-name
VERCEL_URL=https://your-deployment.vercel.app
```

### GitHub Configuration

```bash
GITHUB_OAUTH_ID=your-github-oauth-id
GITHUB_OAUTH_SECRET=your-github-oauth-secret
```

## Best Practices

### 1. Error Handling

Always check the `success` property and handle errors appropriately:

```typescript
const result = await registerCallbackUrls(config)
if (!result.success) {
  // Log error and potentially retry or fail gracefully
  console.error("OAuth setup failed:", result.error)
  return
}
```

### 2. Configuration Validation

Validate configuration before making API calls:

```typescript
function validateConfig(config: CallbackUrlConfig): boolean {
  if (!config.provider || !config.platform) {
    console.error("Provider and platform are required")
    return false
  }

  if (config.provider === "gcp" && !config.projectConfig?.gcpProjectId) {
    console.error("GCP project ID is required for GCP provider")
    return false
  }

  return true
}
```

### 3. Retry Logic

Implement retry logic for transient failures:

```typescript
async function registerWithRetry(config: CallbackUrlConfig, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const result = await registerCallbackUrls(config)
    if (result.success) {
      return result
    }

    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
    }
  }

  throw new Error("Failed to register callback URLs after retries")
}
```

### 4. Environment-Specific Configuration

Use different configurations for different environments:

```typescript
const getConfig = (environment: string): CallbackUrlConfig => ({
  provider: "gcp",
  platform: "vercel",
  deploymentUrl: process.env[`${environment.toUpperCase()}_DEPLOYMENT_URL`],
  projectConfig: {
    gcpProjectId: process.env[`${environment.toUpperCase()}_GCP_PROJECT_ID`],
  },
})

// Usage
const devConfig = getConfig("dev")
const prodConfig = getConfig("prod")
```

## Migration from CLI

If you're currently using CLI commands, here's how to migrate:

### Before (CLI)

```bash
setup-auth gcp-setup-oauth --platform vercel --deployment-url https://my-app.vercel.app
```

### After (Programmatic API)

```typescript
import { registerCallbackUrls } from "@dataroadinc/setup-auth"

const result = await registerCallbackUrls({
  provider: "gcp",
  platform: "vercel",
  deploymentUrl: "https://my-app.vercel.app",
  projectConfig: {
    gcpProjectId: process.env.GCP_OAUTH_PROJECT_ID,
  },
})
```

## TypeScript Support

The API is fully typed with TypeScript:

```typescript
import type {
  CallbackUrlConfig,
  CallbackUrlRegistrationResult,
  OAuthProvider,
  PlatformType,
} from "@dataroadinc/setup-auth"

// Type-safe configuration
const config: CallbackUrlConfig = {
  provider: "gcp", // TypeScript will ensure this is a valid OAuthProvider
  platform: "vercel", // TypeScript will ensure this is a valid PlatformType
  // ... other properties
}
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Ensure GCP credentials are properly configured
   - Run `gcloud auth application-default login` if needed

2. **Missing Environment Variables**
   - Check that all required environment variables are set
   - Use the same variables as the CLI version

3. **Permission Errors**
   - Ensure the service account has necessary permissions
   - Check IAM roles and policies

4. **Network Errors**
   - Check internet connectivity
   - Verify firewall settings
   - Implement retry logic for transient failures

### Debug Mode

Enable debug logging by setting the `DEBUG` environment variable:

```bash
DEBUG=setup-auth:* node your-script.js
```

## API Versioning

The programmatic API follows semantic versioning. Breaking changes will be
introduced in major versions, while new features will be added in minor
versions.

Current API version: `1.0.0`

## Support

For issues and questions:

1. Check the [CLI documentation](docs/development.md) for general setup-auth
   information
2. Review the [OAuth automation documentation](docs/oauth-automation.md) for
   provider-specific details
3. Open an issue on GitHub for API-specific problems
