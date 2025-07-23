import * as fs from "fs"
import * as path from "path"
import {
  GCP_OAUTH_ALLOWED_DOMAINS,
  GCP_OAUTH_CLIENT_ID,
  GCP_OAUTH_CLIENT_SECRET,
} from "../env-handler.js"
import { SetupAuthError } from "../error.js"
import { fileExists } from "../file.js"
import { VercelApiClientImpl } from "./api/index.js"

export interface VercelEnvVariable {
  key: string
  value: string
  targets?: string[]
  scope?: string
}
// Interface for environment variable data
export interface EnvVariable {
  id: string
  key: string
  value: string
  target: string[]
  type: string
  gitBranch: string | null
  createdAt: number
  updatedAt: number
}

export interface VercelProject {
  id: string
  name: string
  accountId: string
}

export interface VercelTeam {
  id: string
  name: string
  slug: string
}

export interface VercelApiResponse<T = unknown> {
  data?: T
  error?: {
    message: string
    status: string
    code: string
    details?: unknown
  }
}

// Interface for Vercel API client
export interface VercelClientInterface {
  getToken(): Promise<string | null>
  getTeamId(): Promise<string | null>
  getProjectName(): Promise<string | null>
  getProjectId(): Promise<string | null>
  getProject(name: string): Promise<VercelProject>
  getEnvVariables(): Promise<EnvVariable[]>
  createEnvVariable(envVar: VercelEnvVariable): Promise<EnvVariable>
  updateEnvVariable(
    envId: string,
    envVar: VercelEnvVariable
  ): Promise<EnvVariable>
  removeEnvVariable(envId: string): Promise<void>
  getDeployments(): Promise<string[]>
  getTeams(): Promise<VercelTeam[]>
  getProjects(): Promise<VercelProject[]>
}

interface VercelJson {
  version?: number // Specifies the version of the Vercel configuration (usually 2)
  name?: string // The name of your project
  scope?: string // Scope of the project (organization or personal account)
  alias?: string[] // List of domains that should be aliased to this deployment
  builds?: BuildConfiguration[] // Array of build configurations
  routes?: RouteConfiguration[] // Routing rules for URL paths
  rewrites?: RewriteRule[] // Rules for rewriting paths internally
  redirects?: RedirectRule[] // Rules for redirecting paths externally
  headers?: HeaderRule[] // Custom headers to apply to responses
  cleanUrls?: boolean // Remove `.html` extensions from URLs
  trailingSlash?: boolean // Add or remove trailing slashes from URLs
}

interface BuildConfiguration {
  src: string // Source file pattern to match
  use: string // Builder to use (e.g., "@vercel/static", "@vercel/node")
  config?: Record<string, unknown> // Additional configuration options for the builder
}

interface RouteConfiguration {
  src: string // Source path pattern
  dest?: string // Destination path (if rewrite or proxying is needed)
  methods?: string[] // HTTP methods to match (GET, POST, etc.)
  headers?: Record<string, string> // Custom headers to apply for this route
}

interface RewriteRule {
  source: string // Path pattern to match
  destination: string // Internal rewrite destination
}

interface RedirectRule {
  source: string // Path pattern to match
  destination: string // External redirect destination
  statusCode?: number // HTTP status code for the redirect (301, 302, etc.)
}

interface HeaderRule {
  source: string // Path pattern to match
  headers: Array<{ key: string; value: string }> // Array of headers to apply
}

export async function getVercelJsonPath(): Promise<string | null> {
  const rootPath = path.resolve(process.cwd(), "../../")
  const vercelJsonPath = path.join(rootPath, "vercel.json")
  if (fs.existsSync(vercelJsonPath)) {
    return vercelJsonPath
  }
  return null
}

/**
 * Get Vercel config from vercel.json
 */
export async function getVercelJson(): Promise<VercelJson | null> {
  // Check for vercel.json in the root directory
  const vercelJsonPath = await getVercelJsonPath()
  if (vercelJsonPath && fs.existsSync(vercelJsonPath)) {
    try {
      const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, "utf8"))
      if (vercelJson.token) {
        return vercelJson.token
      }
    } catch (error) {
      console.warn("Error reading vercel.json:", error)
    }
  }
  return null
}

/**
 * Updates Vercel project environment variables with OAuth credentials.
 */
export async function updateVercelWithOAuthCredentials(
  vercelClient: VercelClientInterface,
  clientId: string,
  clientSecret: string | undefined,
  allowedDomains?: string | undefined
): Promise<void> {
  // Get project name first, then use it to get project info (like ID)
  const projectName = await vercelClient.getProjectName()
  if (!projectName) {
    throw new SetupAuthError("Could not determine Vercel project name.")
  }
  const projectInfo = await vercelClient.getProject(projectName) // Pass name
  const projectId = projectInfo?.id
  if (!projectId) {
    throw new SetupAuthError(
      `Could not retrieve Vercel project info/ID for project name: ${projectName}.`
    )
  }
  console.log(
    `Updating Vercel environment variables for project ${projectName} (ID: ${projectId})...`
  )

  // Define targets (adjust if needed)
  const targets = ["production", "preview", "development"]

  // Construct VercelEnvVariable objects
  const envVarsToSet: VercelEnvVariable[] = [
    { key: GCP_OAUTH_CLIENT_ID, value: clientId, targets },
    // Conditionally add secret
    ...(clientSecret
      ? [{ key: GCP_OAUTH_CLIENT_SECRET, value: clientSecret, targets }]
      : []),
    // Conditionally add domains
    ...(allowedDomains
      ? [{ key: GCP_OAUTH_ALLOWED_DOMAINS, value: allowedDomains, targets }]
      : []),
  ]

  try {
    const existingVars = await vercelClient.getEnvVariables()
    const existingVarsMap = new Map(existingVars.map(v => [v.key, v]))

    for (const envVar of envVarsToSet) {
      const existingVar = existingVarsMap.get(envVar.key)

      if (existingVar) {
        if (existingVar.value !== envVar.value) {
          console.log(`Updating Vercel environment variable ${envVar.key}...`)
          // Use PATCH for more efficient updates
          try {
            await vercelClient.updateEnvVariable(existingVar.id, envVar)
            console.log(`Updated Vercel environment variable ${envVar.key}.`)
          } catch (updateError) {
            console.warn(`Failed to update env var ${envVar.key}:`, updateError)
            // Continue with other environment variables
          }
        } else {
          console.log(
            `Vercel environment variable ${envVar.key} already up-to-date.`
          )
        }
      } else {
        console.log(`Creating Vercel environment variable ${envVar.key}...`)
        // Pass the VercelEnvVariable object
        await vercelClient.createEnvVariable(envVar)
      }
    }
  } catch (error) {
    console.error("Failed to update Vercel environment variables:", error)
    throw new SetupAuthError(
      "Failed to update Vercel environment variables. Please check your Vercel configuration.",
      { cause: error }
    )
  }
}

export async function getVercelClient(): Promise<VercelClientInterface> {
  const client = new VercelApiClientImpl(process.env.VERCEL_ACCESS_TOKEN || "")

  // Validate authentication using the API directly
  try {
    await client.getTeamId()
  } catch (error) {
    throw new SetupAuthError(
      "Failed to validate Vercel authentication. Please check your VERCEL_ACCESS_TOKEN and VERCEL_TEAM_ID.",
      { cause: error }
    )
  }

  return client
}

/**
 * Update environment variables in Vercel with optimizations
 */
export async function updateVercelEnvVarWithRetry(
  client: VercelClientInterface,
  key: string,
  value: string,
  scope: string | null | undefined = undefined,
  maxRetries: number = 3
): Promise<boolean> {
  let attempts = 0
  while (attempts < maxRetries) {
    try {
      attempts++
      console.log(`Setting ${key} in Vercel (attempt ${attempts})...`)

      // Get existing environment variables
      const envVars = await client.getEnvVariables()
      const existingVar = envVars.find((env: EnvVariable) => env.key === key)

      if (existingVar) {
        // Variable exists, check if value is different
        if (existingVar.value === value) {
          console.log(`✅ ${key} already has the correct value in Vercel`)
          return true
        }

        // Value is different, update it using PATCH
        console.log(`Updating ${key} in Vercel...`)
        await client.updateEnvVariable(existingVar.id, {
          key,
          value,
          targets: undefined,
          scope: scope as string,
        } as VercelEnvVariable)
        console.log(`✅ Updated ${key} in Vercel`)
      } else {
        // Variable doesn't exist, create it
        await client.createEnvVariable({
          key,
          value,
          targets: undefined,
          scope: scope as string,
        } as VercelEnvVariable)
        console.log(`✅ Added ${key} to Vercel`)
      }

      return true
    } catch (error) {
      console.error(
        `❌ Error setting ${key} in Vercel (attempt ${attempts}):`,
        error
      )
      if (attempts >= maxRetries) {
        return false
      }
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  return false
}

export async function _getVercelTokenFromEnvironment(): Promise<string | null> {
  // Check environment variable
  if (process.env.VERCEL_ACCESS_TOKEN) {
    return process.env.VERCEL_ACCESS_TOKEN
  }

  // Try to get token from CLI
  try {
    // Get vercel config from ~/vercel/auth.json
    const homeDir = process.env.HOME || process.env.USERPROFILE
    if (homeDir) {
      const vercelAuthPath = path.join(homeDir, ".vercel", "auth.json")
      if (await fileExists(vercelAuthPath)) {
        const authJson = JSON.parse(fs.readFileSync(vercelAuthPath, "utf8"))
        if (authJson.token) {
          return authJson.token
        }
      }
    }
  } catch (error) {
    console.warn("Error reading Vercel auth file:", error)
    return null
  }

  console.warn(
    "No Vercel token found, please set VERCEL_ACCESS_TOKEN environment variable"
  )

  return null
}
