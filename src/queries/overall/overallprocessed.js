// src/queries/overall/overallprocessed.js
// All contract processed queries for overall

import { generateProcessedCumulativeMetricsFromData } from "../../utils/metricsGenerator.js";
import { normalizeStatus, mapEntityStatusToReadable } from "../../utils/status.js";

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
                           c.attempts
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

            // Step 4: Process entity data and generate metrics
            const metricsData = new Map(); // key -> { count, uniqueContracts }
            
            for (const [batchId, entities] of entityData) {
                for (const entity of entities) {
                    const contractId = entity.contractId;
                    const contractStatus = entity.contractStatus;
                    const countryCode = entity.countryCode;
                    const subDomain = entity.subDomain;
                    
                    if (!contractId || !contractStatus) continue;
                    
                    const status = mapEntityStatusToReadable(contractStatus);
                    const country = countryCode?.toLowerCase() || 'unknown';
                    
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
            }
            
            console.log(`✅ [CONTRACTPROCESSED-OVERALL] Generated metrics for ${metricsData.size} combinations`);
            return generateProcessedCumulativeMetricsFromData(metricsData, "overall");
        }
    }
];
