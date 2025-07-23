// =======================================================================
// === GCP Service Constants ===========================================
// =======================================================================

/**
 * Common GCP service endpoints required by various setup processes.
 */
export const REQUIRED_SERVICES = {
  // Core APIs
  RESOURCE_MANAGER: "cloudresourcemanager.googleapis.com",
  SERVICE_USAGE: "serviceusage.googleapis.com",
  IAM: "iam.googleapis.com",
  // IAM Credentials API (Correct Name)
  CREDENTIALS: "iamcredentials.googleapis.com",
  // Org Policy
  ORG_POLICY: "orgpolicy.googleapis.com",
  // OAuth Related (may be required by specific flows)
  OAUTH2: "oauth2.googleapis.com", // Note: This is often implicitly public
  IAP: "iap.googleapis.com",
  // Billing (might be checked but not usually enabled by script)
  BILLING: "cloudbilling.googleapis.com",
  // Access Context Manager (for VPC-SC checks)
  ACCESS_CONTEXT_MANAGER: "accesscontextmanager.googleapis.com",
  // Service Management (sometimes needed for IAP/OAuth?)
  SERVICE_MANAGEMENT: "servicemanagement.googleapis.com",
} as const

/**
 * Public Google APIs that are globally available and typically cannot/needn't be toggled per project.
 */
export const PUBLIC_SERVICES = [
  REQUIRED_SERVICES.OAUTH2,
  // Add others here if identified, e.g., maybe cloudbilling.googleapis.com?
] as const

// =======================================================================
// === GCP Permission Constants ==========================================
// =======================================================================

/**
 * Permissions required at the Global level (checked against the user running the script).
 */
export const GLOBAL_PERMISSIONS = {
  // Org/Folder discovery
  LIST_ORGANIZATIONS: "resourcemanager.organizations.list",
  LIST_FOLDERS: "resourcemanager.folders.list",
  // Project creation
  CREATE_PROJECT: "resourcemanager.projects.create",
  // Billing discovery
  LIST_BILLING_ACCOUNTS: "billing.accounts.list",
} as const

/**
 * Permissions required at the Organization level (checked against the user running the script).
 */
export const ORGANIZATION_PERMISSIONS = {
  // Basic org info
  GET_ORGANIZATION: "resourcemanager.organizations.get",
  UPDATE_ORGANIZATION: "resourcemanager.organizations.update",
  // Org IAM policy management (for the user running the script)
  GET_IAM_POLICY: "resourcemanager.organizations.getIamPolicy",
  SET_IAM_POLICY: "resourcemanager.organizations.setIamPolicy",
  // Ability to list projects within the org
  LIST_PROJECTS: "resourcemanager.projects.list",
  // *** Critical: Ability to set IAM policies on projects WITHIN the org ***
  PROJECTS_SET_IAM_POLICY: "resourcemanager.projects.setIamPolicy",
  // Org Policy management (checked for the user running the script)
  ORG_POLICY_GET: "orgpolicy.policy.get",
  ORG_POLICY_SET: "orgpolicy.policy.set",
  // Custom Constraint Listing (rarely needed by script)
  // LIST_CUSTOM_CONSTRAINTS: "orgpolicy.customConstraints.list",
} as const

/**
 * Permissions required at the Project level (checked against the user running the script).
 */
export const PROJECT_PERMISSIONS = {
  // Basic project info
  GET_PROJECT: "resourcemanager.projects.get",
  UPDATE_PROJECT: "resourcemanager.projects.update",
  // Project IAM policy management (for the user running the script)
  GET_IAM_POLICY: "resourcemanager.projects.getIamPolicy",
  SET_IAM_POLICY: "resourcemanager.projects.setIamPolicy",
  // Service Usage management
  ENABLE_SERVICE: "serviceusage.services.enable",
  GET_SERVICE: "serviceusage.services.get",
  LIST_SERVICES: "serviceusage.services.list",
  USE_SERVICE: "serviceusage.services.use", // Needed to use enabled services
} as const

// =======================================================================
// === GCP Role Constants ================================================
// =======================================================================

/**
 * Common primitive roles at the Organization level.
 */
export const ORGANIZATION_ROLES = {
  OWNER: "roles/owner",
  EDITOR: "roles/editor",
  VIEWER: "roles/viewer",
  // High-privilege roles potentially needed by the *user* running the script
  ORG_ADMIN: "roles/resourcemanager.organizationAdmin",
  FOLDER_ADMIN: "roles/resourcemanager.folderAdmin",
  PROJECT_CREATOR: "roles/resourcemanager.projectCreator",
  BILLING_ADMIN: "roles/billing.admin",
  ORG_POLICY_ADMIN: "roles/orgpolicy.policyAdmin",
} as const

/**
 * Common primitive and predefined roles at the Project level.
 */
export const PROJECT_ROLES = {
  // Primitive
  OWNER: "roles/owner",
  EDITOR: "roles/editor",
  VIEWER: "roles/viewer",
  // Service Usage
  SERVICE_USAGE_ADMIN: "roles/serviceusage.serviceUsageAdmin",
  SERVICE_USAGE_CONSUMER: "roles/serviceusage.serviceUsageConsumer", // Often needed by SAs
  // Service Account related
  SERVICE_ACCOUNT_ADMIN: "roles/iam.serviceAccountAdmin",
  SERVICE_ACCOUNT_USER: "roles/iam.serviceAccountUser",
  SERVICE_ACCOUNT_KEY_ADMIN: "roles/iam.serviceAccountKeyAdmin",
  // IAP related (often assigned to the service account)
  IAP_SETTINGS_ADMIN: "roles/iap.settingsAdmin",
  IAP_SECURED_USER: "roles/iap.securedUser", // If accessing IAP-protected resources
  // Service Management (potentially needed for IAP/endpoint config?)
  SERVICE_MANAGEMENT_ADMIN: "roles/servicemanagement.admin",
  // Logging (useful for service accounts)
  LOGGING_WRITER: "roles/logging.logWriter",
} as const

// Type Helper Aliases (optional, but can improve readability)
export type OrganizationRole =
  (typeof ORGANIZATION_ROLES)[keyof typeof ORGANIZATION_ROLES]
export type ProjectRole = (typeof PROJECT_ROLES)[keyof typeof PROJECT_ROLES]
export type OrganizationPermission =
  (typeof ORGANIZATION_PERMISSIONS)[keyof typeof ORGANIZATION_PERMISSIONS]
export type ProjectPermission =
  (typeof PROJECT_PERMISSIONS)[keyof typeof PROJECT_PERMISSIONS]
export type GlobalPermission =
  (typeof GLOBAL_PERMISSIONS)[keyof typeof GLOBAL_PERMISSIONS]
