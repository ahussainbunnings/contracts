// src/services/error-handler.js
/**
 * Centralized error handling utilities
 */

import { logError } from "./logger.js";

/**
 * Error types for better error categorization
 */
export const ErrorTypes = {
  CONNECTION: 'CONNECTION',
  QUERY: 'QUERY', 
  VALIDATION: 'VALIDATION',
  CONFIGURATION: 'CONFIGURATION',
  EXTERNAL_SERVICE: 'EXTERNAL_SERVICE'
};

/**
 * Custom error class with context
 */
export class ContextualError extends Error {
  constructor(message, type = ErrorTypes.QUERY, context = {}) {
    super(message);
    this.name = 'ContextualError';
    this.type = type;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Wrap async functions with error handling
 * @param {Function} fn - Async function to wrap
 * @param {string} context - Context description
 * @param {string} errorType - Type of error expected
 * @returns {Function} Wrapped function
 */
export function withErrorHandling(fn, context, errorType = ErrorTypes.QUERY) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(context, error);
      
      if (error instanceof ContextualError) {
        throw error;
      }
      
      throw new ContextualError(
        `${context} failed: ${error.message}`,
        errorType,
        { originalError: error }
      );
    }
  };
}

/**
 * Handle errors gracefully with fallback values
 * @param {Function} fn - Function to execute
 * @param {*} fallback - Fallback value on error
 * @param {string} context - Context description
 * @returns {Promise<*>} Result or fallback value
 */
export async function handleWithFallback(fn, fallback, context) {
  try {
    return await fn();
  } catch (error) {
    logError(context, error);
    console.warn(`⚠️ [${context.toUpperCase()}] Using fallback value due to error`);
    return fallback;
  }
}

/**
 * Validate required environment variables
 * @param {Array<string>} requiredVars - Array of required environment variable names
 * @throws {ContextualError} If any required variables are missing
 */
export function validateEnvironment(requiredVars) {
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new ContextualError(
      `Missing required environment variables: ${missing.join(', ')}`,
      ErrorTypes.CONFIGURATION,
      { missingVars: missing }
    );
  }
}

/**
 * Create a safe query executor that handles common query errors
 * @param {object} container - Cosmos container
 * @param {string} context - Context for error messages
 * @returns {Function} Safe query executor
 */
export function createSafeQueryExecutor(container, context) {
  return withErrorHandling(
    async (querySpec) => {
      const { resources } = await container.items.query(querySpec).fetchAll();
      return resources || [];
    },
    `${context}_QUERY`,
    ErrorTypes.QUERY
  );
}
