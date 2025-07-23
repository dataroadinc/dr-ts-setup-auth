import { GcpAuthenticatedIdentity } from "@/providers/gcp/creds/identity.js"
import { gcpCheckOauthOrganizationId } from "@/providers/gcp/organization.js"
import {
  gcpCheckOauthProjectId,
  GcpProjectManager,
} from "@/providers/gcp/project/index.js"
import { SetupAuthError } from "@/utils/error.js"
import { gcpViewOptions } from "./options.js"

export async function gcpViewProject(
  options: gcpViewOptions,
  identity: GcpAuthenticatedIdentity
): Promise<void> {
  const { success: successProject, error: errorProject } =
    await gcpCheckOauthProjectId(options)
  if (!successProject) {
    throw new SetupAuthError(errorProject!)
  }
  const { success: successOrganization, error: errorOrganization } =
    await gcpCheckOauthOrganizationId(options)
  if (!successOrganization) {
    throw new SetupAuthError(errorOrganization!)
  }

  const projectViewer = new GcpProjectViewer(
    identity,
    options.gcpOauthOrganizationId!,
    options.gcpOauthProjectId!
  )
  await projectViewer.view()

  if (options.gcpOauthProjectId === options.gcpOauthQuotaProjectId) {
    console.log("Project is also the quota project")
  } else {
    console.log(
      "Project has a different quota project:",
      options.gcpOauthQuotaProjectId
    )
    const quotaProjectViewer = new GcpProjectViewer(
      identity,
      options.gcpOauthOrganizationId!,
      options.gcpOauthQuotaProjectId!
    )
    await quotaProjectViewer.view()
  }
}

export class GcpProjectViewer {
  private initialized = false
  private readonly identity: GcpAuthenticatedIdentity
  private readonly organizationId: string
  private readonly projectId: string
  private readonly projectManager: GcpProjectManager

  constructor(
    identity: GcpAuthenticatedIdentity,
    organizationId: string,
    projectId: string
  ) {
    this.identity = identity
    this.organizationId = organizationId
    this.projectId = projectId
    this.projectManager = new GcpProjectManager(
      this.identity,
      this.organizationId
    )
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }
    await this.projectManager.initialize()
    this.initialized = true
  }

  async view(): Promise<void> {
    await this.initialize()
    console.log(
      "Viewing project",
      this.projectId,
      "in organization",
      this.organizationId
    )
    const project = await this.projectManager.getProject(this.projectId)
    console.log(project)
  }
}
