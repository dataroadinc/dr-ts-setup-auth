# Markdown File Naming Convention

## Rule: All markdown files must use kebab-case naming

All `.md` and `.mdx` files in this codebase must follow kebab-case naming
conventions.

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

### Exception

- `README.md` files are the ONLY exception and should always be uppercase

### Rationale

- **Consistency**: Uniform naming across all documentation
- **URL-friendly**: Kebab-case works well in URLs and file systems
- **Readability**: Easy to read and understand
- **Cross-platform**: Works consistently across different operating systems
- **Git-friendly**: Avoids case sensitivity issues in version control

### Implementation

- All existing files must be renamed to follow this convention
- New files must follow this convention from creation
- AI agents and developers must enforce this rule
