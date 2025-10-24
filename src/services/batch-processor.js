// src/services/batch-processor.js
/**
 * Shared batch processing utilities
 */

/**
 * Normalize batch ID from different formats
 * @param {string} batchId - Raw batch ID
 * @returns {string} Normalized batch ID
 */
export function normalizeBatchId(batchId) {
  const isStr = v => typeof v === "string";
  
  if (!isStr(batchId)) {
    return "";
  }
  
  // Remove CMP-Contract- prefix if present
  if (batchId.startsWith("CMP-Contract-")) {
    return batchId.substring(13);
  }
  
  return batchId;
}

/**
 * Convert batch ID to entity lookup format
 * @param {string} batchId - Raw batch ID
 * @returns {string} Entity batch ID format
 */
export function toEntityBatchId(batchId) {
  return normalizeBatchId(batchId);
}

/**
 * Filter and clean contract rows, removing invalid batch IDs
 * @param {Array} contractRows - Raw contract rows
 * @param {string} logPrefix - Prefix for log messages
 * @returns {Array} Cleaned contract rows
 */
export function cleanContractRows(contractRows, logPrefix = "") {
  if (!contractRows || contractRows.length === 0) {
    return [];
  }
  
  const cleaned = contractRows.filter((row, index) => {
    if (!row.batchId || typeof row.batchId !== "string") {
      console.warn(`⚠️ ${logPrefix} Skipping row ${index}: invalid batchId (${typeof row.batchId})`);
      return false;
    }
    return true;
  });
  
  const filtered = cleaned.length;
  const original = contractRows.length;
  
  if (filtered !== original) {
    console.log(`🧹 ${logPrefix} Filtered ${original - filtered} invalid rows, kept ${filtered}`);
  }
  
  return cleaned;
}

/**
 * Extract unique batch IDs from contract rows
 * @param {Array} contractRows - Contract rows
 * @param {string} logPrefix - Prefix for log messages
 * @returns {Array} Unique batch IDs
 */
export function extractUniqueBatchIds(contractRows, logPrefix = "") {
  const uniqueBatchIds = [...new Set(
    contractRows
      .map(row => normalizeBatchId(row.batchId))
      .filter(id => id) // remove empty strings
  )];
  
  console.log(`📋 ${logPrefix} Extracted ${uniqueBatchIds.length} unique batch IDs from ${contractRows.length} rows`);
  return uniqueBatchIds;
}

/**
 * Count unique contracts from entity data
 * @param {Map} entityData - Map of batchId -> entity
 * @param {string} logPrefix - Prefix for log messages
 * @returns {number} Count of unique contracts
 */
export function countUniqueContracts(entityData, logPrefix = "") {
  const uniqueContractIds = new Set();
  
  for (const [batchId, entity] of entityData) {
    if (entity && entity.contractId) {
      uniqueContractIds.add(entity.contractId);
    }
  }
  
  const count = uniqueContractIds.size;
  console.log(`📊 ${logPrefix} Found ${count} unique contracts across ${entityData.size} batch records`);
  return count;
}

/**
 * Group entity data by a specific field
 * @param {Map} entityData - Map of batchId -> entity
 * @param {string} groupField - Field to group by (e.g., 'countryCode', 'contractStatus')
 * @param {string} logPrefix - Prefix for log messages
 * @returns {Map} Map of fieldValue -> array of entities
 */
export function groupEntitiesByField(entityData, groupField, logPrefix = "") {
  const groups = new Map();
  
  for (const [batchId, entity] of entityData) {
    if (!entity) continue;
    
    const fieldValue = entity[groupField] || "(unknown)";
    
    if (!groups.has(fieldValue)) {
      groups.set(fieldValue, []);
    }
    
    groups.get(fieldValue).push({ batchId, ...entity });
  }
  
  console.log(`📊 ${logPrefix} Grouped ${entityData.size} entities by '${groupField}' into ${groups.size} groups`);
  return groups;
}
