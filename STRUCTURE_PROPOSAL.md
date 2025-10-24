# Proposed Project Structure Improvements

## 🏗️ Current Issues

1. **Monolithic index.js** - Too much responsibility in one file
2. **Mixed concerns** - CLI logic mixed with business logic
3. **Configuration scattered** - Environment handling not centralized
4. **No proper error handling** - Missing centralized error management
5. **Testing structure** - No test organization
6. **Types/Validation** - No schema validation for API responses

## 🎯 Proposed Structure

```
contracts/
├── README.md
├── package.json
├── .env.example
├── .gitignore
├── docs/                           # 📚 Documentation
│   ├── api.md
│   ├── deployment.md
│   └── troubleshooting.md
├── scripts/                        # 🔧 Build/deployment scripts
│   ├── deploy.sh
│   └── setup.sh
├── tests/                          # 🧪 Test files
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── src/
│   ├── cli/                        # 🖥️ CLI interface
│   │   ├── index.js               # Main CLI entry point
│   │   ├── commands/              # Command handlers
│   │   │   ├── dashboard.js
│   │   │   ├── debug.js
│   │   │   └── health.js
│   │   └── parser.js              # Argument parsing
│   ├── config/                    # ⚙️ Configuration
│   │   ├── index.js              # Main config loader
│   │   ├── environments.js       # Environment-specific configs
│   │   └── validation.js         # Config validation
│   ├── core/                      # 🏗️ Core business logic
│   │   ├── services/             # Business services
│   │   │   ├── ContractService.js
│   │   │   ├── MetricsService.js
│   │   │   └── ReportingService.js
│   │   ├── models/               # Data models
│   │   │   ├── Contract.js
│   │   │   ├── Metric.js
│   │   │   └── ProcessingResult.js
│   │   └── repositories/         # Data access layer
│   │       ├── ContractRepository.js
│   │       └── MetricsRepository.js
│   ├── infrastructure/            # 🔌 External integrations
│   │   ├── cosmos/
│   │   │   ├── client.js
│   │   │   └── queries.js
│   │   ├── dynatrace/
│   │   │   ├── client.js
│   │   │   └── formatter.js
│   │   └── keyvault/
│   │       ├── client.js
│   │       └── secrets.js
│   ├── queries/                   # 📊 Query definitions (KEEP CURRENT STRUCTURE)
│   │   ├── today/               # Today's metrics (business view)
│   │   │   ├── todayreceived.js
│   │   │   ├── todayprocessed.js
│   │   │   └── todayfailed.js
│   │   ├── overall/             # Overall/historical metrics  
│   │   │   ├── overallreceived.js
│   │   │   ├── overallprocessed.js
│   │   │   └── overallfailed.js
│   │   └── debug/               # Debug/investigation queries
│   │       ├── contractinfo.js
│   │       └── contractsearch.js
│   ├── utils/                     # 🛠️ Utilities
│   │   ├── logger.js
│   │   ├── formatters.js
│   │   ├── time.js
│   │   └── validation.js
│   └── middleware/                # 🔄 Cross-cutting concerns
│       ├── error-handler.js
│       ├── metrics-middleware.js
│       └── logging-middleware.js
└── dist/                          # 📦 Built files (if needed)
```

## 🔧 Key Improvements

### 1. **Keep Current Query Structure** 

✅ **The existing query organization is actually excellent and should be preserved:**

```
queries/
├── today/          # Today's business metrics
├── overall/        # Historical/cumulative metrics  
└── debug/          # Investigation tools
```

**Why this structure works well:**
- **Business alignment** - Users naturally think in time windows
- **Clear separation** - Today vs historical vs debug concerns  
- **Easy navigation** - Developers can quickly find relevant queries
- **Logical grouping** - Related functionality stays together

### 2. **Separation of Concerns**
- CLI logic separated from business logic
- Clear layers: CLI → Services → Repositories → Infrastructure
- Feature-based organization instead of time-based

### 2. **Configuration Management**
```javascript
// src/config/index.js
export class Config {
  static load(env = process.env.NODE_ENV) {
    return {
      cosmos: {
        endpoint: process.env.COSMOS_ENDPOINT,
        database: process.env.COSMOS_DATABASE,
        // ...
      },
      dynatrace: {
        token: process.env.DYNATRACE_TOKEN,
        // ...
      }
    };
  }
}
```

### 3. **Service Layer Pattern**
```javascript
// src/core/services/ContractService.js
export class ContractService {
  constructor(contractRepo, metricsService) {
    this.contractRepo = contractRepo;
    this.metricsService = metricsService;
  }

  async getReceivedContracts(timeWindow) {
    const contracts = await this.contractRepo.findReceived(timeWindow);
    return this.processUniqueContracts(contracts);
  }

  processUniqueContracts(contracts) {
    // Centralized unique contract logic
  }
}
```

### 4. **Repository Pattern**
```javascript
// src/core/repositories/ContractRepository.js
export class ContractRepository {
  constructor(cosmosClient) {
    this.cosmos = cosmosClient;
  }

  async findReceived(timeWindow) {
    // Cosmos DB query logic
  }

  async findProcessed(timeWindow) {
    // Cosmos DB query logic
  }
}
```

### 5. **Command Pattern for CLI**
```javascript
// src/cli/commands/dashboard.js
export class DashboardCommand {
  constructor(contractService, metricsService) {
    this.contractService = contractService;
    this.metricsService = metricsService;
  }

  async execute(options) {
    const contracts = await this.contractService.getReceivedContracts(options.timeWindow);
    const metrics = await this.metricsService.generateMetrics(contracts);
    return this.formatOutput(metrics, options);
  }
}
```

### 6. **Error Handling**
```javascript
// src/middleware/error-handler.js
export class ErrorHandler {
  static handle(error, context) {
    // Centralized error logging and handling
  }
}
```

### 7. **Testing Structure**
```
tests/
├── unit/
│   ├── services/
│   ├── repositories/
│   └── utils/
├── integration/
│   ├── cosmos/
│   └── dynatrace/
└── fixtures/
    ├── contracts.json
    └── metrics.json
```

## 📋 Migration Plan

### Phase 1: Infrastructure
1. Create new folder structure
2. Move connection logic to infrastructure layer
3. Create configuration management

### Phase 2: Core Logic
1. Extract business logic into services
2. Create repository layer
3. Implement models

### Phase 3: CLI Refactor
1. Separate CLI from business logic
2. Implement command pattern
3. Add proper error handling

### Phase 4: Testing & Documentation
1. Add comprehensive tests
2. Update documentation
3. Add deployment scripts

## 🎯 Benefits

1. **Maintainability** - Clear separation of concerns
2. **Testability** - Each layer can be tested independently
3. **Scalability** - Easy to add new features
4. **Readability** - Code organization follows business logic
5. **Reusability** - Services can be used by multiple interfaces
6. **Error Handling** - Centralized error management
7. **Configuration** - Environment-specific configs

## 🔄 Backwards Compatibility

The migration can be done incrementally:
1. Keep existing structure working
2. Gradually move functionality to new structure
3. Update imports progressively
4. Remove old structure once migration is complete

## ✅ Implementation Status (Updated)

### Phase 1: Foundation (COMPLETED ✅)

**CLI & Configuration:**
- ✅ `src/cli/parser.js` - Clean argument parsing with validation and help system
- ✅ `src/cli/formatter.js` - Output formatting with color support and individual functions
- ✅ `src/config/sections.js` - Section configuration for result grouping
- ✅ `src/core/query-loader.js` - Dynamic query loading utility

**Services Layer:**
- ✅ `src/services/query-executor.js` - Cosmos DB query utilities with chunked processing
- ✅ `src/services/batch-processor.js` - Batch ID normalization and processing logic
- ✅ `src/services/logger.js` - Centralized logging with consistent formatting
- ✅ `src/services/error-handler.js` - Error handling with context and fallbacks
- ✅ `src/services/index.js` - Service exports for easy importing

**Infrastructure:**
- ✅ `test/batch-processor.test.js` - Service tests (6/6 passing)
- ✅ `.vscode/tasks.json` - Development tasks for common operations
- ✅ Enhanced documentation (README.md, MIGRATION_GUIDE.md)
- ✅ Refactored `src/index.js` with new architecture

**Key Achievements:**
- 🎯 **Preserved business query structure** - `today/`, `overall/`, `debug/` folders maintained
- 🧪 **Testable services** - Comprehensive service layer with unit tests
- 🛠️ **Enhanced CLI** - Help system, layout options, color control
- 📝 **Consistent logging** - Standardized logging patterns
- 🔧 **Error handling** - Robust error handling with context
- 📚 **Documentation** - Complete migration guide and updated README

### Phase 2: Query Migration (READY TO START 🔄)

**Recommended Migration Order:**
1. `src/queries/today/todayreceived.js` - First migration target
2. `src/queries/today/todayprocessed.js` - Apply proven patterns  
3. `src/queries/today/todayfailed.js` - Complete today queries

**Migration Benefits Ready to Realize:**
- Eliminate code duplication across query files
- Consistent error handling and logging
- Testable business logic components
- Simplified maintenance and debugging

The foundation is solid and battle-tested. All shared utilities are implemented and proven. Query migration can proceed incrementally with confidence.
