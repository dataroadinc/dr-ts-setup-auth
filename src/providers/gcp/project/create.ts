import { SetupAuthError } from "@/utils/error.js"
import { ProjectsClient } from "@google-cloud/resource-manager"
import { GcpProjectManager, gcpSetOauthProjectId } from "./index.js"

/**
 * This is basically a private method of the GcpProjectManager class, do
 * not use this method directly, use GcpProjectManager.createProject() method instead.
 */
export async function gcpCreateProject(
  projectManager: GcpProjectManager,
  projectsClient: ProjectsClient,
  organizationId: string,
  projectId: string
): Promise<void> {
  try {
    await _gcpCreateProject(
      projectManager,
      projectsClient,
      organizationId,
      projectId
    )
  } catch (error) {
    if (error instanceof SetupAuthError) {
      throw error // Re-throw SetupAuthError as is
    }
    // Handle any other errors from the outer try block
    throw new SetupAuthError(`Failed to create GCP project ${projectId}:`, {
      cause: error,
    })
  }
}

async function _gcpCreateProject(
  projectManager: GcpProjectManager,
  projectsClient: ProjectsClient,
  organizationId: string,
  projectId: string
): Promise<void> {
  // Check if the project already exists
  const exists = await projectManager.projectExists(projectId)

  if (exists) {
    return await _gcpUpdateProject(projectManager, organizationId, projectId)
  }

  return await _gcpCreateNewProject(projectsClient, organizationId, projectId)
}

async function _gcpUpdateProject(
  projectManager: GcpProjectManager,
  organizationId: string,
  projectId: string
): Promise<void> {
  // Check if the project is attached to our organization
  const isAttached = await projectManager.isAttachedToOrganization(projectId)

  if (isAttached) {
    console.log(
      `✅ Project ${projectId} already exists in organization ${organizationId}`
    )
    // Set environment variables after confirming project exists and is attached
    await gcpSetOauthProjectId({ gcpOauthProjectId: projectId })
    return
  }

  // Project exists but is not attached to our organization
  console.log(
    `Project ${projectId} exists but is not attached to organization ${organizationId}`
  )

  // Try to migrate the project to our organization
  const migrationSucceeded =
    await projectManager.migrateProjectToOrganization(projectId)

  if (migrationSucceeded) {
    console.log(
      `✅ Successfully migrated project ${projectId} to organization ${organizationId}`
    )
    // Set environment variables after successful migration
    await gcpSetOauthProjectId({ gcpOauthProjectId: projectId })
    return
  }

  // If migration fails, delete the project and recreate it
  console.log(`Migration failed. Deleting and recreating project ${projectId}`)
  await projectManager.deleteProject(projectId)

  // Wait a moment for deletion to be processed
  await new Promise(resolve => setTimeout(resolve, 3000))
}

async function _gcpCreateNewProject(
  projectsClient: ProjectsClient,
  organizationId: string,
  projectId: string
): Promise<void> {
  // Create a new project
  console.log(
    `Creating new project ${projectId} in organization ${organizationId}`
  )
  try {
    const [operation] = await projectsClient.createProject({
      project: {
        projectId,
        parent: `organizations/${organizationId}`,
      },
    })

    // Wait for the operation to complete
    await operation.promise()
    console.log(
      `Created project ${projectId} in organization ${organizationId}`
    )

    // Set environment variables only after successful project creation
    await gcpSetOauthProjectId({ gcpOauthProjectId: projectId })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (createError: any) {
    // Log detailed error information about project creation
    console.error("Project creation failed with error:", {
      projectId,
      organizationId,
      errorCode: createError?.code,
      errorStatus: createError?.status,
      errorName: createError?.name,
      errorDetails: createError?.details,
      errorMessage: createError?.message,
      metadata: createError?.metadata?.internalRepr
        ? Object.fromEntries(createError.metadata.internalRepr)
        : undefined,
    })

    // Build a comprehensive error message
    const errorParts = []
    if (createError?.code) errorParts.push(`Code: ${createError.code}`)
    if (createError?.status) errorParts.push(`Status: ${createError.status}`)
    if (createError?.name) errorParts.push(`Type: ${createError.name}`)

    const errorContext =
      errorParts.length > 0 ? ` (${errorParts.join(", ")})` : ""
    const errorDetails = [
      createError?.details,
      createError?.message,
      createError?.metadata?.internalRepr
        ?.get("google.rpc.errorinfo-bin")
        ?.toString(),
      createError?.stack?.split("\n")[0], // First line of stack trace if available
    ]
      .filter(Boolean)
      .join(". ")

    throw new SetupAuthError(
      `Failed to create project ${projectId} in organization ${organizationId}${errorContext}. ` +
        `Details: ${errorDetails || "No additional error details available"}`,
      createError
    )
  }
}
