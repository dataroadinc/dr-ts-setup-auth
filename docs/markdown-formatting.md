# Markdown Formatting Rules

This document outlines the formatting standards for all markdown files in this
project.

## Line Length

- **Maximum line length**: 80 characters
- **Wrap long lines**: Use line feeds to break lines at appropriate points
- **Code blocks**: May exceed 80 characters for readability
- **URLs**: May exceed 80 characters if they cannot be broken

## Spacing Rules

### Headings

- **After headings**: Always add a blank line after each heading
- **Before headings**: No blank line needed before the first heading in a file

```markdown
# Main Heading

## Subheading

### Section Heading

Content starts here.
```

### Lists

- **Before lists**: Always add a blank line before each list
- **After lists**: Add a blank line after each list
- **Between list items**: No blank line needed between items

```markdown
Here is some content.

- First list item
- Second list item
- Third list item

More content follows.
```

### Code Blocks

- **Before code blocks**: Add a blank line before code blocks
- **After code blocks**: Add a blank line after code blocks

````markdown
Here is some content.

```bash
pnpm install
pnpm start
```
````

More content follows.

````

## File Naming Convention

All markdown files must use kebab-case naming:

### ✅ Correct Examples

- `color-architecture.md`
- `single-source-of-truth.md`
- `logo-system.md`
- `testing-guide.md`
- `api-documentation.md`
- `README.md` (EXCEPTION - always uppercase)

### ❌ Incorrect Examples

- `ColorArchitecture.md` (PascalCase)
- `color_architecture.md` (snake_case)
- `colorArchitecture.md` (camelCase)
- `Color Architecture.md` (spaces)
- `TESTING_GUIDE.md` (SCREAMING_SNAKE_CASE)

## Content Structure

### Headings

- Use `#` for main title (only one per file)
- Use `##` for major sections
- Use `###` for subsections
- Use `####` for minor subsections (avoid deeper nesting)

### Lists

- Use `-` for unordered lists
- Use `1.` for ordered lists
- Indent nested lists with 2 spaces

### Code

- Use backticks for inline code: `pnpm install`
- Use triple backticks for code blocks with language specification
- Use triple backticks without language for plain text blocks

### Links

- Use descriptive link text
- Include file extensions for internal links
- Use relative paths for internal links

## Examples

### Good Formatting

```markdown
# Project Documentation

This is the main documentation file for our project.

## Installation

To install the project dependencies:

```bash
pnpm install
````

## Configuration

The project requires several environment variables:

- `NODE_ENV`: The environment (development, production)
- `DATABASE_URL`: The database connection string
- `API_KEY`: The API key for external services

## Usage

Here's how to use the project:

1. Install dependencies
2. Configure environment variables
3. Run the development server

### Development

For development, use the following command:

```bash
pnpm dev
```

````

### Bad Formatting

```markdown
# Project Documentation
This is the main documentation file for our project.
## Installation
To install the project dependencies:
```bash
pnpm install
````

## Configuration

The project requires several environment variables:

- `NODE_ENV`: The environment (development, production)
- `DATABASE_URL`: The database connection string
- `API_KEY`: The API key for external services

## Usage

Here's how to use the project:

1. Install dependencies
2. Configure environment variables
3. Run the development server

### Development

For development, use the following command:

```bash
pnpm dev
```

```

## Enforcement

These rules are enforced by:

- **Prettier**: Automatic formatting on save
- **ESLint**: Markdown linting with markdownlint
- **Pre-commit hooks**: Format checking before commits
- **CI/CD**: Automated checks in pull requests

## Tools

- **Prettier**: Handles basic markdown formatting
- **markdownlint**: Enforces markdown best practices
- **VS Code/Cursor**: Automatic formatting on save
```
