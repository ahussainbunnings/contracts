# Refactoring Migration Guide

This document outlines the ongoing migration of the contracts dashboard from a monolithic structure to a modular, maintainable architecture.

## ✅ Phase 1: Foundation (COMPLETED)

### CLI & Configuration
- ✅ Created modular CLI argument parsing (`src/cli/parser.js`)
- ✅ Implemented output formatting with color support (`src/cli/formatter.js`)
- ✅ Added section configuration management (`src/config/sections.js`)
- ✅ Built dynamic query loader (`src/core/query-loader.js`)

### Services Layer
- ✅ Created query execution utilities (`src/services/query-executor.js`)
- ✅ Implemented batch processing logic (`src/services/batch-processor.js`)
- ✅ Added centralized logging (`src/services/logger.js`)
- ✅ Built error handling framework (`src/services/error-handler.js`)
- ✅ Created service index for easy imports (`src/services/index.js`)

### Testing & Documentation
- ✅ Added basic test framework and service tests
- ✅ Updated project documentation
- ✅ Created VS Code tasks for development

## 🔄 Phase 2: Query Migration (IN PROGRESS)

### Next Steps

1. **Migrate `todayreceived.js`**
   - Extract shared Cosmos query logic
   - Use new batch processing utilities
   - Implement centralized logging
   - Test with existing business logic

2. **Migrate `todayprocessed.js`**
   - Reuse query patterns from first migration
   - Standardize entity lookup logic
   - Apply error handling patterns

3. **Migrate `todayfailed.js`**
   - Apply consistent patterns
   - Validate error handling improvements

### Migration Pattern

For each query file:

1. **Import services:**
   ```javascript
   import { 
     getContractsInTimeWindow,
     getEntityDataForBatchIds,
     extractUniqueBatchIds,
     createLogger 
   } from '../../services/index.js';
   ```

2. **Replace logging:**
   ```javascript
   // Before
   console.log(`🔍 [CONTRACTRECEIVED-TODAY] Starting query...`);
   
   // After
   const logger = createLogger('CONTRACTRECEIVED-TODAY');
   logger.timeWindow('Starting query', timeWindow);
   ```

3. **Use shared query utilities:**
   ```javascript
   // Before
   const qUploadDocs = { /* query spec */ };
   const { resources: contractRows } = await contractC.items.query(qUploadDocs).fetchAll();
   
   // After
   const contractRows = await getContractsInTimeWindow(containers.contract, timeWindow, 'CONTRACTRECEIVED');
   ```

4. **Use batch processing:**
   ```javascript
   // Before
   const batchIds = [...new Set(contractRows.map(r => r.batchId).filter(id => id))];
   
   // After
   const batchIds = extractUniqueBatchIds(contractRows, 'CONTRACTRECEIVED');
   ```

## 📋 Phase 3: Utility Migration (PLANNED)

### Files to Migrate
- `src/utils/metricsGenerator.js` → `src/services/metrics-generator.js`
- `src/utils/status.js` → `src/services/status-mapper.js`
- `src/utils/dashboardSummary.js` → `src/services/summary-service.js`
- `src/utils/superCleanDisplay.js` → integrate with `src/cli/formatter.js`
- `src/utils/windows.js` → `src/services/time-window.js`

### Migration Benefits
- **Consistency**: All utilities follow same patterns
- **Testability**: Services can be unit tested
- **Reusability**: Shared logic across query modules
- **Maintainability**: Clear separation of concerns

## 🧪 Phase 4: Enhanced Testing (PLANNED)

### Test Coverage Goals
- **Service Tests**: 100% coverage of services layer
- **Integration Tests**: End-to-end query execution
- **CLI Tests**: Argument parsing and formatting
- **Error Handling Tests**: Various failure scenarios

### Test Structure
```
test/
├── services/
│   ├── query-executor.test.js
│   ├── batch-processor.test.js
│   ├── logger.test.js
│   └── error-handler.test.js
├── cli/
│   ├── parser.test.js
│   └── formatter.test.js
├── integration/
│   └── query-flow.test.js
└── helpers/
    └── test-data.js
```

## 📊 Progress Tracking

### Metrics
- **Files Refactored**: 6/20 (30%)
- **Services Created**: 4/4 (100%)
- **Tests Added**: 1/8 (12.5%)
- **Documentation Updated**: 2/3 (67%)

### Key Success Indicators
- ✅ Existing functionality preserved
- ✅ Code complexity reduced
- ✅ Error handling improved
- ✅ Logging standardized
- 🔄 Test coverage increasing
- 📋 Performance maintained

## 🚨 Migration Rules

### Do NOT Change
- **Query folder structure** (`today/`, `overall/`, `debug/`)
- **Business logic outcomes**
- **Metrics format or naming**
- **Dynatrace integration**
- **Environment variable requirements**

### DO Change
- **Code duplication** → shared services
- **Inconsistent logging** → centralized logger
- **Manual error handling** → error service
- **Hardcoded configurations** → config management
- **Monolithic functions** → modular services

## 🔍 Testing Strategy

### Before Each Migration
1. **Run existing tests**: Ensure current functionality works
2. **Document behavior**: Record expected outcomes
3. **Create test data**: Sample inputs and outputs

### During Migration
1. **Preserve interfaces**: Maintain same function signatures
2. **Add logging**: Use centralized logger
3. **Handle errors**: Apply error handling patterns
4. **Test incrementally**: Verify each change

### After Migration
1. **Run integration tests**: Verify end-to-end functionality
2. **Performance check**: Ensure no degradation
3. **Update documentation**: Reflect changes
4. **Code review**: Ensure quality standards

## 📞 Support

For questions about the migration:
1. Check this guide first
2. Review service documentation
3. Run existing tests to verify behavior
4. Contact the development team

---

**Note**: This migration preserves all existing business functionality while improving code quality, testability, and maintainability.
