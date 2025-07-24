import axios from "axios"
import { SetupAuthError } from "../../error.js"
import {
  VercelClientInterface,
  VercelEnvVariable,
  VercelProject,
  VercelTeam,
} from "../index.js"

interface VercelTeamsResponse {
  teams: VercelTeam[]
}

interface VercelProjectsResponse {
  projects: VercelProject[]
}

interface VercelDeploymentsResponse {
  deployments: Array<{ url?: string; state?: string }>
}

interface VercelEnvVariablesResponse {
  envs: any[]
}

/**
 * API client implementation using Axios
 */
export class VercelApiClientImpl implements VercelClientInterface {
  private token: string
  private apiUrl = "https://api.vercel.com"
  private teamId: string | null = null
  private projectName: string | null = null

  constructor(token: string) {
    this.token = token
  }

  async request<T = unknown>(
    method: string,
    path: string,
    data?: unknown
  ): Promise<T> {
    try {
      const response = await axios({
        method,
        url: `${this.apiUrl}${path}`,
        data,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      })
      return response.data as T
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        // Preserve the error structure for better error handling
        const apiError = new Error(
          `Vercel API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        )
        const errorWithStatus = apiError as Error & {
          status: number
          message: string
        }
        errorWithStatus.status = error.response.status
        errorWithStatus.message =
          error.response.data?.error?.message || error.message
        throw apiError
      }
      throw error
    }
  }

  private async innerGetTeamId(): Promise<string | null> {
    if (this.teamId !== null) {
      return this.teamId
    }
    if (process.env.VERCEL_TEAM_ID) {
      this.teamId = process.env.VERCEL_TEAM_ID
      return this.teamId
    }
    try {
      // Check for team in user's teams
      const response = await this.request<VercelTeamsResponse>(
        "GET",
        "/v2/teams"
      )

      if (response && response.teams && response.teams.length > 1) {
        throw new Error(
          "Multiple teams found. Please set VERCEL_TEAM_ID environment variable."
        )
      }
      if (response && response.teams && response.teams.length > 0) {
        this.teamId = response.teams[0].id
        return this.teamId
      }

      // No team found
      this.teamId = null
      return null
    } catch (error) {
      console.error("Error getting team ID:", error)
      return null
    }
  }

  async getTeamId(): Promise<string> {
    if (this.teamId !== null) {
      return this.teamId
    }
    const teamId = await this.innerGetTeamId()
    if (teamId && teamId !== null && teamId.length > 0) {
      this.teamId = teamId
      return teamId
    }
    throw new SetupAuthError(
      "No team ID found. Please set VERCEL_TEAM_ID environment variable."
    )
  }

  async getProjectName(): Promise<string> {
    if (this.projectName !== null) {
      return this.projectName
    }
    if (process.env.VERCEL_PROJECT_NAME) {
      this.projectName = process.env.VERCEL_PROJECT_NAME
      return this.projectName
    }

    try {
      const teamId = await this.getTeamId()
      const endpoint = teamId ? `/v9/projects?teamId=${teamId}` : "/v9/projects"

      const response = await this.request<VercelProjectsResponse>(
        "GET",
        endpoint
      )
      if (response && response.projects && response.projects.length > 1) {
        throw new SetupAuthError(
          "Multiple projects found. Please set VERCEL_PROJECT_NAME environment variable."
        )
      }
      if (response && response.projects && response.projects.length > 0) {
        this.projectName = response.projects[0].name
        if (this.projectName) {
          process.env.VERCEL_PROJECT_NAME = this.projectName
          return this.projectName
        }
      }
      throw new SetupAuthError(
        "No projects found. Please set VERCEL_PROJECT_NAME environment variable."
      )
    } catch (error) {
      throw new SetupAuthError(
        `Failed to get project name: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  async getProjectId(): Promise<string> {
    // Get project ID from environment variable (required)
    const projectId = process.env.VERCEL_PROJECT_ID
    if (!projectId) {
      throw new SetupAuthError(
        "VERCEL_PROJECT_ID environment variable is required. Please set it in your .env.local file."
      )
    }

    return projectId
  }

  async getProjects(): Promise<
    Array<{ id: string; name: string; accountId: string }>
  > {
    try {
      const teamId = await this.getTeamId()
      const endpoint = `/v10/projects?teamId=${teamId}`

      const response = await this.request<VercelProjectsResponse>(
        "GET",
        endpoint
      )

      if (response && response.projects) {
        return response.projects.map(
          (project: { id: string; name: string; accountId: string }) => ({
            id: project.id,
            name: project.name,
            accountId: project.accountId,
          })
        )
      }

      return []
    } catch (error) {
      // Check for access token scope issues
      if (error && typeof error === "object" && "status" in error) {
        const errorWithStatus = error as { status?: number; message?: string }
        if (
          errorWithStatus.status === 403 &&
          errorWithStatus.message?.includes("scope")
        ) {
          throw new SetupAuthError(
            "Access token does not have the required team scope permissions.\n" +
              "Please create a new access token with the correct team scope:\n" +
              "1. Go to https://vercel.com/account/tokens\n" +
              "2. Click 'Create Token'\n" +
              "3. Select your team from the scope dropdown\n" +
              "4. Set an appropriate expiration date\n" +
              "5. Update your VERCEL_ACCESS_TOKEN environment variable\n" +
              "\nFor more details, see: https://vercel.com/docs/rest-api/reference/welcome#creating-an-access-token",
            { cause: error }
          )
        }
      }
      console.warn("Failed to get projects via API:", error)
      return []
    }
  }

  async getDeployments(): Promise<string[]> {
    try {
      const projectId = await this.getProjectId()
      const teamId = await this.getTeamId()

      // Use the Vercel REST API to list deployments
      const endpoint = `/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=10`

      const response = await this.request<VercelDeploymentsResponse>(
        "GET",
        endpoint
      )

      if (response && response.deployments) {
        return response.deployments
          .filter(
            (deployment: { url?: string; state?: string }) =>
              deployment.url && deployment.state === "READY"
          )
          .map(deployment => `https://${deployment.url!}`)
      }

      return []
    } catch (error) {
      // Check for access token scope issues
      if (error && typeof error === "object" && "status" in error) {
        const errorWithStatus = error as { status?: number; message?: string }
        if (
          errorWithStatus.status === 403 &&
          errorWithStatus.message?.includes("scope")
        ) {
          throw new SetupAuthError(
            "Access token does not have the required team scope permissions.\n" +
              "Please create a new access token with the correct team scope:\n" +
              "1. Go to https://vercel.com/account/tokens\n" +
              "2. Click 'Create Token'\n" +
              "3. Select your team from the scope dropdown\n" +
              "4. Set an appropriate expiration date\n" +
              "5. Update your VERCEL_ACCESS_TOKEN environment variable\n" +
              "\nFor more details, see: https://vercel.com/docs/rest-api/reference/welcome#creating-an-access-token",
            { cause: error }
          )
        }
      }
      console.warn("Failed to get deployments via API:", error)
      return []
    }
  }

  async getProject(name: string): Promise<any> {
    try {
      // Use the project ID directly instead of searching by name
      const projectId = await this.getProjectId()
      const teamId = await this.getTeamId()

      const endpoint = `/v10/projects/${projectId}?teamId=${teamId}`
      const response = await this.request("GET", endpoint)

      return response
    } catch (error) {
      // Check for access token scope issues
      if (error && typeof error === "object" && "status" in error) {
        const errorWithStatus = error as { status?: number; message?: string }
        if (
          errorWithStatus.status === 403 &&
          errorWithStatus.message?.includes("scope")
        ) {
          throw new SetupAuthError(
            "Access token does not have the required team scope permissions.\n" +
              "Please create a new access token with the correct team scope:\n" +
              "1. Go to https://vercel.com/account/tokens\n" +
              "2. Click 'Create Token'\n" +
              "3. Select your team from the scope dropdown\n" +
              "4. Set an appropriate expiration date\n" +
              "5. Update your VERCEL_ACCESS_TOKEN environment variable\n" +
              "\nFor more details, see: https://vercel.com/docs/rest-api/reference/welcome#creating-an-access-token",
            { cause: error }
          )
        }
      }
      console.error(`Error getting project ${name}:`, error)
      throw error
    }
  }

  async getEnvVariables(): Promise<any[]> {
    try {
      const projectId = await this.getProjectId()
      const teamId = await this.getTeamId()
      const endpoint = `/v10/projects/${projectId}/env?teamId=${teamId}`

      const response = await this.request<VercelEnvVariablesResponse>(
        "GET",
        endpoint
      )

      if (response && response.envs) {
        return response.envs
      }

      return []
    } catch (error) {
      // Check for access token scope issues
      if (error && typeof error === "object" && "status" in error) {
        const errorWithStatus = error as { status?: number; message?: string }
        if (
          errorWithStatus.status === 403 &&
          errorWithStatus.message?.includes("scope")
        ) {
          throw new SetupAuthError(
            "Access token does not have the required team scope permissions.\n" +
              "Please create a new access token with the correct team scope:\n" +
              "1. Go to https://vercel.com/account/tokens\n" +
              "2. Click 'Create Token'\n" +
              "3. Select your team from the scope dropdown\n" +
              "4. Set an appropriate expiration date\n" +
              "5. Update your VERCEL_ACCESS_TOKEN environment variable\n" +
              "\nFor more details, see: https://vercel.com/docs/rest-api/reference/welcome#creating-an-access-token",
            { cause: error }
          )
        }
      }
      console.error("Error getting environment variables:", error)
      throw error
    }
  }

  async createEnvVariable(envVar: VercelEnvVariable): Promise<any> {
    try {
      const projectId = await this.getProjectId()
      const teamId = await this.getTeamId()
      const endpoint = `/v10/projects/${projectId}/env?teamId=${teamId}`

      const response = await this.request("POST", endpoint, {
        key: envVar.key,
        value: envVar.value,
        target: envVar.targets,
        type: "plain",
      })

      return response
    } catch (error) {
      // Check for access token scope issues
      if (error && typeof error === "object" && "status" in error) {
        const errorWithStatus = error as { status?: number; message?: string }
        if (
          errorWithStatus.status === 403 &&
          errorWithStatus.message?.includes("scope")
        ) {
          throw new SetupAuthError(
            "Access token does not have the required team scope permissions.\n" +
              "Please create a new access token with the correct team scope:\n" +
              "1. Go to https://vercel.com/account/tokens\n" +
              "2. Click 'Create Token'\n" +
              "3. Select your team from the scope dropdown\n" +
              "4. Set an appropriate expiration date\n" +
              "5. Update your VERCEL_ACCESS_TOKEN environment variable\n" +
              "\nFor more details, see: https://vercel.com/docs/rest-api/reference/welcome#creating-an-access-token",
            { cause: error }
          )
        }
      }
      console.error(`Error creating environment variable ${envVar.key}:`, error)
      throw error
    }
  }

  async updateEnvVariable(
    envId: string,
    envVar: VercelEnvVariable
  ): Promise<any> {
    try {
      const projectId = await this.getProjectId()
      const teamId = await this.getTeamId()
      const endpoint = `/v10/projects/${projectId}/env/${envId}?teamId=${teamId}`

      const response = await this.request("PATCH", endpoint, {
        key: envVar.key,
        value: envVar.value,
        target: envVar.targets,
        type: "plain",
      })

      return response
    } catch (error) {
      // Check for access token scope issues
      if (error && typeof error === "object" && "status" in error) {
        const errorWithStatus = error as { status?: number; message?: string }
        if (
          errorWithStatus.status === 403 &&
          errorWithStatus.message?.includes("scope")
        ) {
          throw new SetupAuthError(
            "Access token does not have the required team scope permissions.\n" +
              "Please create a new access token with the correct team scope:\n" +
              "1. Go to https://vercel.com/account/tokens\n" +
              "2. Click 'Create Token'\n" +
              "3. Select your team from the scope dropdown\n" +
              "4. Set an appropriate expiration date\n" +
              "5. Update your VERCEL_ACCESS_TOKEN environment variable\n" +
              "\nFor more details, see: https://vercel.com/docs/rest-api/reference/welcome#creating-an-access-token",
            { cause: error }
          )
        }
      }
      console.error(`Error updating environment variable ${envVar.key}:`, error)
      throw error
    }
  }

  async removeEnvVariable(envId: string): Promise<void> {
    try {
      const projectId = await this.getProjectId()
      const teamId = await this.getTeamId()
      const endpoint = `/v10/projects/${projectId}/env/${envId}?teamId=${teamId}`

      await this.request("DELETE", endpoint)
      return
    } catch (error) {
      // Check for access token scope issues
      if (error && typeof error === "object" && "status" in error) {
        const errorWithStatus = error as { status?: number; message?: string }
        if (
          errorWithStatus.status === 403 &&
          errorWithStatus.message?.includes("scope")
        ) {
          throw new SetupAuthError(
            "Access token does not have the required team scope permissions.\n" +
              "Please create a new access token with the correct team scope:\n" +
              "1. Go to https://vercel.com/account/tokens\n" +
              "2. Click 'Create Token'\n" +
              "3. Select your team from the scope dropdown\n" +
              "4. Set an appropriate expiration date\n" +
              "5. Update your VERCEL_ACCESS_TOKEN environment variable\n" +
              "\nFor more details, see: https://vercel.com/docs/rest-api/reference/welcome#creating-an-access-token",
            { cause: error }
          )
        }
      }
      console.error("Error removing environment variable:", error)
      throw error
    }
  }

  async getToken(): Promise<string | null> {
    return this.token
  }

  async getTeams(): Promise<Array<{ id: string; name: string; slug: string }>> {
    const response = await this.request<VercelTeamsResponse>("GET", "/v2/teams")
    if (response && response.teams) {
      return response.teams.map(
        (team: { id: string; name: string; slug: string }) => ({
          id: team.id,
          name: team.name,
          slug: team.slug,
        })
      )
    }
    return []
  }
}
