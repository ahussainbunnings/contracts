# Azure Key Vault Setup

This dashboard now uses Azure Key Vault to securely store sensitive credentials instead of keeping them in environment files.

## Key Vault Configuration

- **Key Vault URL**: `https://digstgsydslsfrckv.vault.azure.net/`

## Required Secrets

You need to create the following secrets in your Azure Key Vault:

### 1. Cosmos DB Connection String
- **Secret Name**: `contracts-cosmosdb-sit`
- **Value**: Your full Cosmos DB connection string
- **Example**: `AccountEndpoint=https://your-account.documents.azure.com:443/;AccountKey=your-key;`

### 2. Dynatrace API Token
- **Secret Name**: `cos-dashboard-dynatraceapitoken`
- **Value**: Your Dynatrace API token
- **Example**: `your-dynatrace-api-token-here`

## Environment Configuration

Your `.env` files now contain:

```bash
# Azure Key Vault Configuration
KEY_VAULT_URL=https://digstgsydslsfrckv.vault.azure.net/

# Cosmos DB Configuration (non-sensitive)
COSMOS_DATABASE=contractinsvc-qa-db
CONTRACT_CONTAINER=contract
CONTRACT_ENTITIES_CONTAINER=contract-entities

# Service Configuration
SERVICE_NAME=dashboard
ENVIRONMENT=SIT

# Dynatrace Configuration (non-sensitive URLs)
DYNATRACE_URL=https://twh49101.live.dynatrace.com
DYNATRACE_METRICS_URL=https://twh49101.live.dynatrace.com/api/v2/metrics/ingest
DYNATRACE_LOGS_URL=https://twh49101.live.dynatrace.com/api/v2/logs/ingest

# Debug Settings
DEBUG_DT_LINES=true
DEBUG_DT_LOGS=true
```

## Azure Authentication

The application uses `DefaultAzureCredential` for authentication, which supports:

1. **Environment Variables**: Set `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`
2. **Managed Identity**: When running in Azure
3. **Azure CLI**: When running locally with `az login`
4. **Visual Studio Code**: When using the Azure extension

## Security Benefits

- ✅ Sensitive credentials are stored securely in Azure Key Vault
- ✅ Credentials are not exposed in environment files or code
- ✅ Automatic credential rotation support
- ✅ Centralized access management
- ✅ Audit logging of secret access

## Migration from .env files

The old .env files are preserved but now only contain non-sensitive configuration. The sensitive values (connection strings and API tokens) are retrieved from Key Vault at runtime.

## Troubleshooting

If you encounter authentication issues:

1. Ensure you have access to the Key Vault
2. Verify the Key Vault URL is correct
3. Check that the required secrets exist
4. Ensure your Azure credentials are properly configured

## Testing

To test the Key Vault integration:

```bash
# Test with SIT environment
npm run start:sit today

# Test debug mode
npm run debug:sit
```
