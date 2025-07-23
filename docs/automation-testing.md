# Automation and Testing

## Automation-First Principle: What's Automated, What's Not (Yet)

### ✅ **Fully Automated**

#### **Google Cloud Platform**

- **Service Account Creation**: Automated via gcloud CLI
- **IAM Role Assignment**: Automated via gcloud CLI
- **OAuth Consent Screen**: Automated via Google APIs
- **OAuth Client Creation**: Automated via Google APIs
- **Credential File Generation**: Automated via gcloud CLI
- **Project Creation**: Automated via gcloud CLI
- **Organization Policy**: Automated via Google APIs

#### **Vercel Integration**

- **Authentication Validation**: Automated via Vercel API
- **Deployment URL Discovery**: Automated via Vercel API
- **Project Validation**: Automated via Vercel API
- **Redirect URL Updates**: Automated via OAuth APIs

#### **OAuth Providers**

- **Google OAuth**: Fully automated setup and configuration
- **GitHub OAuth**: Automated client creation and configuration
- **Azure OAuth**: Automated client creation and configuration

### 🔄 **Partially Automated**

#### **Authentication**

- **User Login**: Requires manual gcloud auth login
- **Service Account Auth**: Automated via Application Default Credentials
- **Vercel Auth**: Automated via API tokens

#### **Configuration**

- **Environment Variables**: Manual setup required
- **Domain Validation**: Automated but requires manual domain configuration
- **Team/Project IDs**: Manual configuration required

### ❌ **Not Yet Automated**

#### **Manual Steps Required**

- **Initial gcloud CLI setup**: User must install and authenticate
- **Vercel account setup**: User must create account and get tokens
- **Environment variable configuration**: Manual setup of .env.local
- **Domain ownership verification**: Manual verification in Google Console
- **Team/Project ID discovery**: Manual lookup in respective consoles

## Functionality Removed and To Be Re-Implemented

### **Removed Functionality**

#### **Organization-Level OAuth Client Listing**

- **Reason**: Google API limitations prevent listing all OAuth clients
- **Impact**: Cannot view all OAuth clients in organization
- **Workaround**: Use project-specific OAuth client management
- **Future**: May be re-implemented with different approach

#### **Bulk Operations**

- **Reason**: API rate limits and complexity
- **Impact**: Operations must be performed per project
- **Workaround**: Script-based bulk operations
- **Future**: May be re-implemented with better error handling

### **To Be Re-Implemented**

#### **Organization-Level Views**

- **Plan**: Use gcloud CLI to list organization resources
- **Approach**: Parse gcloud output for organization-wide data
- **Timeline**: Future enhancement

#### **Bulk Configuration**

- **Plan**: Script-based approach for multiple projects
- **Approach**: Iterate through project list
- **Timeline**: Future enhancement

## Integration Test Plan Outline

### **Test Categories**

#### **Authentication Tests**

- **gcloud CLI Authentication**: Test user login and ADC
- **Service Account Authentication**: Test service account credentials
- **Vercel API Authentication**: Test Vercel token validation
- **OAuth Provider Authentication**: Test OAuth client credentials

#### **GCP Integration Tests**

- **Service Account Creation**: Test automated service account setup
- **IAM Role Assignment**: Test role assignment automation
- **OAuth Client Creation**: Test OAuth client setup
- **Project Management**: Test project creation and configuration
- **Organization Policy**: Test policy application

#### **Vercel Integration Tests**

- **Project Validation**: Test project existence and access
- **Deployment Discovery**: Test deployment URL extraction
- **Redirect URL Updates**: Test OAuth client updates

#### **OAuth Provider Tests**

- **Google OAuth**: Test Google OAuth client setup
- **GitHub OAuth**: Test GitHub OAuth client setup
- **Azure OAuth**: Test Azure OAuth client setup

### **Test Environment**

#### **Mock Environment**

- **Google APIs**: Mock responses for development testing
- **Vercel API**: Mock responses for development testing
- **OAuth Providers**: Mock responses for development testing

#### **Integration Environment**

- **Test GCP Project**: Dedicated test project for integration tests
- **Test Vercel Project**: Dedicated test project for integration tests
- **Test OAuth Clients**: Dedicated test OAuth clients

### **Test Execution**

#### **Local Testing**

```bash
# Run all tests
pnpm test

# Run specific test category
pnpm test --grep "GCP"

# Run integration tests
pnpm test --grep "integration"
```

#### **CI/CD Testing**

- **Automated**: Tests run on every pull request
- **Environment**: Uses dedicated test environment
- **Coverage**: Ensures all functionality is tested

## How to Run Tests

### **Test Setup**

```bash
# Install dependencies
pnpm install

# Set up test environment
cp env.local.example .env.local
# Edit .env.local with test configuration

# Run tests
pnpm test
```

### **Test Categories**

#### **Unit Tests**

- **Location**: `src/**/*.test.ts`
- **Coverage**: Individual function and class testing
- **Execution**: `pnpm test --grep "unit"`

#### **Integration Tests**

- **Location**: `src/**/*.int.test.ts`
- **Coverage**: End-to-end functionality testing
- **Execution**: `pnpm test --grep "integration"`

#### **OAuth Tests**

- **Location**: `src/providers/gcp/oauth/*.test.ts`
- **Coverage**: OAuth client creation and management
- **Execution**: `pnpm test --grep "oauth"`

### **Test Configuration**

#### **Environment Variables**

```env
# Test GCP Configuration
GCP_OAUTH_PROJECT_ID=test-project-id
GCP_OAUTH_ORGANIZATION_ID=test-org-id
GCP_OAUTH_APPLICATION_CREDENTIALS=/path/to/test-credentials.json

# Test Vercel Configuration
VERCEL_TEAM_ID=test-team-id
VERCEL_PROJECT_ID=test-project-id
VERCEL_ACCESS_TOKEN=test-access-token

# Test OAuth Configuration
GCP_OAUTH_CLIENT_ID=test-client-id
GCP_OAUTH_CLIENT_SECRET=test-client-secret
```

#### **Mock Configuration**

- **Google APIs**: Mock responses for consistent testing
- **Vercel API**: Mock responses for consistent testing
- **OAuth Providers**: Mock responses for consistent testing

### **Test Results**

#### **Coverage Report**

- **Lines**: Percentage of code lines covered
- **Functions**: Percentage of functions covered
- **Branches**: Percentage of conditional branches covered

#### **Performance Metrics**

- **Execution Time**: Time to run all tests
- **Memory Usage**: Memory consumption during testing
- **API Calls**: Number of external API calls made

### **Continuous Integration**

#### **GitHub Actions**

- **Trigger**: On every pull request
- **Environment**: Ubuntu with Node.js 22
- **Steps**: Install, test, lint, format check
- **Results**: Pass/fail status with detailed logs

#### **Quality Gates**

- **Test Coverage**: Minimum 80% coverage required
- **Linting**: No linting errors allowed
- **Formatting**: All files must be properly formatted
- **Build**: Project must build successfully
