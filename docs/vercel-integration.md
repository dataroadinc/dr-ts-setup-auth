# Vercel Integration

## Vercel CLI Integration (July 2025)

### ✅ **Authentication Validation Fixed**

- **Problem**: CLI `vercel whoami` returns username instead of full email,
  causing validation failures
- **Solution**: Switched to Vercel REST API `/v2/user` endpoint to get user
  email and `defaultTeamId`
- **Result**: Authentication validation now works perfectly using API approach
- **Validation**: Compares `VERCEL_TEAM_ID` with user's `defaultTeamId` for
  exact match

### ✅ **Deployment API Integration**

- **Problem**: Need to get deployment URLs for OAuth redirect configuration
- **Solution**: Using Vercel REST API `/v1/deployments` endpoint
- **Result**: Can automatically fetch all deployment URLs for a project
- **Implementation**: Added `getDeploymentUrls()` function to Vercel API client

### ✅ **Project Configuration**

- **Problem**: Need to validate project exists and get project details
- **Solution**: Using Vercel REST API `/v1/projects` endpoint
- **Result**: Can validate project exists and get project configuration
- **Implementation**: Added project validation and configuration retrieval

## Vercel Integration Strategy (July 2025)

### Overview

The Vercel integration provides automatic redirect URL management for OAuth
clients. When deployments are created or updated, the system automatically
updates the OAuth client's redirect URLs to include the new deployment URLs.

### Key Components

#### **Authentication**

- Uses Vercel REST API for authentication validation
- Validates team ID against user's default team
- Supports both personal and team accounts

#### **Deployment Management**

- Automatically fetches deployment URLs from Vercel API
- Filters deployments by project and environment
- Supports multiple deployment environments (production, preview, development)

#### **OAuth Integration**

- Updates OAuth client redirect URLs automatically
- Supports multiple OAuth providers (Google, GitHub, Azure)
- Maintains existing redirect URLs while adding new ones

### API Endpoints Used

#### **Authentication**

```typescript
GET / v2 / user
```

Returns user information including:

- `email`: User's email address
- `defaultTeamId`: User's default team ID
- `username`: User's username

#### **Projects**

```typescript
GET / v1 / projects
```

Returns list of projects for the authenticated user/team.

#### **Deployments**

```typescript
GET / v1 / deployments
```

Returns list of deployments with parameters:

- `projectId`: Filter by project ID
- `limit`: Number of deployments to return
- `since`: Only return deployments after this timestamp

### Implementation Details

#### **Vercel API Client**

The `VercelApiClient` class provides a wrapper around the Vercel REST API:

```typescript
class VercelApiClient {
  constructor(private accessToken: string) {}

  async getUser(): Promise<VercelUser>
  async getProjects(): Promise<VercelProject[]>
  async getDeployments(projectId: string): Promise<VercelDeployment[]>
}
```

#### **Authentication Validation**

```typescript
async validateVercelAuth(): Promise<boolean> {
  const user = await this.vercelClient.getUser()
  return user.defaultTeamId === process.env.VERCEL_TEAM_ID
}
```

#### **Deployment URL Extraction**

```typescript
async getDeploymentUrls(projectId: string): Promise<string[]> {
  const deployments = await this.vercelClient.getDeployments(projectId)
  return deployments.map(deployment => deployment.url)
}
```

### Configuration

#### **Environment Variables**

- `VERCEL_ACCESS_TOKEN`: Vercel API access token
- `VERCEL_TEAM_ID`: Team ID for the project
- `VERCEL_PROJECT_ID`: Project ID for the deployment
- `VERCEL_PROJECT_NAME`: Project name for display

#### **OAuth Integration**

The Vercel integration works with the OAuth setup commands:

- `gcp-setup-oauth`: Updates Google OAuth client redirect URLs
- `github-setup-oauth`: Updates GitHub OAuth client redirect URLs
- `azure-setup-oauth`: Updates Azure OAuth client redirect URLs

### Workflow

1. **Authentication**: Validate Vercel credentials and team access
2. **Project Validation**: Verify project exists and is accessible
3. **Deployment Discovery**: Fetch all deployment URLs for the project
4. **OAuth Update**: Update OAuth client redirect URLs with deployment URLs
5. **Verification**: Confirm OAuth client was updated successfully

### Error Handling

- **Authentication Errors**: Clear error messages for invalid tokens
- **Project Errors**: Validation of project existence and access
- **API Errors**: Retry logic for transient API failures
- **OAuth Errors**: Detailed error messages for OAuth client updates

### Future Enhancements

- **Webhook Integration**: Automatic updates when deployments are created
- **Environment Filtering**: Filter deployments by environment (prod, preview)
- **Custom Domains**: Support for custom domain deployments
- **Batch Updates**: Update multiple OAuth clients simultaneously
