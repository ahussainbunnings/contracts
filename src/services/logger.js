// src/services/logger.js
/**
 * Centralized logging utilities
 */

/**
 * Create a logger with a consistent prefix
 * @param {string} moduleName - Name of the module
 * @returns {object} Logger with standard methods
 */
export function createLogger(moduleName) {
  const prefix = `[${moduleName.toUpperCase()}]`;
  
  return {
    info: (message) => console.log(`ℹ️ ${prefix} ${message}`),
    success: (message) => console.log(`✅ ${prefix} ${message}`),
    warn: (message) => console.warn(`⚠️ ${prefix} ${message}`),
    error: (message) => console.error(`❌ ${prefix} ${message}`),
    debug: (message) => console.log(`🔍 ${prefix} ${message}`),
    
    // Time window logging
    timeWindow: (message, timeWindow) => {
      console.log(`🕐 ${prefix} ${message}: ${timeWindow.startSec} to ${timeWindow.endSec}`);
    },
    
    // Progress logging
    progress: (current, total, description = "") => {
      const progress = total > 0 ? `(${current}/${total})` : `(${current})`;
      console.log(`⏳ ${prefix} ${description} ${progress}`);
    },
    
    // Results logging
    results: (count, description = "results") => {
      console.log(`📊 ${prefix} Found ${count} ${description}`);
    }
  };
}

/**
 * Log query execution start
 * @param {string} queryName - Name of the query
 * @param {object} timeWindow - Time window object
 */
export function logQueryStart(queryName, timeWindow) {
  console.log(`🔍 [${queryName.toUpperCase()}] Starting query for time window: ${timeWindow.startSec} to ${timeWindow.endSec}`);
}

/**
 * Log query execution completion
 * @param {string} queryName - Name of the query
 * @param {number} resultCount - Number of results
 */
export function logQueryComplete(queryName, resultCount) {
  console.log(`✅ [${queryName.toUpperCase()}] Query completed: ${resultCount} results`);
}

/**
 * Log error with context
 * @param {string} context - Context where error occurred
 * @param {Error} error - Error object
 */
export function logError(context, error) {
  console.error(`❌ [${context.toUpperCase()}] Error: ${error.message}`);
  if (error.stack) {
    console.error(`📋 [${context.toUpperCase()}] Stack trace: ${error.stack}`);
  }
}
