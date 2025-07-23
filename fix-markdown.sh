#!/bin/bash

# Fix markdown formatting issues
echo "Fixing markdown formatting..."

# Fix trailing spaces
find . -name "*.md" -exec sed -i '' 's/[[:space:]]*$//' {} \;

# Fix list indentation (change 4 spaces to 2 spaces)
find . -name "*.md" -exec sed -i '' 's/^    - /  - /g' {} \;

# Add blank lines around headings (simplified approach)
# This is a basic fix - more complex cases may need manual review
find . -name "*.md" -exec sed -i '' 's/^### \(.*\)$/\n### \1\n/g' {} \;
find . -name "*.md" -exec sed -i '' 's/^#### \(.*\)$/\n#### \1\n/g' {} \;

# Add blank lines around lists (basic approach)
find . -name "*.md" -exec sed -i '' 's/^  - \(.*\)$/\n  - \1\n/g' {} \;

# Fix code block spacing
find . -name "*.md" -exec sed -i '' 's/^```/\n```/g' {} \;
find . -name "*.md" -exec sed -i '' 's/```$/```\n/g' {} \;

# Remove duplicate blank lines
find . -name "*.md" -exec sed -i '' '/^$/N;/^\n$/D' {} \;

echo "Markdown formatting fixes applied!"
echo "Run 'pnpm lint:md' to check remaining issues." 