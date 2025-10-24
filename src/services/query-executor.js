// src/services/query-executor.js
/**
 * Shared query execution utilities for Cosmos DB operations
 */

/**
 * Execute a Cosmos DB query and return results
 * @param {object} container - Cosmos container
 * @param {object} querySpec - Query specification with query and parameters
 * @param {string} logPrefix - Prefix for log messages
 * @returns {Promise<Array>} Query results
 */
export async function executeQuery(container, querySpec, logPrefix = "") {
  try {
    console.log(`🔍 ${logPrefix} Executing query...`);
    const { resources } = await container.items.query(querySpec).fetchAll();
    console.log(`✅ ${logPrefix} Found ${resources?.length || 0} results`);
    return resources || [];
  } catch (error) {
    console.error(`❌ ${logPrefix} Query failed: ${error.message}`);
    throw error;
  }
}

/**
 * Execute a query to get contracts for a time window
 * @param {object} container - Contract container
 * @param {object} timeWindow - Time window with startSec and endSec
 * @param {string} logPrefix - Prefix for log messages
 * @returns {Promise<Array>} Contract results
 */
export async function getContractsInTimeWindow(container, timeWindow, logPrefix = "") {
  const querySpec = {
    query: `
      SELECT s.contractBatchId as batchId,
             s.status,
             s.attempts
      FROM s
      WHERE s._ts >= @startSec AND s._ts < @endSec
        AND CONTAINS(s.id, "Upload")
    `,
    parameters: [
      { name: "@startSec", value: timeWindow.startSec },
      { name: "@endSec", value: timeWindow.endSec }
    ]
  };

  return await executeQuery(container, querySpec, `${logPrefix}[CONTRACT-QUERY]`);
}

/**
 * Process batch IDs in chunks to avoid query size limits
 * @param {Array} batchIds - Array of batch IDs to process
 * @param {Function} processChunk - Function to process each chunk
 * @param {number} chunkSize - Size of each chunk (default: 50)
 * @param {string} logPrefix - Prefix for log messages
 * @returns {Promise<Array>} Combined results from all chunks
 */
export async function processInChunks(batchIds, processChunk, chunkSize = 50, logPrefix = "") {
  const results = [];
  
  for (let i = 0; i < batchIds.length; i += chunkSize) {
    const chunk = batchIds.slice(i, i + chunkSize);
    const chunkNumber = Math.floor(i / chunkSize) + 1;
    const totalChunks = Math.ceil(batchIds.length / chunkSize);
    
    console.log(`🔍 ${logPrefix} Processing chunk ${chunkNumber}/${totalChunks} (${chunk.length} items)...`);
    
    try {
      const chunkResults = await processChunk(chunk, chunkNumber);
      if (Array.isArray(chunkResults)) {
        results.push(...chunkResults);
      } else {
        results.push(chunkResults);
      }
    } catch (error) {
      console.error(`❌ ${logPrefix} Chunk ${chunkNumber} failed: ${error.message}`);
      throw error;
    }
  }
  
  return results;
}

/**
 * Build query parameters for IN clause with chunk of values
 * @param {Array} values - Values for the IN clause
 * @param {string} paramPrefix - Prefix for parameter names (default: "param")
 * @returns {object} Object with placeholders array and parameters array
 */
export function buildInClauseParams(values, paramPrefix = "param") {
  const placeholders = [];
  const parameters = [];
  
  for (let i = 0; i < values.length; i++) {
    const paramName = `@${paramPrefix}${i}`;
    placeholders.push(paramName);
    parameters.push({ name: paramName, value: values[i] });
  }
  
  return { placeholders, parameters };
}

/**
 * Get entity data for batch IDs
 * @param {object} entitiesContainer - Entities container
 * @param {Array} batchIds - Array of batch IDs
 * @param {string} logPrefix - Prefix for log messages
 * @returns {Promise<Map>} Map of batchId -> entity data
 */
export async function getEntityDataForBatchIds(entitiesContainer, batchIds, logPrefix = "") {
  const entityData = new Map();
  
  if (!batchIds || batchIds.length === 0) {
    console.log(`⚠️ ${logPrefix} No batch IDs provided for entity lookup`);
    return entityData;
  }
  
  const processChunk = async (chunk) => {
    const { placeholders, parameters } = buildInClauseParams(chunk, "batchId");
    
    const querySpec = {
      query: `
        SELECT c.header.metadata.countryCode AS countryCode,
               c.header.metadata.contractStatus AS contractStatus,
               c.header.metadata.contractId AS contractId,
               c.header.metadata.splitEntityCorrelationId AS batchId
        FROM c
        WHERE c.header.metadata.splitEntityCorrelationId IN (${placeholders.join(',')})
          AND c.header.subDomain = "Contract"
      `,
      parameters: parameters
    };
    
    const entities = await executeQuery(entitiesContainer, querySpec, `${logPrefix}[ENTITY-LOOKUP]`);
    
    // Add entities to the map
    for (const entity of entities) {
      if (entity.batchId) {
        entityData.set(entity.batchId, entity);
      }
    }
    
    return entities;
  };
  
  await processInChunks(batchIds, processChunk, 50, logPrefix);
  
  console.log(`✅ ${logPrefix}[ENTITY-LOOKUP] Collected ${entityData.size} entity records`);
  return entityData;
}
