// src/queries/overall/overallreceived.js
// All contract received queries for overall

import { generateCumulativeMetricsFromData } from "../../utils/metricsGenerator.js";
import { mapEntityStatusToReadable } from "../../utils/status.js";

export const queries = [
    {
        name: "contractreceived_overall",
        metricBase: "custom.dashboard.contractreceived.overall.by_status",
        run: async (containers, win) => {
            console.log(`🔍 [CONTRACTRECEIVED-OVERALL] Starting query for time window: ${win.startSec} to ${win.endSec}`);
            
            const entitiesC = containers.contractEntities;
            const contractC = containers.contract;

            // Step 1: Query contract table for upload documents in time window
            const qUploadDocs = {
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
                    { name: "@endSec", value: win.endSec }
                ]
            };
            
            console.log(`🔍 [CONTRACTRECEIVED-OVERALL] Querying contract table for upload documents...`);
            const { resources: uploadDocs } = await contractC.items.query(qUploadDocs).fetchAll();
            console.log(`✅ [CONTRACTRECEIVED-OVERALL] Found ${uploadDocs?.length || 0} upload documents in time window`);

            if (!uploadDocs || uploadDocs.length === 0) {
                console.log(`⚠️ [CONTRACTRECEIVED-OVERALL] No upload documents found, returning zero metrics`);
                return generateCumulativeMetricsFromData(new Map(), "overall");
            }

            // Step 2: Get batchIds to lookup entity data
            const batchIds = uploadDocs.map(doc => doc.batchId);
            console.log(`🔍 [CONTRACTRECEIVED-OVERALL] Processing ${batchIds.length} batchIds for received analysis...`);
            
            const entityData = new Map(); // batchId -> entity data
            
            // Process in chunks to avoid query size limits
            const chunkSize = 10;
            for (let i = 0; i < batchIds.length; i += chunkSize) {
                const chunk = batchIds.slice(i, i + chunkSize);
                console.log(`🔍 [CONTRACTRECEIVED-OVERALL] Looking up entity data for chunk ${Math.floor(i/chunkSize) + 1}...`);
                
                // Query entity data using batchId as partitionKey
                const qEntityData = {
                    query: `
                        SELECT e.partitionKey,
                               e.header.metadata.contractId,
                               e.header.metadata.contractStatus AS contractStatus,
                               e.header.metadata.countryCode AS countryCode,
                               e.header.subDomain
                        FROM e
                        WHERE e.partitionKey IN (${chunk.map((_, idx) => `@batchId${idx}`).join(', ')})
                    `,
                    parameters: chunk.map((batchId, idx) => ({ name: `@batchId${idx}`, value: batchId }))
                };
                
                try {
                    const { resources: entityChunk } = await entitiesC.items.query(qEntityData).fetchAll();
                    
                    entityChunk.forEach(entity => {
                        const batchId = entity.partitionKey;
                        const contractId = entity.contractId;
                        const contractStatus = entity.contractStatus;
                        const countryCode = entity.countryCode;
                        const subDomain = entity.subDomain;
                        
                        if (!entityData.has(batchId)) {
                            entityData.set(batchId, []);
                        }
                        entityData.get(batchId).push({
                            contractId,
                            contractStatus,
                            countryCode,
                            subDomain
                        });
                    });
                    
                    console.log(`✅ [CONTRACTRECEIVED-OVERALL] Entity data for ${entityChunk.length} entities in chunk ${Math.floor(i/chunkSize) + 1}`);
                } catch (error) {
                    console.error(`❌ [CONTRACTRECEIVED-OVERALL] Error querying entity data for chunk ${Math.floor(i/chunkSize) + 1}:`, error.message);
                }
            }
            
            console.log(`✅ [CONTRACTRECEIVED-OVERALL] Retrieved entity data for ${entityData.size} batches`);
            
            // Step 3: Process contract records and generate metrics
            const metricsData = new Map(); // key -> { count, uniqueContracts }
            
            uploadDocs.forEach(uploadDoc => {
                const batchId = uploadDoc.batchId;
                const status = uploadDoc.status;
                const attempts = uploadDoc.attempts || 0;
                
                const contractData = entityData.get(batchId) || [];
                
                contractData.forEach(contract => {
                    const contractId = contract.contractId;
                    const contractStatus = mapEntityStatusToReadable(contract.contractStatus);
                    const countryCode = contract.countryCode?.toLowerCase() || 'unknown';
                    
                    // Create keys for different combinations
                    const keys = [
                        `successfully_received|${countryCode}|${contractStatus}|0`,
                        `successfully_received|total|${contractStatus}|0`,
                        `successfully_received|${countryCode}|all|0`,
                        `successfully_received|total|all|0`,
                        `successfully_received_unique|${countryCode}|${contractStatus}|0`,
                        `successfully_received_unique|total|${contractStatus}|0`,
                        `successfully_received_unique|${countryCode}|all|0`,
                        `successfully_received_unique|total|all|0`
                    ];
                    
                    for (const key of keys) {
                        if (!metricsData.has(key)) {
                            metricsData.set(key, { count: 0, uniqueContracts: new Set() });
                        }
                        metricsData.get(key).count++;
                        metricsData.get(key).uniqueContracts.add(contractId);
                    }
                });
            });
            
            console.log(`✅ [CONTRACTRECEIVED-OVERALL] Final aggregation has ${metricsData.size} entries`);
            const finalAgg = new Map();
            for (const [key, data] of metricsData) {
                finalAgg.set(key, data.count);
            }
            return generateCumulativeMetricsFromData(finalAgg, "overall");
        }
    },
    {
        name: "contractreceived_subdomains_overall",
        metricBase: "custom.dashboard.contractreceived.overall.subdomains",
        run: async (containers, win) => {
            console.log(`🔍 [CONTRACTRECEIVED-SUBDOMAINS-OVERALL] Starting query for time window: ${win.startSec} to ${win.endSec}`);
            
            const entitiesC = containers.contractEntities;

            // Step 1: Query for unique contractIds in time window
            const qUniqueContractIds = {
                query: `
                    SELECT DISTINCT e.header.metadata.contractId AS contractId,
                                   e.header.metadata.contractStatus AS contractStatus,
                                   e.header.metadata.countryCode AS countryCode,
                                   e.header.subDomain AS subDomain
                    FROM e
                    WHERE e._ts >= @startSec AND e._ts < @endSec
                      AND IS_DEFINED(e.header.metadata.contractId)
                `,
                parameters: [
                    { name: "@startSec", value: win.startSec },
                    { name: "@endSec", value: win.endSec }
                ]
            };
            
            console.log(`🔍 [CONTRACTRECEIVED-SUBDOMAINS-OVERALL] Querying for unique contractIds...`);
            const { resources: uniqueContractIds } = await entitiesC.items.query(qUniqueContractIds).fetchAll();
            console.log(`✅ [CONTRACTRECEIVED-SUBDOMAINS-OVERALL] Found ${uniqueContractIds?.length || 0} unique contractIds in time window`);

            if (!uniqueContractIds || uniqueContractIds.length === 0) {
                console.log(`⚠️ [CONTRACTRECEIVED-SUBDOMAINS-OVERALL] No contractIds found, returning zero metrics`);
                return generateCumulativeMetricsFromData(new Map(), "overall");
            }

            // Step 2: Process unique contract data and generate metrics
            const metricsData = new Map(); // key -> { count, uniqueContracts }
            
            for (const entity of uniqueContractIds) {
                const contractId = entity.contractId;
                const contractStatus = mapEntityStatusToReadable(entity.contractStatus);
                const countryCode = entity.countryCode?.toLowerCase() || 'unknown';
                const subDomain = entity.subDomain;
                
                if (!contractId || !contractStatus) continue;
                
                // Create keys for different combinations
                const keys = [
                    `successfully_received|${countryCode}|${contractStatus}|0`,
                    `successfully_received|total|${contractStatus}|0`,
                    `successfully_received|${countryCode}|all|0`,
                    `successfully_received|total|all|0`,
                    `successfully_received_unique|${countryCode}|${contractStatus}|0`,
                    `successfully_received_unique|total|${contractStatus}|0`,
                    `successfully_received_unique|${countryCode}|all|0`,
                    `successfully_received_unique|total|all|0`
                ];
                
                for (const key of keys) {
                    if (!metricsData.has(key)) {
                        metricsData.set(key, { count: 0, uniqueContracts: new Set() });
                    }
                    metricsData.get(key).count++;
                    metricsData.get(key).uniqueContracts.add(contractId);
                }
            }
            
            console.log(`✅ [CONTRACTRECEIVED-SUBDOMAINS-OVERALL] Generated metrics for ${metricsData.size} combinations`);
            const finalAgg = new Map();
            for (const [key, data] of metricsData) {
                finalAgg.set(key, data.count);
            }
            return generateCumulativeMetricsFromData(finalAgg, "overall");
        }
    }
];
