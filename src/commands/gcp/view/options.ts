import {
  AuthenticationType,
  GcpAuthenticatedIdentity,
} from "../../../providers/gcp/creds/identity.js"
import { SetupAuthGlobalOptions } from "../../../types/index.js"
import { SetupAuthError } from "../../../utils/error.js"

export const GCP_VIEW_ITEMS = [
  "project",
  "organization",
  "service-account",
] as const

export type GcpViewItem = (typeof GCP_VIEW_ITEMS)[number]

/**
 * CLI command options
 */
export interface gcpViewOptions extends SetupAuthGlobalOptions {
  item: string
  auth?: AuthenticationType
  identity?: GcpAuthenticatedIdentity
  enable?: boolean // Whether to attempt to grant missing permissions
}

export async function checkOptions(options: gcpViewOptions): Promise<void> {
  if (!GCP_VIEW_ITEMS.includes(options.item as GcpViewItem)) {
    throw new SetupAuthError(
      `Invalid item: ${options.item}. Must be one of: ${GCP_VIEW_ITEMS.join(", ")}`
    )
  }

  if (
    options.auth &&
    !["Service Account", "ADC", "User Account"].includes(options.auth)
  ) {
    throw new SetupAuthError(
      `Invalid auth type: ${options.auth}. Must be one of: Service Account, ADC, User Account`
    )
  }

  // Check required options for organization view
  if (options.item === "organization") {
    if (!options.gcpOauthOrganizationId) {
      throw new SetupAuthError(
        "Missing required option: gcpOauthOrganizationId"
      )
    }
  }
}
