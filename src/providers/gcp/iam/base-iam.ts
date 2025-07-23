import { BackoffOptions } from "exponential-backoff"
import { GcpAuthenticatedIdentity } from "../creds/identity.js"

// Constants for API calls
export const API_CALL_DELAY = 1000 // 1 second delay between API calls
export const BACKOFF_OPTIONS: BackoffOptions = {
  numOfAttempts: 5,
  startingDelay: 1000,
  timeMultiple: 2,
  maxDelay: 10000,
}

// Common interfaces
export interface IamBinding {
  role: string
  members: string[]
}

export interface IamPolicy {
  version?: number
  bindings?: IamBinding[]
  etag?: string
}

export interface RoleUpdateResult {
  newlyAddedRoles: string[]
  failedRoles: string[]
}

/**
 * Base class for GCP IAM management operations
 */
export abstract class BaseGcpIamManager {
  protected initialized: boolean = false
  protected readonly identity: GcpAuthenticatedIdentity
  protected userEmail: string | undefined

  constructor(identity: GcpAuthenticatedIdentity) {
    this.identity = identity
  }

  /**
   * Initialize the manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }
    this.initialized = true
    this.userEmail = await this.identity.getCurrentUserEmail()
    console.log("User email:", this.userEmail)
    await this.initializeSpecific()
  }

  /**
   * Initialize specific implementation for derived classes
   */
  protected abstract initializeSpecific(): Promise<void>

  /**
   * Format a resource name according to GCP API requirements
   */
  protected abstract formatResourceName(resourceId: string): string

  /**
   * Ensure all necessary permissions are granted
   * This method should attempt to grant any missing permissions
   */
  abstract ensurePermissions(): Promise<void>
}
