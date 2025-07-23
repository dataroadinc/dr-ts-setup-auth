# Authentication and Developer Workflow

## Authentication Automation and Developer Workflow (June 2025)

### **Overview**

The authentication system provides automated login and credential management for
multiple cloud providers. This eliminates manual authentication steps and
ensures consistent access across all integrated services.

### **Supported Providers**

#### **Google Cloud Platform**

- **User Authentication**: gcloud CLI user login
- **Service Account Authentication**: Application Default Credentials (ADC)
- **API Authentication**: Service account key files
- **OAuth Authentication**: OAuth client credentials

#### **Vercel**

- **API Authentication**: Vercel access tokens
- **Team Authentication**: Team ID validation
- **Project Authentication**: Project ID validation

#### **Azure**

- **User Authentication**: Azure CLI login
- **Service Principal Authentication**: Service principal credentials
- **OAuth Authentication**: Azure AD OAuth clients

#### **GitHub**

- **API Authentication**: GitHub personal access tokens
- **OAuth Authentication**: GitHub OAuth applications

### **Authentication Workflow**

#### **Initial Setup**

1. **Install CLI Tools**: Install required CLI tools (gcloud, az, etc.)
2. **Configure Environment**: Set up environment variables
3. **Authenticate User**: Run initial authentication commands
4. **Validate Access**: Verify access to all required services

#### **Daily Workflow**

1. **Check Authentication**: Verify current authentication status
2. **Refresh Tokens**: Refresh expired tokens automatically
3. **Validate Permissions**: Ensure required permissions are available
4. **Execute Commands**: Run authentication-dependent commands

#### **Error Recovery**

1. **Detect Authentication Failures**: Identify authentication issues
2. **Attempt Re-authentication**: Try to re-authenticate automatically
3. **Fallback to Manual**: Provide manual authentication instructions
4. **Log Issues**: Record authentication problems for debugging

### **Implementation Details**

#### **Authentication Manager**

```typescript
class AuthenticationManager {
  async validateGcpAuth(): Promise<boolean>
  async validateVercelAuth(): Promise<boolean>
  async validateAzureAuth(): Promise<boolean>
  async validateGitHubAuth(): Promise<boolean>

  async refreshGcpAuth(): Promise<void>
  async refreshVercelAuth(): Promise<void>
  async refreshAzureAuth(): Promise<void>
  async refreshGitHubAuth(): Promise<void>
}
```

#### **Provider-Specific Authentication**

```typescript
class GcpAuthProvider {
  async validateUserAuth(): Promise<boolean>
  async validateServiceAccountAuth(): Promise<boolean>
  async refreshUserAuth(): Promise<void>
  async refreshServiceAccountAuth(): Promise<void>
}

class VercelAuthProvider {
  async validateApiAuth(): Promise<boolean>
  async validateTeamAuth(): Promise<boolean>
  async refreshApiAuth(): Promise<void>
}
```

## Planned Feature: Unified Login Command

### **Overview**

A unified login command that handles authentication for all supported cloud
providers in a single command. This simplifies the developer workflow and
ensures consistent authentication across all services.

### **Command Design**

#### **Basic Usage**

```bash
# Login to all providers
pnpm start login

# Login to specific providers
pnpm start login --gcp --vercel

# Login with specific options
pnpm start login --gcp-user --vercel-team=team_123
```

#### **Advanced Usage**

```bash
# Login with custom configuration
pnpm start login \
  --gcp-project=my-project \
  --vercel-team=team_123 \
  --azure-tenant=my-tenant

# Login with service account
pnpm start login \
  --gcp-service-account=/path/to/key.json \
  --azure-service-principal=/path/to/credentials.json
```

### **Implementation**

#### **Command Structure**

```typescript
class LoginCommand extends Command {
  async execute(): Promise<void> {
    // Validate environment variables
    await this.validateEnvironment()

    // Authenticate to each provider
    await this.authenticateGcp()
    await this.authenticateVercel()
    await this.authenticateAzure()
    await this.authenticateGitHub()

    // Validate authentication
    await this.validateAllAuth()

    // Save authentication state
    await this.saveAuthState()
  }
}
```

#### **Provider Authentication**

```typescript
class GcpAuthenticator {
  async authenticateUser(): Promise<void> {
    // Run gcloud auth login
    await this.runGcloudAuthLogin()

    // Set up Application Default Credentials
    await this.setupApplicationDefaultCredentials()

    // Validate authentication
    await this.validateAuthentication()
  }

  async authenticateServiceAccount(keyFile: string): Promise<void> {
    // Activate service account
    await this.activateServiceAccount(keyFile)

    // Validate service account permissions
    await this.validateServiceAccountPermissions()
  }
}
```

### **Features**

#### **Automatic Token Refresh**

- **Detection**: Automatically detect expired tokens
- **Refresh**: Refresh tokens without user intervention
- **Validation**: Validate refreshed tokens
- **Fallback**: Fall back to manual authentication if needed

#### **Multi-Provider Support**

- **Parallel Authentication**: Authenticate to multiple providers simultaneously
- **Dependency Management**: Handle provider dependencies
- **Error Isolation**: Isolate authentication failures per provider
- **Partial Success**: Continue with successfully authenticated providers

#### **Configuration Management**

- **Environment Variables**: Use environment variables for configuration
- **Profile Support**: Support multiple authentication profiles
- **Secure Storage**: Securely store authentication tokens
- **Configuration Validation**: Validate configuration before authentication

### **Security Considerations**

#### **Token Management**

- **Secure Storage**: Store tokens securely (not in plain text)
- **Token Rotation**: Support automatic token rotation
- **Access Control**: Limit token access to required permissions
- **Audit Logging**: Log authentication events for audit purposes

#### **Error Handling**

- **Graceful Degradation**: Continue operation with partial authentication
- **Clear Error Messages**: Provide clear error messages for authentication
  failures
- **Recovery Instructions**: Provide recovery instructions for failed
  authentication
- **Debug Information**: Include debug information for troubleshooting

## IAM Propagation Optimization (July 2025)

### **Problem**

IAM role assignments can take time to propagate across Google Cloud Platform.
This can cause authentication and permission issues immediately after role
assignment.

### **Solution**

Implement IAM propagation optimization with the following strategies:

#### **Polling for Propagation**

```typescript
async waitForIamPropagation(
  serviceAccount: string,
  role: string,
  timeout: number = 300000
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      await this.testIamPermission(serviceAccount, role)
      return
    } catch (error) {
      await this.sleep(5000) // Wait 5 seconds before retry
    }
  }

  throw new Error(`IAM propagation timeout after ${timeout}ms`)
}
```

#### **Permission Testing**

```typescript
async testIamPermission(
  serviceAccount: string,
  role: string
): Promise<boolean> {
  const command = [
    'iam', 'service-accounts', 'get-iam-policy',
    serviceAccount,
    '--format', 'json'
  ]

  const output = await this.executeCommand(command)
  const policy = JSON.parse(output)

  return policy.bindings.some(binding =>
    binding.role === role &&
    binding.members.includes(`serviceAccount:${serviceAccount}`)
  )
}
```

### **Implementation**

#### **Enhanced Service Account Creation**

```typescript
async createServiceAccountWithIam(
  name: string,
  roles: string[]
): Promise<ServiceAccount> {
  // Create service account
  const serviceAccount = await this.createServiceAccount(name)

  // Assign IAM roles
  for (const role of roles) {
    await this.assignIamRole(serviceAccount.email, role)
  }

  // Wait for IAM propagation
  await this.waitForIamPropagation(serviceAccount.email, roles[0])

  return serviceAccount
}
```

#### **Batch Role Assignment**

```typescript
async assignMultipleIamRoles(
  serviceAccount: string,
  roles: string[]
): Promise<void> {
  // Assign all roles
  const promises = roles.map(role =>
    this.assignIamRole(serviceAccount, role)
  )
  await Promise.all(promises)

  // Wait for propagation of first role (indicator)
  await this.waitForIamPropagation(serviceAccount, roles[0])
}
```

### **Benefits**

- **Immediate Availability**: IAM roles are available immediately after
  assignment
- **Reduced Errors**: Fewer authentication and permission errors
- **Better User Experience**: Smoother workflow without waiting periods
- **Reliable Automation**: More reliable automated processes

## Handling gcloud Authentication Expiration (July 2025)

### **Problem**

gcloud authentication tokens can expire, causing authentication failures during
automated processes. This is especially problematic for long-running operations.

### **Solution**

Implement automatic token refresh and authentication recovery:

#### **Token Expiration Detection**

```typescript
async detectTokenExpiration(): Promise<boolean> {
  try {
    await this.executeCommand(['auth', 'list', '--format', 'json'])
    return false
  } catch (error) {
    return error.message.includes('expired') ||
           error.message.includes('invalid')
  }
}
```

#### **Automatic Token Refresh**

```typescript
async refreshGcloudAuth(): Promise<void> {
  // Check if user authentication is available
  const hasUserAuth = await this.hasUserAuthentication()

  if (hasUserAuth) {
    // Refresh user authentication
    await this.refreshUserAuth()
  } else {
    // Refresh service account authentication
    await this.refreshServiceAccountAuth()
  }
}
```

#### **Service Account Authentication Recovery**

```typescript
async refreshServiceAccountAuth(): Promise<void> {
  const credentialsFile = process.env.GCP_OAUTH_APPLICATION_CREDENTIALS

  if (!credentialsFile) {
    throw new Error('Service account credentials file not configured')
  }

  // Activate service account
  await this.executeCommand([
    'auth', 'activate-service-account',
    '--key-file', credentialsFile
  ])

  // Set application default credentials
  await this.executeCommand([
    'auth', 'application-default', 'login',
    '--no-launch-browser'
  ])
}
```

### **Integration with Commands**

#### **Pre-Command Authentication Check**

```typescript
async ensureGcpAuth(): Promise<void> {
  if (await this.detectTokenExpiration()) {
    console.log('GCP authentication expired, refreshing...')
    await this.refreshGcloudAuth()
  }
}
```

#### **Command Wrapper**

```typescript
async executeWithAuth<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (this.isAuthError(error)) {
      await this.refreshGcloudAuth()
      return await operation()
    }
    throw error
  }
}
```

### **Benefits**

- **Automatic Recovery**: Automatically handle token expiration
- **Seamless Operation**: No manual intervention required
- **Improved Reliability**: More reliable automated processes
- **Better User Experience**: Reduced authentication-related errors
