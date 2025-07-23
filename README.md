# dr-ts-setup-auth

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
- **Stateless Versioning**: Dynamic changelog generation with `dr-ts-versioning`

## Installation

```bash
npm install dr-ts-setup-auth
```

or with pnpm:

```bash
pnpm add -D dr-ts-setup-auth
```

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
- **[Versioning](docs/versioning.md)** - Stateless versioning with
  `dr-ts-versioning`

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
