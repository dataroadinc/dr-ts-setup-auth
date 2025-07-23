# Development Guide

This guide covers the development setup and workflow for the `dr-ts-setup-auth`
project.

## Prerequisites

- Node.js >= 22.0.0
- pnpm >= 10.0.0
- Git

## Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd dr-ts-setup-auth

# Install dependencies
pnpm install

# Set up environment variables
cp env.local.example .env.local
# Edit .env.local with your configuration

# Run in development mode
pnpm start --help
```

## Development Commands

```bash
# Start development server
pnpm start

# Build for production
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint

# Format code
pnpm format

# Check formatting
pnpm format:check
```

## Project Structure

```
src/
├── commands/          # CLI commands
│   ├── gcp/          # Google Cloud Platform commands
│   ├── github.ts     # GitHub OAuth setup
│   ├── azure.ts      # Azure AD OAuth setup
│   └── login.ts      # Cloud provider login
├── providers/         # Cloud provider integrations
│   ├── gcp/          # Google Cloud Platform
│   └── vercel/       # Vercel integration
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
└── constants/        # Default configurations
```

## Environment Configuration

Create a `.env.local` file with your configuration:

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
```

See `env.local.example` for the complete list of available variables.

## Testing

The project uses Vitest for testing:

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run specific test file
pnpm test src/providers/gcp/oauth/client.test.ts
```

## Code Quality

### Linting

ESLint is configured with TypeScript support:

```bash
# Lint all files
pnpm lint

# Lint specific files
pnpm lint src/commands/
```

### Formatting

Prettier ensures consistent code formatting:

```bash
# Format all files
pnpm format

# Check formatting without changes
pnpm format:check
```

## Git Workflow

### Conventional Commits

This project uses conventional commits for versioning:

```bash
# Feature
git commit -m "feat(auth): add OAuth client setup"

# Bug fix
git commit -m "fix(gcp): resolve service account creation issue"

# Documentation
git commit -m "docs(readme): update installation instructions"
```

### Pre-commit Hooks

Husky runs pre-commit checks:

- Prettier formatting
- ESLint linting
- Commit message validation

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

## Troubleshooting

### Common Issues

1. **Path mapping errors**: Ensure you're using `tsx` to run TypeScript files
   directly
2. **Environment variables**: Check that `.env.local` is properly configured
3. **Authentication errors**: Verify your cloud provider credentials
4. **Formatting conflicts**: Run `pnpm format` to resolve formatting issues

### Getting Help

- Check the [formatting guide](formatting.md) for code formatting setup
- Check the [versioning guide](versioning.md) for version management
- Review the [PLAN.md](../PLAN.md) for project roadmap
- Open an issue on GitHub for bugs or feature requests
