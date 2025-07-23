import { SetupAuthError } from "@/utils/error.js"
import { execFile, spawn } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

/**
 * GcpCloudCliClient wraps all logic for executing gcloud CLI commands,
 * checking installation, version, authentication, and parsing output.
 */
export class GcpCloudCliClient {
  /**
   * Checks if gcloud is installed and available in PATH.
   * Throws an error if not found.
   */
  async checkInstalled(): Promise<void> {
    try {
      await execFileAsync("gcloud", ["--version"])
    } catch {
      throw new Error(
        "gcloud CLI is not installed or not in PATH. Please install gcloud."
      )
    }
  }

  /**
   * Returns the gcloud version string (e.g., 'Google Cloud SDK 474.0.0').
   */
  async getVersion(): Promise<string> {
    await this.checkInstalled()
    const { stdout } = await execFileAsync("gcloud", ["--version"], {
      encoding: "utf8",
    })
    return stdout.trim()
  }

  /**
   * Checks if gcloud is authenticated (has at least one active account).
   * Throws an error if not authenticated.
   */
  async checkAuthenticated(): Promise<void> {
    await this.checkInstalled()
    const { stdout } = await execFileAsync(
      "gcloud",
      ["auth", "list", "--format=json"],
      { encoding: "utf8" }
    )
    const accounts = JSON.parse(stdout)
    if (
      !Array.isArray(accounts) ||
      accounts.length === 0 ||
      !accounts.some(
        (a: unknown) =>
          typeof a === "object" &&
          a !== null &&
          (a as { status?: string }).status === "ACTIVE"
      )
    ) {
      throw new Error(
        "gcloud CLI is not authenticated. Run 'gcloud auth login' and try again."
      )
    }
  }

  /**
   * Checks if gcloud Application Default Credentials (ADC) are set up.
   * Throws SetupAuthError if not.
   */
  async checkApplicationDefaultAuthenticated(): Promise<void> {
    await this.checkInstalled()
    try {
      await execFileAsync("gcloud", [
        "auth",
        "application-default",
        "print-access-token",
      ])
    } catch (err) {
      // Type assertion to access possible 'stderr' property from execFile error
      const msg =
        err instanceof Error
          ? (err as Error & { stderr?: string }).stderr || err.message
          : String(err)
      if (
        msg.includes("application-default login") ||
        msg.includes("Reauthentication required") ||
        msg.includes("invalid_scope")
      ) {
        throw new SetupAuthError(
          "GCP Application Default Credentials (ADC) are required to run this command.\n" +
            "What went wrong: ADC is not set up or needs re-authentication.\n" +
            "What to do: Run 'gcloud auth application-default login' in your terminal, then re-run this command.\n" +
            "(If this could have been automated, it would have been.)",
          { code: "GCP_ADC_REQUIRED", cause: err }
        )
      }
      throw err
    }
  }

  /**
   * Runs a gcloud command and returns parsed JSON output (if --format=json is used), or raw stdout otherwise.
   * Throws an error if the command fails.
   * @param args Arguments to pass to gcloud (do not include 'gcloud' itself)
   * @param expectJson If true, parses stdout as JSON
   */
  async run(args: string[], expectJson = true): Promise<unknown> {
    await this.checkInstalled()
    try {
      const { stdout } = await execFileAsync("gcloud", args, {
        encoding: "utf8",
      })
      if (expectJson) {
        try {
          return JSON.parse(stdout)
        } catch (err: unknown) {
          throw new Error(`Failed to parse gcloud JSON output: ${err}`)
        }
      }
      return stdout
    } catch (err: unknown) {
      // Fail fast: detect gcloud auth errors and raise SetupAuthError
      // Type assertion to access possible 'stderr' property from execFile error
      const msg =
        err instanceof Error
          ? (err as Error & { stderr?: string }).stderr || err.message
          : String(err)
      if (
        msg.includes(
          "There was a problem refreshing your current auth tokens"
        ) ||
        msg.includes("cannot prompt during non-interactive execution") ||
        msg.includes("Reauthentication required") ||
        msg.includes("Please enter your password")
      ) {
        throw new SetupAuthError(
          "GCP authentication is required to run this command.\n" +
            "What went wrong: gcloud CLI is not authenticated or needs re-authentication, and cannot prompt in non-interactive mode.\n" +
            "What to do: Run 'gcloud auth login' and 'gcloud auth application-default login' in your terminal, then re-run this command.\n" +
            "(If this could have been automated, it would have been.)",
          { code: "GCP_AUTH_REQUIRED", cause: err }
        )
      }
      throw err
    }
  }

  /**
   * Ensures gcloud Application Default Credentials (ADC) are set up. If not, launches 'gcloud auth application-default login' interactively.
   */
  async autoApplicationDefaultAuthenticate(): Promise<void> {
    try {
      await this.checkApplicationDefaultAuthenticated()
    } catch {
      // Check if we're in an interactive environment before attempting interactive login
      const isInteractive = process.stdin.isTTY && process.stdout.isTTY
      if (!isInteractive) {
        throw new SetupAuthError(
          "GCP Application Default Credentials (ADC) are required to run this command.\n" +
            "What went wrong: ADC is not set up and cannot prompt for login in non-interactive mode.\n" +
            "What to do: Run 'gcloud auth application-default login' in your terminal, then re-run this command.\n" +
            "(If this could have been automated, it would have been.)",
          { code: "GCP_ADC_REQUIRED" }
        )
      }

      console.warn(
        "gcloud ADC is not set up. Launching 'gcloud auth application-default login' interactively..."
      )
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          "gcloud",
          ["auth", "application-default", "login"],
          { stdio: "inherit" }
        )
        child.on("exit", code => {
          if (code === 0) resolve()
          else
            reject(new Error("'gcloud auth application-default login' failed"))
        })
        child.on("error", reject)
      })
      // Re-check
      await this.checkApplicationDefaultAuthenticated()
    }
  }

  /**
   * Ensures both gcloud CLI and ADC authentication are present. Automates both if possible.
   */
  async autoAuthenticate(): Promise<void> {
    try {
      await this.checkAuthenticated()
    } catch {
      // Check if we're in an interactive environment before attempting interactive login
      const isInteractive = process.stdin.isTTY && process.stdout.isTTY
      if (!isInteractive) {
        throw new SetupAuthError(
          "GCP authentication is required to run this command.\n" +
            "What went wrong: gcloud CLI is not authenticated and cannot prompt for login in non-interactive mode.\n" +
            "What to do: Run 'gcloud auth login' and 'gcloud auth application-default login' in your terminal, then re-run this command.\n" +
            "(If this could have been automated, it would have been.)",
          { code: "GCP_AUTH_REQUIRED" }
        )
      }

      console.warn(
        "gcloud is not authenticated. Launching 'gcloud auth login' interactively..."
      )
      await new Promise<void>((resolve, reject) => {
        const child = spawn("gcloud", ["auth", "login"], { stdio: "inherit" })
        child.on("exit", code => {
          if (code === 0) resolve()
          else reject(new Error("'gcloud auth login' failed"))
        })
        child.on("error", reject)
      })
      // Re-check
      await this.checkAuthenticated()
    }
    // Now check and automate ADC
    await this.autoApplicationDefaultAuthenticate()
  }

  /**
   * Checks if the gcloud alpha component is installed. If not, installs it automatically.
   */
  async checkAlphaComponent(): Promise<void> {
    await this.checkInstalled()
    try {
      await execFileAsync("gcloud", ["alpha", "--help"])
    } catch {
      console.warn(
        "gcloud alpha component not found. Installing 'alpha' component..."
      )
      await execFileAsync("gcloud", ["components", "install", "alpha", "-q"])
      // Re-check
      await execFileAsync("gcloud", ["alpha", "--help"])
    }
  }

  /**
   * Ensures authentication is valid for alpha commands, which have stricter requirements.
   * Alpha commands often require fresh authentication and may prompt for password.
   */
  async ensureAlphaCommandAuth(): Promise<void> {
    // First ensure basic authentication
    await this.autoAuthenticate()

    // For alpha commands, we need to ensure the authentication is fresh
    // Try a simple alpha command to test authentication
    try {
      await this.run(["alpha", "--help"], false)
    } catch (error) {
      // If alpha commands fail due to auth, try to refresh authentication
      if (
        error instanceof SetupAuthError &&
        error.code === "GCP_AUTH_REQUIRED"
      ) {
        console.warn(
          "Alpha command authentication failed. Attempting to refresh authentication..."
        )

        // Check if we're in an interactive environment
        const isInteractive = process.stdin.isTTY && process.stdout.isTTY
        if (!isInteractive) {
          throw new SetupAuthError(
            "GCP alpha command authentication failed and cannot be refreshed automatically.\n" +
              "What went wrong: Alpha commands require fresh authentication and cannot prompt for login in non-interactive mode.\n" +
              "What to do: Run 'gcloud auth login' and 'gcloud auth application-default login' in your terminal, then re-run this command.\n" +
              "(If this could have been automated, it would have been.)",
            { code: "GCP_AUTH_REQUIRED", cause: error }
          )
        }

        // Try to refresh authentication interactively
        await this.autoAuthenticate()

        // Test alpha command again
        await this.run(["alpha", "--help"], false)
      } else {
        throw error
      }
    }
  }

  /**
   * Gets the currently active gcloud account.
   * @returns The email of the active account, or null if not set
   */
  async getActiveAccount(): Promise<string | null> {
    try {
      const account = (await this.run(
        ["config", "get-value", "account"],
        false
      )) as string
      return account?.trim() || null
    } catch {
      return null
    }
  }

  /**
   * Gets the email associated with the current Application Default Credentials (ADC).
   * @returns The email of the ADC account, or null if not available
   */
  async getAdcEmail(): Promise<string | null> {
    try {
      const token = (await this.run(
        ["auth", "application-default", "print-access-token"],
        false
      )) as string
      if (!token || typeof token !== "string") return null
      const trimmedToken = token.trim()
      if (!trimmedToken) return null

      // Use dynamic import to avoid circular dependency issues
      const { default: axios } = await import("axios")
      const resp = await axios.get(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${trimmedToken}`
      )
      if (resp.data && resp.data.email) {
        return resp.data.email
      }
      return null
    } catch {
      return null
    }
  }
}
