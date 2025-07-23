# Google Cloud Platform Integration

## Google API Limitation and New Plan: Automate with gcloud CLI

### **Problem**

Google APIs have limitations that prevent full automation:

- **OAuth Client Listing**: Cannot list all OAuth clients in organization
- **API Rate Limits**: Strict rate limits on API calls
- **Permission Requirements**: Complex permission requirements for API access
- **Authentication Complexity**: Service account setup requires manual steps

### **Solution: gcloud CLI Integration**

Using gcloud CLI provides several advantages:

- **Better Permissions**: gcloud CLI handles authentication automatically
- **Higher Rate Limits**: CLI has higher rate limits than direct API calls
- **Simpler Setup**: Uses Application Default Credentials (ADC)
- **More Reliable**: CLI is more stable than direct API calls

### **Implementation**

#### **GcpCloudCliClient**

Centralized wrapper for gcloud CLI operations:

```typescript
class GcpCloudCliClient {
  constructor(private projectId: string) {}

  async createServiceAccount(name: string): Promise<ServiceAccount>
  async assignIamRole(serviceAccount: string, role: string): Promise<void>
  async createOAuthClient(name: string): Promise<OAuthClient>
  async listOAuthClients(): Promise<OAuthClient[]>
}
```

#### **Authentication**

Uses Application Default Credentials (ADC):

```bash
# Set up ADC
gcloud auth application-default login

# Or use service account
gcloud auth activate-service-account --key-file=service-account.json
```

## GcpCloudCliClient: Centralized gcloud CLI Wrapper

### **Overview**

The `GcpCloudCliClient` provides a centralized interface for all gcloud CLI
operations. This ensures consistent error handling, logging, and retry logic
across all GCP operations.

### **Key Features**

#### **Authentication Management**

- **ADC Support**: Uses Application Default Credentials
- **Service Account Support**: Supports service account authentication
- **Token Refresh**: Handles token expiration automatically
- **Error Handling**: Clear error messages for authentication failures

#### **Command Execution**

- **Synchronous Execution**: Waits for command completion
- **Error Parsing**: Extracts meaningful error messages
- **Output Parsing**: Parses JSON output for structured data
- **Retry Logic**: Implements exponential backoff for transient failures

#### **Resource Management**

- **Service Accounts**: Create, list, and manage service accounts
- **IAM Roles**: Assign and manage IAM roles
- **OAuth Clients**: Create and manage OAuth clients
- **Projects**: Create and manage GCP projects

### **Implementation Details**

#### **Base Class**

```typescript
abstract class GcpCloudCliClient {
  protected async executeCommand(command: string[]): Promise<string>
  protected async parseJsonOutput(output: string): Promise<any>
  protected async handleError(error: Error): Promise<never>
}
```

#### **Service Account Operations**

```typescript
class ServiceAccountClient extends GcpCloudCliClient {
  async createServiceAccount(name: string): Promise<ServiceAccount> {
    const command = [
      "iam",
      "service-accounts",
      "create",
      "--display-name",
      name,
      "--format",
      "json",
    ]
    const output = await this.executeCommand(command)
    return this.parseJsonOutput(output)
  }

  async assignIamRole(serviceAccount: string, role: string): Promise<void> {
    const command = [
      "projects",
      "add-iam-policy-binding",
      "--member",
      `serviceAccount:${serviceAccount}`,
      "--role",
      role,
    ]
    await this.executeCommand(command)
  }
}
```

#### **OAuth Client Operations**

```typescript
class OAuthClient extends GcpCloudCliClient {
  async createOAuthClient(name: string): Promise<OAuthClient> {
    const command = [
      "auth",
      "application-default",
      "create-oauth-client",
      "--display-name",
      name,
      "--format",
      "json",
    ]
    const output = await this.executeCommand(command)
    return this.parseJsonOutput(output)
  }

  async listOAuthClients(): Promise<OAuthClient[]> {
    const command = [
      "auth",
      "application-default",
      "list-oauth-clients",
      "--format",
      "json",
    ]
    const output = await this.executeCommand(command)
    return this.parseJsonOutput(output)
  }
}
```

## Google OAuth2 Automation Limitations and Environment Variables

### **API Limitations**

#### **OAuth Client Management**

- **Creation**: Can create OAuth clients via API
- **Listing**: Cannot list all OAuth clients in organization
- **Updates**: Can update OAuth client configuration
- **Deletion**: Can delete OAuth clients

#### **Consent Screen Management**

- **Creation**: Can create OAuth consent screen
- **Updates**: Can update consent screen configuration
- **Domain Verification**: Requires manual domain verification
- **Scopes**: Can manage OAuth scopes

### **Environment Variables**

#### **Required Variables**

```env
# GCP Project Configuration
GCP_OAUTH_PROJECT_ID=your-project-id
GCP_OAUTH_ORGANIZATION_ID=your-organization-id

# OAuth Configuration
GCP_OAUTH_ALLOWED_DOMAINS=your-domain.com,another-domain.com
GCP_OAUTH_APPLICATION_CREDENTIALS=/path/to/service-account.json

# OAuth Client Configuration (created by setup)
GCP_OAUTH_CLIENT_ID=
GCP_OAUTH_CLIENT_SECRET=
```

#### **Optional Variables**

```env
# OAuth Consent Screen
GKG_ORG_NAME=Your Organization Name
EKG_ORG_PRIMARY_DOMAIN=your-domain.com
EKG_ORG_PRIMARY_EMAIL=admin@your-domain.com

# OAuth Scopes
GCP_OAUTH_SCOPES=openid,email,profile
```

### **Workflow**

#### **Service Account Setup**

1. **Create Service Account**: Automated via gcloud CLI
2. **Assign IAM Roles**: Automated via gcloud CLI
3. **Generate Credentials**: Automated via gcloud CLI
4. **Configure ADC**: Automated via gcloud CLI

#### **OAuth Client Setup**

1. **Create OAuth Client**: Automated via Google APIs
2. **Configure Consent Screen**: Automated via Google APIs
3. **Set Redirect URLs**: Automated via Google APIs
4. **Verify Domain**: Manual step required

#### **Integration Setup**

1. **Update Environment Variables**: Manual configuration
2. **Test Authentication**: Automated validation
3. **Deploy Application**: Automated via Vercel
4. **Update Redirect URLs**: Automated via OAuth APIs

## TODO: Reimplement Organization-Level OAuth Client Listing

### **Current Limitation**

Google APIs do not provide a way to list all OAuth clients in an organization.
This prevents the tool from providing organization-wide OAuth client management.

### **Proposed Solutions**

#### **Solution 1: gcloud CLI Parsing**

Use gcloud CLI to list OAuth clients and parse the output:

```typescript
async listOrganizationOAuthClients(): Promise<OAuthClient[]> {
  const command = [
    'auth', 'application-default', 'list-oauth-clients',
    '--format', 'json'
  ]
  const output = await this.executeCommand(command)
  return this.parseJsonOutput(output)
}
```

#### **Solution 2: Project-Based Approach**

List OAuth clients per project and aggregate:

```typescript
async listAllOAuthClients(): Promise<OAuthClient[]> {
  const projects = await this.listProjects()
  const clients = []

  for (const project of projects) {
    const projectClients = await this.listProjectOAuthClients(project.id)
    clients.push(...projectClients)
  }

  return clients
}
```

#### **Solution 3: API Discovery**

Use Google API Discovery to find available endpoints:

```typescript
async discoverOAuthEndpoints(): Promise<string[]> {
  const discovery = await this.googleapis.discoverAPI('oauth2')
  return Object.keys(discovery.resources)
}
```

### **Implementation Plan**

#### **Phase 1: Research**

- [ ] Investigate available Google APIs for OAuth client listing
- [ ] Test gcloud CLI commands for OAuth client management
- [ ] Research API discovery and documentation

#### **Phase 2: Prototype**

- [ ] Implement gcloud CLI parsing approach
- [ ] Test with real GCP organization
- [ ] Evaluate performance and reliability

#### **Phase 3: Implementation**

- [ ] Implement chosen solution
- [ ] Add comprehensive error handling
- [ ] Add integration tests
- [ ] Update documentation

### **Success Criteria**

- **Functionality**: Can list all OAuth clients in organization
- **Performance**: Response time under 5 seconds
- **Reliability**: 99% success rate
- **Error Handling**: Clear error messages for failures
- **Documentation**: Complete API documentation
