# @dataroadinc/setup-auth

[![npm version](https://img.shields.io/npm/v/@dataroadinc/setup-auth.svg)](https://www.npmjs.com/package/@dataroadinc/setup-auth)
[![npm downloads](https://img.shields.io/npm/dm/@dataroadinc/setup-auth.svg)](https://www.npmjs.com/package/@dataroadinc/setup-auth)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/dataroadinc/dr-ts-setup-auth/workflows/CI/badge.svg)](https://github.com/dataroadinc/dr-ts-setup-auth/actions?query=workflow%3ACI)
[![Release](https://github.com/dataroadinc/dr-ts-setup-auth/actions/workflows/release.yml/badge.svg)](https://github.com/dataroadinc/dr-ts-setup-auth/actions/workflows/release.yml)
[![Node.js Version](https://img.shields.io/node/v/@dataroadinc/setup-auth)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue.svg)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.10.0-orange.svg)](https://pnpm.io/)

Authentication setup utilities for various cloud platforms and OAuth providers.
This CLI tool helps developers and administrators set up OAuth authentication
for their applications across multiple cloud providers.

## Features

- **Multi-Platform Support**: Google Cloud Platform, Azure AD, GitHub OAuth
- **Automated Setup**: Streamlined OAuth client creation and configuration
- **Vercel Integration**: Automatic redirect URL management for Vercel
  deployments
- **Service Account Management**: GCP service account and IAM role setup
- **Webhook Support**: Automated redirect URL updates via webhooks
- **Stateless Versioning**: Dynamic changelog generation with
  `@dataroadinc/versioning`
- **Programmatic API**: Stable, versioned API for callback URL registration

## Installation

> **Recommended:** Install as a devDependency unless you need to use the
> programmatic API at runtime.

### As a devDependency (CLI usage only)

```bash
npm install --save-dev @dataroadinc/setup-auth
```

or with pnpm:

```bash
pnpm add -D @dataroadinc/setup-auth
```

### As a regular dependency (if using programmatic API)

If you need to use the programmatic API in your application code (e.g., for
webhook handlers), install as a regular dependency:

```bash
npm install @dataroadinc/setup-auth
```

or with pnpm:

```bash
pnpm add @dataroadinc/setup-auth
```

> **Use as a devDependency** if you only use the CLI or scripts in CI/CD, not in
> your app's runtime code. If you import it in your application code, use a
> regular dependency.

## Quick Start

### Development

For development, you can run the CLI directly using `tsx`:

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp env.local.example .env.local
# Edit .env.local with your configuration

# Run the CLI
pnpm start --help
```

### Production

For production use, it's recommended to use `tsx` to run the TypeScript source
directly, which handles path mapping automatically:

```bash
# Install tsx globally
npm install -g tsx

# Run the CLI
tsx src/index.js --help
```

Alternatively, you can build and run the compiled version, but you'll need to
handle path mapping:

```bash
# Build the project
pnpm build

# Run with path mapping (requires tsconfig-paths)
npx tsconfig-paths/register node dist/index.js --help
```

## Programmatic API

The setup-auth package now provides a stable, programmatic API that allows
programs to register callback URLs and perform OAuth setup operations without
relying on CLI commands.

### Basic Usage

```typescript
import {
  registerCallbackUrls,
  updateCallbackUrls,
  type CallbackUrlConfig,
} from "@dataroadinc/setup-auth"

// Register callback URLs for a new deployment
const config: CallbackUrlConfig = {
  provider: "gcp",
  platform: "vercel",
  deploymentUrl: "https://my-app-abc123.vercel.app",
  callbackPath: "/api/auth/callback/gcp",
  projectConfig: {
    gcpProjectId: process.env.GCP_OAUTH_PROJECT_ID!,
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

### Integration Examples

#### Next.js API Route

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

#### CI/CD Pipeline

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

For complete documentation on the programmatic API, see
[Programmatic API Guide](docs/programmatic-api.md).

## Configuration

Create a `.env.local` file in the root directory with the required environment
variables. See `env.local.example` for a complete list of all available
variables.

### Required Variables

```env
# Organization Configuration
EKG_ORG_PRIMARY_DOMAIN=your-domain.com

# Project Configuration
EKG_PROJECT_NAME=your-project-name

# Google Cloud Platform OAuth Configuration
GCP_OAUTH_ALLOWED_DOMAINS=your-domain.com,another-domain.com
GCP_OAUTH_ORGANIZATION_ID=your-gcp-organization-id
GCP_OAUTH_PROJECT_ID=your-gcp-project-id
GCP_OAUTH_APPLICATION_CREDENTIALS=/path/to/your/service-account-key.json

# Vercel Configuration
VERCEL_TEAM_ID=team_xxxxxxxxxxxxxxxxxxxx
VERCEL_PROJECT_ID=prj_xxxxxxxxxxxxxxxxxxxx
VERCEL_PROJECT_NAME=your-vercel-project-name
VERCEL_ACCESS_TOKEN=your-vercel-access-token

# OAuth Client Configuration (will be created by setup commands)
GCP_OAUTH_CLIENT_ID=
GCP_OAUTH_CLIENT_SECRET=

```

### Optional Variables

Many additional variables are available for customization. See
`env.local.example` for the complete list including:

- Organization branding and metadata
- Project descriptions and labels
- Internal and external endpoint URLs
- Authentication secrets
- Azure AD and GitHub OAuth configuration
- SPARQL endpoint configuration

## Available Commands

- `gcp-setup-service-account` - [ADMIN ONLY] One-time setup: Creates service
  account, IAM roles, and OAuth consent screen
- `gcp-setup-oauth` - [DEVELOPER] Per-deployment setup: Creates/updates OAuth
  clients for end-user authentication
- `github-setup-oauth` - Set up "Login with GitHub" (GitHub OAuth) for the given
  project
- `azure-setup-oauth` - Set up "Login with Microsoft" (Azure AD OAuth) for the
  given project
- `gcp-view` - View various types of items around the OAuth2 setup
- `update-redirect-urls` - Update OAuth redirect URLs for a deployment
- `setup-webhook` - Set up a webhook for automatic redirect URL updates
- `login` - Perform cloud provider login (GCP user, ADC, service account, Azure,
  AWS, etc.)

## Documentation

Comprehensive documentation is available in the [`docs/`](docs/) directory:

- **[Development Guide](docs/development.md)** - Complete setup and workflow
- **[Code Formatting](docs/formatting.md)** - IDE setup and formatting rules
- **[Markdown Formatting](docs/markdown-formatting.md)** - Documentation
  standards
- **[Versioning](docs/versioning.md)** - Stateless versioning with
  `dr-ts-versioning`
- **[Open Source Release](docs/open-source-release.md)** - Release planning and
  status
- **[Vercel Integration](docs/vercel-integration.md)** - Vercel integration
  details
- **[GCP Integration](docs/gcp-integration.md)** - Google Cloud Platform
  integration
- **[Automation and Testing](docs/automation-testing.md)** - Automation
  principles and testing
- **[Authentication and Workflow](docs/authentication-workflow.md)** -
  Authentication automation
- **[OAuth Automation](docs/oauth-automation.md)** - OAuth automation details

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm start

# Build for production
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint

# Format code
pnpm format

```

## License

MIT
