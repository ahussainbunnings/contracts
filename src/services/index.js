// src/services/index.js
/**
 * Services layer exports
 */

// Query execution utilities
export {
    buildInClauseParams, executeQuery,
    getContractsInTimeWindow, getEntityDataForBatchIds, processInChunks
} from './query-executor.js';

// Batch processing utilities
export {
    cleanContractRows, countUniqueContracts, extractUniqueBatchIds, groupEntitiesByField, normalizeBatchId,
    toEntityBatchId
} from './batch-processor.js';

// Logging utilities
export {
    createLogger, logError, logQueryComplete, logQueryStart
} from './logger.js';

// Error handling utilities
export {
    ContextualError, ErrorTypes, createSafeQueryExecutor, handleWithFallback,
    validateEnvironment, withErrorHandling
} from './error-handler.js';

