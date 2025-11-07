// src/queries/overall/overallprocessed.js
// All contract processed queries for overall

import { generateProcessedCumulativeMetricsFromData } from "../../utils/metricsGenerator.js";
import { mapEntityStatusToReadable } from "../../utils/status.js";

export const queries = [
    {
        name: "contractprocessed_overall_by_status",
        metricBase: "custom.dashboard.contractprocessed.overall.by_status",
        run: async (containers, win) => {
            console.log(`🔍 [CONTRACTPROCESSED-OVERALL] Starting query for time window: ${win.startSec} to ${win.endSec}`);
            
            const entitiesC = containers.contractEntities;
            const statusC   = containers.contract;

            // Step 1: Query contract table for documents in time window
            const qContracts = {
                query: `
                    SELECT c.batchId,
                           c.status,
                           c.attempts,
                           c._ts as timestamp
                    FROM c
                    WHERE c._ts >= @startSec AND c._ts < @endSec
                      AND CONTAINS(c.id, "Upload")
                `,
                parameters: [
                    { name: "@startSec", value: win.startSec },
                    { name: "@endSec",   value: win.endSec }
                ]
            };
            
            console.log(`🔍 [CONTRACTPROCESSED-OVERALL] Querying contract table for documents in time window...`);
            const { resources: contractRows } = await statusC.items.query(qContracts).fetchAll();
            console.log(`✅ [CONTRACTPROCESSED-OVERALL] Found ${contractRows?.length || 0} contracts in time window`);
            
            if (!contractRows || contractRows.length === 0) {
                console.log(`⚠️ [CONTRACTPROCESSED-OVERALL] No contracts found, returning zero metrics`);
                return generateProcessedCumulativeMetricsFromData(new Map(), "overall");
            }

            // Step 2: Get batchIds to lookup entity data (remove "CMP-Contract-" prefix)
            const batchIds = contractRows.map(doc => {
                const batchId = doc.batchId;
                return batchId;
            });
            console.log(`🔍 [CONTRACTPROCESSED-OVERALL] Processing ${batchIds.length} batchIds for processed analysis...`);
            
            const entityData = new Map(); // batchId -> entity data
            
            // Step 3: Query entities for each batchId
            for (const batchId of batchIds) {
                try {
                    const qEntities = {
                        query: `
                            SELECT e.header.metadata.contractId AS contractId,
                                   e.header.metadata.contractStatus AS contractStatus,
                                   e.header.metadata.countryCode AS countryCode,
                                   e.header.subDomain AS subDomain
                            FROM e
                            WHERE e.partitionKey = @batchId
                        `,
                        parameters: [{ name: "@batchId", value: batchId }]
                    };
                    
                    const { resources: entities } = await entitiesC.items.query(qEntities).fetchAll();
                    
                    if (entities && entities.length > 0) {
                        entityData.set(batchId, entities);
                    }
                } catch (error) {
                    console.warn(`⚠️ [CONTRACTPROCESSED-OVERALL] Error querying entities for batchId ${batchId}:`, error.message);
                }
            }
            
            console.log(`✅ [CONTRACTPROCESSED-OVERALL] Retrieved entity data for ${entityData.size} batches`);

            // Step 4: Build a map of contractId -> most recent contract document
            console.log(`🔍 [CONTRACTPROCESSED-OVERALL] Finding most recent upload for each contract...`);
            const latestContractByContractId = new Map(); // contractId -> { contractRow, entity }
            
            for (const contractRow of contractRows) {
                const batchId = contractRow.batchId;
                const entities = entityData.get(batchId) || [];
                
                for (const entity of entities) {
                    const contractId = entity.contractId;
                    if (!contractId) continue;
                    
                    const existing = latestContractByContractId.get(contractId);
                    
                    // Keep the contract with the latest timestamp
                    if (!existing || contractRow.timestamp > existing.contractRow.timestamp) {
                        latestContractByContractId.set(contractId, { contractRow, entity });
                        if (existing) {
                            console.log(`🔄 [CONTRACTPROCESSED-OVERALL] Replaced older upload for contract ${contractId} (old ts: ${existing.contractRow.timestamp}, new ts: ${contractRow.timestamp})`);
                        }
                    } else {
                        console.log(`⏭️ [CONTRACTPROCESSED-OVERALL] Skipping older upload for contract ${contractId} (current ts: ${contractRow.timestamp} <= latest ts: ${existing.contractRow.timestamp})`);
                    }
                }
            }
            
            console.log(`✅ [CONTRACTPROCESSED-OVERALL] Found ${latestContractByContractId.size} unique contracts with their latest uploads`);

            // Step 4.5: Query integration status for all unique contracts to exclude those with errors
            const contractIds = Array.from(latestContractByContractId.keys());
            const integrationStatusMap = new Map(); // contractId -> integrationStatus
            
            if (contractIds.length > 0) {
                console.log(`🔍 [CONTRACTPROCESSED-OVERALL] Checking integration status for ${contractIds.length} contracts...`);
                
                // Process in chunks to avoid query size limits
                const chunkSize = 50;
                for (let i = 0; i < contractIds.length; i += chunkSize) {
                    const chunk = contractIds.slice(i, i + chunkSize);
                    
                    const parameters = [];
                    const placeholders = [];
                    for (let j = 0; j < chunk.length; j++) {
                        placeholders.push(`@contractId${j}`);
                        parameters.push({ name: `@contractId${j}`, value: chunk[j] });
                    }
                    
                    const integrationQuery = {
                        query: `
                            SELECT c.contractId, c.integrationStatus
                            FROM c
                            WHERE c.documentType = "ContractCosmosDataModel"
                              AND c.contractId IN (${placeholders.join(',')})
                            ORDER BY c._ts DESC
                        `,
                        parameters: parameters
                    };
                    
                    const { resources: integrationResults } = await statusC.items.query(integrationQuery).fetchAll();
                    
                    // Keep only the most recent integration status for each contract
                    for (const result of (integrationResults || [])) {
                        if (result.contractId && !integrationStatusMap.has(result.contractId)) {
                            integrationStatusMap.set(result.contractId, result.integrationStatus || 'Unknown');
                        }
                    }
                }
                
                console.log(`✅ [CONTRACTPROCESSED-OVERALL] Found integration status for ${integrationStatusMap.size} contracts`);
            }

            // Step 5: Process only the latest contracts and generate metrics
            const metricsData = new Map(); // key -> { count, uniqueContracts }
            
            for (const [contractId, { contractRow, entity }] of latestContractByContractId) {
                const contractStatus = entity.contractStatus;
                const countryCode = entity.countryCode;
                const subDomain = entity.subDomain;
                
                if (!contractId || !contractStatus) continue;
                
                const status = mapEntityStatusToReadable(contractStatus);
                const country = countryCode?.toLowerCase() || 'unknown';
                
                // Check integration status - exclude contracts with errors from "completed" count
                const integrationStatus = integrationStatusMap.get(contractId) || 'Unknown';
                const hasErrors = integrationStatus === 'Completed With Errors';
                
                console.log(`📊 [CONTRACTPROCESSED-OVERALL] Processing latest upload for contract ${contractId}: batchId=${contractRow.batchId} -> status=${status}, country=${country}, timestamp=${contractRow.timestamp}, integrationStatus=${integrationStatus}`);
                
                // Skip contracts with "Completed With Errors" - they should only be counted in integration status metrics
                if (hasErrors) {
                    console.log(`⚠️ [CONTRACTPROCESSED-OVERALL] Skipping contract ${contractId} - has integration errors (will be counted in integration status metrics only)`);
                    continue;
                }
                
                // Create keys for different combinations
                const keys = [
                    `completed,${status},${country}`,
                    `completed,${status},total`,
                    `completed,all,${country}`,
                    `completed,all,total`,
                    `completed_unique,${status},${country}`,
                    `completed_unique,${status},total`,
                    `completed_unique,all,${country}`,
                    `completed_unique,all,total`
                ];
                
                for (const key of keys) {
                    if (!metricsData.has(key)) {
                        metricsData.set(key, { count: 0, uniqueContracts: new Set() });
                    }
                    metricsData.get(key).count++;
                    metricsData.get(key).uniqueContracts.add(contractId);
                }
            }
            
            console.log(`✅ [CONTRACTPROCESSED-OVERALL] Generated metrics for ${metricsData.size} combinations`);
            return generateProcessedCumulativeMetricsFromData(metricsData, "overall");
        }
    }
];
