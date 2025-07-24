/**
 * This file is using the @google-cloud/resource-manager package,
 * do NOT revert back to the googleapis package.
 */
import {
  GCP_OAUTH_PROJECT_ID,
  GCP_OAUTH_QUOTA_PROJECT_ID,
} from "../../../utils/env-handler.js"
import { SetupAuthError } from "../../../utils/error.js"
import { ProjectsClient, protos } from "@google-cloud/resource-manager"
import { GoogleAuth } from "google-auth-library"
import { GcpAuthenticatedIdentity } from "../creds/identity.js"
import { GcpProjectIamManager } from "../iam/project-iam.js"
import { gcpCreateProject } from "./create.js"

type SearchProjectsRequest =
  protos.google.cloud.resourcemanager.v3.ISearchProjectsRequest

// Define interface for GCP API error
interface GcpApiError extends Error {
  code: number
  details?: unknown
  status?: string
  name: string
  stack?: string
}

/**
 * Class to manage GCP project operations using the Cloud Resource Manager API
 */
export class GcpProjectManager {
  private readonly identity: GcpAuthenticatedIdentity
  private projectsClient: ProjectsClient | null = null
  private readonly organizationId: string
  private initialized = false

  constructor(identity: GcpAuthenticatedIdentity, organizationId: string) {
    this.identity = identity
    if (!organizationId) {
      throw new SetupAuthError("Organization ID is not set")
    }
    this.organizationId = organizationId
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      const authClient = await this.identity.getGaxAuthClient()

      // Create the projects client with our authenticated client
      this.projectsClient = new ProjectsClient({
        auth: authClient,
      })

      this.initialized = true
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new SetupAuthError("Failed to initialize GcpProjectManager:", {
          cause: error,
        })
      }
      throw new SetupAuthError(
        "Failed to initialize GcpProjectManager: Unknown error"
      )
    }
  }

  /**
   * Check if a project exists
   */
  async projectExists(projectId: string): Promise<boolean> {
    await this.initialize()
    try {
      console.log(
        `Checking if project ${projectId} exists by listing all projects in organization...`
      )

      // List all projects in the organization and check if our project ID exists
      const projects = await this.listProjects()
      const exists = projects.includes(projectId)

      console.log(
        `Project ${projectId} ${exists ? "exists" : "does not exist"}`
      )
      return exists
    } catch (error) {
      if (error instanceof Error) {
        const gcpError = error as GcpApiError
        // Log detailed error information
        console.error("Project existence check failed with error:", {
          projectId,
          errorCode: gcpError.code,
          errorStatus: gcpError.status,
          errorName: gcpError.name,
          errorStack: gcpError.stack,
          errorDetails: gcpError.details,
          errorMessage: gcpError.message,
        })

        throw new SetupAuthError(
          `Failed to check if project ${projectId} exists. Details: ${gcpError.message}`,
          { cause: error }
        )
      }
      throw new SetupAuthError(
        "Failed to check if project exists: Unknown error"
      )
    }
  }

  /**
   * Check if a project is attached to the specified organization
   */
  async isAttachedToOrganization(projectId: string): Promise<boolean> {
    await this.initialize()
    try {
      // Create a temporary client without a quota project for this specific call
      const tempClient = new ProjectsClient({
        projectId: undefined, // Explicitly set to undefined to avoid using a quota project
      })

      const [project] = await tempClient.getProject({
        name: `projects/${projectId}`,
      })

      // Check if the project is attached to the specified organization
      return project.parent === `organizations/${this.organizationId}`
    } catch (error) {
      if (error instanceof Error) {
        const gcpError = error as GcpApiError
        if (gcpError.code === 5) {
          // 5 is NOT_FOUND in gRPC
          return false
        }
        // Add more context to the error message
        const errorDetails =
          gcpError.details || gcpError.message || "Unknown error"
        const errorCode = gcpError.code ? ` (code: ${gcpError.code})` : ""
        const errorStatus = gcpError.status
          ? ` (status: ${gcpError.status})`
          : ""
        throw new SetupAuthError(
          `Failed to check if project ${projectId} is attached to organization ${this.organizationId}${errorCode}${errorStatus}. Details: ${errorDetails}`,
          { cause: error }
        )
      }
      throw new SetupAuthError(
        "Failed to check project attachment: Unknown error"
      )
    }
  }

  /**
   * Delete a GCP project
   */
  async deleteProject(projectId: string): Promise<void> {
    await this.initialize()
    try {
      console.log(`Deleting project ${projectId}...`)
      const [operation] = await this.projectsClient!.deleteProject({
        name: `projects/${projectId}`,
      })

      // Wait for the operation to complete
      await operation.promise()
      console.log(`Project ${projectId} deletion initiated successfully`)
    } catch (error) {
      throw new SetupAuthError(`Failed to delete project ${projectId}:`, {
        cause: error,
      })
    }
  }

  /**
   * Attach a standalone project to the organization
   * Note: This requires the resourcemanager.projects.update permission
   */
  async migrateProjectToOrganization(projectId: string): Promise<boolean> {
    await this.initialize()
    try {
      console.log(
        `Attempting to attach project ${projectId} to organization ${this.organizationId}...`
      )

      // First get the current project
      const [project] = await this.projectsClient!.getProject({
        name: `projects/${projectId}`,
      })

      // Only proceed if the project is not already attached to the organization
      if (project.parent === `organizations/${this.organizationId}`) {
        console.log(
          `Project ${projectId} is already attached to organization ${this.organizationId}`
        )
        return true
      }

      // If the project parent is not empty but different from our organization,
      // we can't migrate it (a project can only be in one organization)
      if (
        project.parent &&
        !project.parent.includes(`organizations/${this.organizationId}`)
      ) {
        console.log(
          `Project ${projectId} is attached to ${project.parent}, not to our organization ${this.organizationId}`
        )
        return false
      }

      // Update the project to be part of our organization
      const [operation] = await this.projectsClient!.updateProject({
        project: {
          name: `projects/${projectId}`,
          parent: `organizations/${this.organizationId}`,
        },
        updateMask: {
          paths: ["parent"],
        },
      })

      // Wait for the operation to complete
      await operation.promise()
      console.log(
        `Successfully attached project ${projectId} to organization ${this.organizationId}`
      )
      return true
    } catch (error) {
      console.error(
        `Failed to attach project ${projectId} to organization ${this.organizationId}:`,
        error
      )
      return false
    }
  }

  /**
   * List all visible projects in the organization
   */
  async listProjects(): Promise<string[]> {
    await this.initialize()
    try {
      // Extract the numeric organization ID if it's in the format "organizations/123..."
      const orgId = this.organizationId.replace(/^organizations\//, "")

      // Use the parent field with organizations prefix
      const [projectsList] = await this.projectsClient!.searchProjects({
        query: `parent=organizations/${orgId}`,
      })

      return (projectsList || [])
        .map(project => project.projectId || "")
        .filter(Boolean)
    } catch (error: unknown) {
      if (error instanceof Error) {
        const gcpError = error as GcpApiError
        // Check if this is a permission error (code 7 is PERMISSION_DENIED in gRPC)
        if (gcpError.code === 7) {
          console.error(
            "Permission denied when listing projects. Missing required permission: resourcemanager.projects.list"
          )
          // Return empty array instead of throwing when permission is denied
          return []
        }
        // For other errors, provide detailed error information
        console.error("Failed to list projects:", {
          errorCode: gcpError.code,
          errorStatus: gcpError.status,
          errorName: gcpError.name,
          errorMessage: gcpError.message,
          errorDetails: gcpError.details,
          organizationId: this.organizationId,
        })
        throw new SetupAuthError(
          `Failed to list projects: ${gcpError.message}`,
          { cause: error }
        )
      }
      throw new SetupAuthError("Failed to list projects: Unknown error")
    }
  }

  /**
   * Create a new GCP project in the organization or handle existing projects
   */
  async createProject(projectId: string): Promise<void> {
    await this.initialize()
    return await gcpCreateProject(
      this,
      this.projectsClient!,
      this.organizationId,
      projectId
    )
  }

  /**
   * Get details about a specific project
   *
   * TODO: Return the project object instead of any (protos.google.cloud.resourcemanager.v3.IProject)
   */
  async getProject(
    projectId: string
  ): Promise<protos.google.cloud.resourcemanager.v3.IProject> {
    await this.initialize()
    try {
      console.log(`Getting details for project ${projectId}...`)

      // Create a temporary client without a quota project for this specific call
      const tempClient = new ProjectsClient({
        projectId: undefined, // Explicitly set to undefined to avoid using a quota project
      })

      const [project] = await tempClient.getProject({
        name: `projects/${projectId}`,
      })

      console.log(`Successfully retrieved details for project ${projectId}`)
      return project
    } catch (error: unknown) {
      if (error instanceof Error) {
        const gcpError = error as GcpApiError
        // Log detailed error information
        console.error("Project details retrieval failed with error:", {
          projectId,
          errorCode: gcpError.code,
          errorStatus: gcpError.status,
          errorName: gcpError.name,
          errorStack: gcpError.stack,
          errorDetails: gcpError.details,
          errorMessage: gcpError.message,
        })

        // Build a comprehensive error message
        const errorParts = []
        if (gcpError.code) errorParts.push(`Code: ${gcpError.code}`)
        if (gcpError.status) errorParts.push(`Status: ${gcpError.status}`)
        if (gcpError.name) errorParts.push(`Type: ${gcpError.name}`)

        const errorContext =
          errorParts.length > 0 ? ` (${errorParts.join(", ")})` : ""
        const errorDetails = [
          gcpError.details,
          gcpError.message,
          gcpError.stack?.split("\n")[0], // First line of stack trace if available
        ]
          .filter(Boolean)
          .join(". ")

        throw new SetupAuthError(
          `Failed to get details for project ${projectId}${errorContext}. ` +
            `Details: ${errorDetails || "No additional error details available"}. ` +
            "This could be due to insufficient permissions or an invalid project ID.",
          { cause: error }
        )
      }
      throw new SetupAuthError("Failed to get details for project", {
        cause: error,
      })
    }
  }

  async getIamManager(projectId: string): Promise<GcpProjectIamManager> {
    await this.initialize()

    // Create IAM manager
    const projectIamManager = new GcpProjectIamManager(
      this.identity,
      this.organizationId!,
      projectId
    )

    // Initialize IAM manager
    await projectIamManager.initialize()

    return projectIamManager
  }
}

export async function gcpSetOauthProjectId(options: {
  gcpOauthQuotaProjectId?: string
  gcpOauthProjectId?: string
}): Promise<void> {
  // Validate project ID format
  if (!options.gcpOauthProjectId) {
    throw new SetupAuthError("Project ID cannot be empty")
  }

  if (
    options.gcpOauthProjectId.length < 6 ||
    options.gcpOauthProjectId.length > 30
  ) {
    throw new SetupAuthError(
      `Project ID must be between 6 and 30 characters long. Got ${options.gcpOauthProjectId.length} characters: "${options.gcpOauthProjectId}"`
    )
  }

  // Project IDs can only contain lowercase letters, numbers, and hyphens
  const validProjectIdPattern = /^[a-z][a-z0-9-]+[a-z0-9]$/
  if (!validProjectIdPattern.test(options.gcpOauthProjectId)) {
    throw new SetupAuthError(
      "Project ID must start with a letter, contain only lowercase letters, numbers, and hyphens, " +
        "and end with a letter or number. " +
        `Got: "${options.gcpOauthProjectId}"`
    )
  }

  // If a GCP project ID is provided, set it in the environment
  process.env.GCP_OAUTH_PROJECT_ID = options.gcpOauthProjectId
  // Just to be safe, set the GOOGLE_PROJECT_ID environment variable as well
  process.env.GOOGLE_PROJECT_ID = options.gcpOauthProjectId
  // Also set the GOOGLE_CLOUD_QUOTA_PROJECT environment variable because
  // the orgpolicy.googleapis.com API requires a quota project, which is not set by default.
  process.env.GOOGLE_CLOUD_QUOTA_PROJECT = options.gcpOauthQuotaProjectId
  // Also set the GCLOUD_PROJECT environment variable because
  // GCP SDK classes like ServiceUsageClient look at that environment variable
  // for the project Id as well
  process.env.GCLOUD_PROJECT = options.gcpOauthQuotaProjectId
  // Also set the GCLOUD_CLOUD_PROJECT environment variable because
  // we've seen comments on StackOverflow that this might help.
  // https://stackoverflow.com/questions/77275301/google-cloud-application-default-credentials-permission-denied-quota-project-n
  process.env.GCLOUD_CLOUD_PROJECT = options.gcpOauthProjectId
}

export async function gcpGetOauthProjectId(options: {
  gcpOauthProjectId?: string
}): Promise<{ success: boolean; gcpOauthProjectId?: string; error?: string }> {
  // If the GCP project ID is explicitly provided, use it
  if (options.gcpOauthProjectId) {
    const gcpOauthProjectId = options.gcpOauthProjectId
    console.log(
      `Using explicitly provided GCP project ID: ${gcpOauthProjectId}`
    )
    return { success: true, gcpOauthProjectId: gcpOauthProjectId }
  }

  // If the GCP project ID is provided in the environment, use it.
  // (../../.env.local has been loaded into process.env)
  if (process.env[GCP_OAUTH_PROJECT_ID]) {
    options.gcpOauthProjectId = process.env[GCP_OAUTH_PROJECT_ID]
    console.log(
      `Using GCP project ID from environment: ${options.gcpOauthProjectId}`
    )
    return { success: true, gcpOauthProjectId: options.gcpOauthProjectId }
  }

  // Fall back to other environment variables
  if (process.env.EKG_PROJECT_NAME) {
    options.gcpOauthProjectId = process.env.EKG_PROJECT_NAME
    console.log(
      `Found project name in environment variable EKG_PROJECT_NAME: ${options.gcpOauthProjectId}`
    )
    return { success: true, gcpOauthProjectId: options.gcpOauthProjectId }
  }

  return {
    success: false,
    error:
      "Could not determine project name.\n" +
      "Please set VERCEL_PROJECT_NAME, " +
      `${GCP_OAUTH_PROJECT_ID} or EKG_PROJECT_NAME ` +
      "in .env.local or environment variables.",
  }
}

export async function gcpGetOauthQuotaProjectId(options: {
  gcpOauthQuotaProjectId?: string
  gcpOauthProjectId?: string
}): Promise<{
  success: boolean
  gcpOauthQuotaProjectId?: string
  error?: string
}> {
  if (options.gcpOauthQuotaProjectId) {
    console.log(
      "Using explicitly provided GCP quota project ID:",
      options.gcpOauthQuotaProjectId
    )
    process.env[GCP_OAUTH_QUOTA_PROJECT_ID] = options.gcpOauthQuotaProjectId
    return {
      success: true,
      gcpOauthQuotaProjectId: options.gcpOauthQuotaProjectId,
    }
  }

  if (process.env[GCP_OAUTH_QUOTA_PROJECT_ID]) {
    options.gcpOauthQuotaProjectId = process.env[GCP_OAUTH_QUOTA_PROJECT_ID]
    console.log(
      "Using GCP quota project ID from environment:",
      options.gcpOauthQuotaProjectId
    )
    return {
      success: true,
      gcpOauthQuotaProjectId: options.gcpOauthQuotaProjectId,
    }
  }

  options.gcpOauthQuotaProjectId = options.gcpOauthProjectId
  console.log(
    "Using GCP project ID as the quota project ID:",
    options.gcpOauthQuotaProjectId
  )
  process.env[GCP_OAUTH_QUOTA_PROJECT_ID] = options.gcpOauthQuotaProjectId
  return {
    success: true,
    gcpOauthQuotaProjectId: options.gcpOauthQuotaProjectId,
  }
}

export async function gcpCheckOauthProjectId(options: {
  gcpOauthProjectId?: string
  gcpOauthQuotaProjectId?: string
}): Promise<{ success: boolean; error?: string }> {
  const {
    success: successQuota,
    gcpOauthQuotaProjectId,
    error: errorQuota,
  } = await gcpGetOauthQuotaProjectId(options)
  if (!successQuota) return { success: false, error: errorQuota }

  const { success, gcpOauthProjectId, error } =
    await gcpGetOauthProjectId(options)
  if (!success) return { success: false, error }

  try {
    // Validate and set the project ID in environment variables
    await gcpSetOauthProjectId({
      gcpOauthProjectId: gcpOauthProjectId!,
      gcpOauthQuotaProjectId: gcpOauthQuotaProjectId!,
    })
    // Update the options with the validated project ID
    options.gcpOauthProjectId = gcpOauthProjectId!
    options.gcpOauthQuotaProjectId = gcpOauthQuotaProjectId!
    return { success: true }
  } catch (error) {
    if (error instanceof SetupAuthError) {
      return { success: false, error: error.message }
    }
    return { success: false, error: `Failed to validate project ID: ${error}` }
  }
}

export async function listProjects(
  auth: GoogleAuth,
  filter?: string
): Promise<string[]> {
  const client = new ProjectsClient({ auth })
  const projects: string[] = []

  try {
    const request: SearchProjectsRequest = {
      query: filter || "",
    }
    const [projectsList] = await client.searchProjects(request)

    for (const project of projectsList || []) {
      if (project.projectId) {
        projects.push(project.projectId)
      }
    }

    return projects
  } catch (error) {
    if (error instanceof Error) {
      const apiError = error as GcpApiError
      console.error("Failed to list projects:", {
        code: apiError.code,
        message: apiError.message,
        details: apiError.details,
        status: apiError.status,
        name: apiError.name,
        stack: apiError.stack,
      })
    }
    return []
  }
}
