# Code Formatting

This project uses Prettier for consistent code formatting across all
environments. The configuration is set up to ensure that VS Code/Cursor and the
CLI use the same formatting rules.

## Configuration Files

- **`prettier.config.js`** - Main Prettier configuration
- **`.prettierignore`** - Files to exclude from formatting
- **`.vscode/settings.json`** - VS Code/Cursor settings
- **`.vscode/extensions.json`** - Recommended VS Code extensions
- **`dr-ts-setup-auth.code-workspace`** - Workspace configuration

## Key Settings

### Prettier Configuration

- **Tab Width**: 2 spaces for TypeScript/JavaScript, 4 for other files
- **Print Width**: 80 characters
- **Semicolons**: Disabled
- **Single Quotes**: Disabled (uses double quotes)
- **Trailing Commas**: ES5 style

### VS Code/Cursor Settings

- **Default Formatter**: Prettier
- **Format on Save**: Enabled
- **Format on Paste**: Enabled
- **ESLint Auto-fix**: Enabled on save
- **Config Path**: Explicitly set to `prettier.config.js`

## Commands

```bash
# Format all files
pnpm format

# Check formatting without changing files
pnpm format:check

# Lint code
pnpm lint

# Run tests
pnpm test
```

## Troubleshooting

If you experience formatting inconsistencies:

1. **Ensure Prettier extension is installed** in VS Code/Cursor
2. **Reload the window** after configuration changes
3. **Check that the workspace is using the project settings** (not user
   settings)
4. **Run `pnpm format`** to ensure all files are properly formatted
5. **Verify the Prettier extension is using the project config** by checking the
   status bar

## IDE Setup

### VS Code/Cursor

1. Install the recommended extensions (they will be prompted automatically)
2. The workspace settings will automatically configure Prettier
3. Format on save is enabled by default

### Other IDEs

- Ensure Prettier is configured to use `prettier.config.js`
- Set the config path explicitly if needed
- Enable format on save for the best experience

## Pre-commit Hooks

The project uses Husky to run formatting checks before commits:

- Prettier formatting check
- ESLint linting
- Commit message validation

This ensures all committed code follows the project's formatting standards.
