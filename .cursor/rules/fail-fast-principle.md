# Fail Fast Principle

## Core Principle: Fail Fast, Fail Loud, Fail Early

This codebase adheres to the "Fail Fast" principle - when something goes wrong,
the system should immediately throw a clear, descriptive error rather than
silently continuing with potentially incorrect behavior.

### ✅ Good Examples

```typescript
// GOOD: Throw immediately when colors can't be extracted
if (!gradientStartHex || !gradientEndHex) {
  throw new Error(
    `CRITICAL: Cannot extract brand colors from globals.css! ` +
      `This violates the single source of truth principle.`
  )
}
```

```typescript
// GOOD: Validate inputs early
function processUserData(data: unknown) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid data: Expected object, got " + typeof data)
  }
  // Continue processing...
}
```

### ❌ Bad Examples

```typescript
// BAD: Silent fallback that hides the real problem
const color = extractColor() || "#ffffff" // Wrong! Hides extraction failure

// BAD: Returning null/undefined and letting caller deal with it
function getConfig() {
  try {
    return loadConfig()
  } catch {
    return null // Caller won't know what went wrong
  }
}

// BAD: Logging error but continuing with wrong data
if (!isValid(data)) {
  console.warn("Data validation failed, using defaults")
  return defaultData // Wrong! Should throw instead
}
```

### Why Fail Fast?

1. **Early Detection**: Problems are caught during development, not production
2. **Clear Debugging**: Immediate, descriptive errors make debugging easier
3. **Prevents Cascading Failures**: Stops bad data from propagating through the
   system
4. **Forces Proper Error Handling**: Developers must explicitly handle error
   cases
5. **Maintains Data Integrity**: Prevents silent corruption or wrong behavior

### Implementation Guidelines

- **Validate Early**: Check inputs and preconditions at function entry
- **Descriptive Errors**: Include context about what failed and why
- **No Silent Fallbacks**: Don't hide failures with default values
- **Fail Immediately**: Don't defer error handling to callers unless explicitly
  designed
- **Log Before Throwing**: Provide debugging information in error logs

### For AI Agents

When writing code, always prefer throwing descriptive errors over:

- Returning null/undefined
- Using fallback/default values
- Logging warnings and continuing
- Silently ignoring errors

The goal is to make problems **impossible to ignore** during development.
