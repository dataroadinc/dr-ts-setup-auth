class SetupAuthError extends Error {
  originalError: Error | undefined
  code?: string

  constructor(message: string, options?: { code?: string; cause?: unknown }) {
    // Call super with the original message directly
    super(message)

    // Keep the original logic for wrapping the originalError
    if (options?.cause instanceof Error) {
      this.originalError = options.cause
    } else if (options?.cause) {
      const errorMessage = `Non-Error exception: ${String(options.cause)}`
      this.originalError = new Error(errorMessage)
      if (
        typeof options.cause === "object" &&
        options.cause &&
        "message" in options.cause
      ) {
        this.originalError.message = `Wrapped error: ${(options.cause as { message?: string }).message}`
      }
      this.originalError.name = "WrappedError"
    }
    if (options?.code) {
      this.code = options.code
    }
  }

  // Override toString to include original error details [[7]]
  toString(): string {
    // If this is a reauthentication error, just show the message (which includes instructions)
    if (this.isReauthenticationError()) {
      return this.message
    }

    // Otherwise show the full error details
    let result = `${this.name}: ${this.message}`
    if (this.originalError) {
      if (this.originalError instanceof SetupAuthError) {
        result += "\n" + this.originalError.toString()
      } else {
        result += `\nOriginal Error: ${this.originalError.name}: ${this.originalError.message}`
      }
    }
    return result
  }

  isReauthenticationError(): boolean {
    if (this.originalError instanceof SetupAuthError) {
      return this.originalError.isReauthenticationError()
    }
    interface ErrorWithSubtype extends Error {
      response?: {
        data?: {
          error_subtype?: string
          error?: string
          error_description?: string
        }
      }
    }
    if (this.originalError) {
      const error = this.originalError as ErrorWithSubtype
      // Check for the reauth conditions
      if (
        error.response?.data?.error_subtype === "invalid_rapt" ||
        (error.response?.data?.error === "invalid_grant" &&
          error.response?.data?.error_description?.includes("reauth"))
      ) {
        // Only return true, do not modify the message here
        return true
      }
    }
    return false
  }
}
export { SetupAuthError }
