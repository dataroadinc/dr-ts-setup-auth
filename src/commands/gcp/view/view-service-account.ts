import { GcpAuthenticatedIdentity } from "@/providers/gcp/creds/identity.js"
import { SetupAuthError } from "@/utils/error.js"
import { gcpViewOptions } from "./options.js"

export async function gcpViewServiceAccount(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options: gcpViewOptions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _identity: GcpAuthenticatedIdentity
): Promise<void> {
  // TODO: Implement service account viewing logic
  throw new SetupAuthError("Service account viewing not implemented yet")
}
