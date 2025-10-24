# Contract Dashboard

A comprehensive contract processing dashboard with Azure Key Vault integration for secure credential management and Dynatrace metrics reporting.

## 🚀 Features

- **Real-time Contract Metrics**: Track received, processed, and failed contracts
- **Azure Key Vault Integration**: Secure credential management
- **Dynatrace Integration**: Automated metrics and logging
- **Interactive Debug Tools**: Investigate specific contracts
- **Multi-Environment Support**: SIT, UAT, and PROD configurations
- **Failed Contract Tracking**: Detailed error analysis and reporting

## 📊 Metrics Tracked

### Contract Received
- Successfully received contracts by status and country
- Unique contract counts
- Upload document processing

### Contract Processed
- Processing status by contract type
- Unique processing metrics
- Completion tracking

### Contract Failed
- Failed processing records with error details
- Error code and message analysis
- Entity type breakdown

## 🛠️ Prerequisites

- Node.js (v16 or higher)
- Azure Key Vault access
- Cosmos DB access
- Dynatrace API access

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ahussainbunnings/contracts.git
   cd contracts
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Azure Key Vault**
   - Follow the instructions in [KEYVAULT_SETUP.md](KEYVAULT_SETUP.md)
   - Create the required secrets in your Key Vault

4. **Configure environment**
   ```bash
   cp .env.sample .env.sit
   # Edit .env.sit with your Key Vault URL and configuration
   ```

## 🔧 Configuration

### Required Key Vault Secrets

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `contracts-cosmosdb-sit` | Cosmos DB connection string | `AccountEndpoint=https://...;AccountKey=...;` |
| `cos-dashboard-dynatraceapitoken` | Dynatrace API token | `dt0c01.your-token-here` |

### Environment Variables

```bash
# Azure Key Vault Configuration
KEY_VAULT_URL=https://your-keyvault.vault.azure.net/

# Cosmos DB Configuration
COSMOS_DATABASE=your-database-name
CONTRACT_CONTAINER=contract
CONTRACT_ENTITIES_CONTAINER=contract-entities

# Service Configuration
SERVICE_NAME=dashboard
ENVIRONMENT=SIT

# Dynatrace Configuration
DYNATRACE_URL=https://your-dynatrace-instance.live.dynatrace.com
DYNATRACE_METRICS_URL=https://your-dynatrace-instance.live.dynatrace.com/api/v2/metrics/ingest
DYNATRACE_LOGS_URL=https://your-dynatrace-instance.live.dynatrace.com/api/v2/logs/ingest
```

## 🚀 Usage

### Run Dashboard

```bash
# Run for today's data
npm run start:sit today

# Run for all data
npm run start:sit all

# Run for different environments
npm run start:uat today
npm run start:prod today
```

### Debug Mode

```bash
# Interactive debug mode
npm run debug:sit

# Debug specific contract
npm run debug:sit info 12345

# Search contracts
npm run debug:sit search 12345 contractId
```

## 📁 Project Structure

```
contracts/
├── src/
│   ├── cli/                 # CLI utilities (NEW - Refactored)
│   │   ├── parser.js       # Argument parsing and validation
│   │   └── formatter.js    # Output formatting and colors
│   ├── config/              # Configuration management (NEW)
│   │   └── sections.js     # Section configuration for grouping
│   ├── core/                # Core utilities (NEW)
│   │   └── query-loader.js # Dynamic query loading
│   ├── services/            # Shared business services (NEW)
│   │   ├── index.js        # Service exports
│   │   ├── query-executor.js # Cosmos DB query utilities
│   │   ├── batch-processor.js # Batch processing logic
│   │   ├── logger.js       # Centralized logging
│   │   └── error-handler.js # Error handling utilities
│   ├── connections/         # Database and service connections
│   │   ├── cosmos.js       # Cosmos DB connection with Key Vault
│   │   ├── dynatrace.js    # Dynatrace integration
│   │   └── keyvault.js     # Azure Key Vault client
│   ├── queries/             # Query modules (PRESERVED STRUCTURE)
│   │   ├── today/          # Today's data queries
│   │   ├── overall/        # Historical data queries
│   │   └── debug/          # Debug and investigation tools
│   ├── utils/               # Utility functions (being migrated)
│   │   ├── metricsGenerator.js
│   │   ├── status.js
│   │   └── windows.js
│   ├── index.js             # Main dashboard application (refactored)
│   └── contractdetails.js   # Debug utility
├── test/                    # Test files (NEW)
│   └── batch-processor.test.js # Service tests
├── .env.sample              # Environment template
├── package.json
└── README.md
```

## 🔄 Refactoring Progress

This project has been recently refactored to improve maintainability and testability while preserving all existing business functionality:

### ✅ **Completed:**
- **Modular CLI System**: Clean argument parsing, validation, and formatted output
- **Shared Services Layer**: Reusable query execution, batch processing, and logging utilities
- **Configuration Management**: Centralized section configuration and dynamic query loading
- **Error Handling**: Comprehensive error handling with context and fallbacks
- **Testing Structure**: Basic test framework with service tests

### 🔄 **In Progress:**
- **Query Migration**: Incremental migration of query files to use shared services
- **Utility Migration**: Moving legacy utilities to the services layer

### 📋 **Enhanced Usage:**

```bash
# Show help (NEW)
node src/index.js --help

# Run with layout options (NEW)
node src/index.js today --layout flat
node src/index.js all overall --layout sectioned

# Run with custom grouping (NEW)
node src/index.js today --sections status,country --color always

# Traditional usage (still supported)
node src/index.js today
node src/index.js all overall
```

### 🧪 **Testing:**

```bash
# Run service tests
node test/batch-processor.test.js
```

## 🔐 Security

- **No sensitive credentials** stored in code or environment files
- **Azure Key Vault** for secure credential management
- **Audit logging** for all secret access
- **Automatic credential rotation** support
- **Environment-specific** configurations

## 📈 Metrics

The dashboard generates comprehensive metrics for Dynatrace:

- `custom.dashboard.contractreceived.today.by_status`
- `custom.dashboard.contractprocessed.today.by_status`
- `custom.dashboard.contractfailed.today`

Each metric includes labels for:
- Status (successfully_received, completed, failed, etc.)
- Contract status (draft, pending, reviewed, approved, etc.)
- Country (au, nz, total)
- Window (today, overall, week, month)
- Environment (sit, uat, prod)

## 🐛 Debugging

### Interactive Mode
```bash
npm run debug:sit
# Follow the prompts to investigate contracts
```

### Command Line Mode
```bash
# Get contract information
npm run debug:sit info <contract-id>

# Search contracts
npm run debug:sit search <search-term> <search-type>
```

## 📚 Documentation

- [Key Vault Setup](KEYVAULT_SETUP.md) - Detailed Azure Key Vault configuration
- [Contract Details](CONTRACT_DETAILS.md) - Contract investigation tools

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is private and proprietary.

## 🆘 Support

For issues and questions:
1. Check the documentation
2. Review the logs
3. Contact the development team

---

**Note**: This dashboard requires proper Azure Key Vault setup and access to Cosmos DB and Dynatrace services. Ensure all prerequisites are met before running.
