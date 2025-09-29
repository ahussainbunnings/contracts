// src/queries/today/todayprocessed.js
// All contract processed queries for today

import { generateProcessedCumulativeMetricsFromData } from "../../utils/metricsGenerator.js";
import { normalizeStatus, mapEntityStatusToReadable } from "../../utils/status.js";

export const queries = [
    {
        name: "contractprocessed_today_by_status",
        metricBase: "custom.dashboard.contractprocessed.today.by_status",
        run: async (containers, win) => {
            console.log(`🔍 [CONTRACTPROCESSED-TODAY] Starting query for time window: ${win.startSec} to ${win.endSec}`);
            
            const entitiesC = containers.contractEntities;
            const statusC   = containers.contract;

            // Step 1: Query contract table for documents in time window
            const qContracts = {
                query: `
                    SELECT s.batchId,
                           s.status,
                           s.attempts
                    FROM s
                    WHERE s._ts >= @startSec AND s._ts < @endSec
                      AND CONTAINS(s.id, "Upload")
                `,
                parameters: [
                    { name: "@startSec", value: win.startSec },
                    { name: "@endSec",   value: win.endSec }
                ]
            };
            
            console.log(`🔍 [CONTRACTPROCESSED-TODAY] Querying contract table for documents in time window...`);
            const { resources: contractRows } = await statusC.items.query(qContracts).fetchAll();
            console.log(`✅ [CONTRACTPROCESSED-TODAY] Found ${contractRows?.length || 0} contracts in time window`);
            
            if (!contractRows || contractRows.length === 0) {
                console.log(`⚠️ [CONTRACTPROCESSED-TODAY] No contracts found, returning zero metrics`);
                return generateProcessedCumulativeMetricsFromData(new Map(), "today");
            }

            // Step 2: Get batchIds to lookup entity data (remove "CMP-Contract-" prefix)
            const batchIds = contractRows.map(doc => {
                const batchId = doc.batchId;
                return batchId.startsWith("CMP-Contract-") ? batchId.substring(13) : batchId;
            });
            console.log(`🔍 [CONTRACTPROCESSED-TODAY] Processing ${batchIds.length} batchIds for processed analysis...`);
            
            const entityData = new Map(); // batchId -> entity data
            
            // Process in chunks to avoid query size limits
            const chunkSize = 50;
            for (let i = 0; i < batchIds.length; i += chunkSize) {
                const chunk = batchIds.slice(i, i + chunkSize);
                console.log(`�� [CONTRACTPROCESSED-TODAY] Looking up entity data for chunk ${Math.floor(i/chunkSize) + 1}...`);
                
                // Build parameter array for this chunk
                const parameters = [];
                const placeholders = [];
                for (let j = 0; j < chunk.length; j++) {
                    placeholders.push(`@batchId${j}`);
                    parameters.push({ name: `@batchId${j}`, value: chunk[j] });
                }
                
                const qEntityData = {
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
                
                const { resources: entities } = await entitiesC.items.query(qEntityData).fetchAll();
                
                for (const entity of entities || []) {
                    entityData.set(entity.batchId, entity);
                    console.log(`✅ [CONTRACTPROCESSED-TODAY] Entity data for ${entity.batchId}: country=${entity.countryCode}, status=${entity.contractStatus}, contractId=${entity.contractId}`);
                }
            }

            console.log(`✅ [CONTRACTPROCESSED-TODAY] Entity data lookup complete. Found ${entityData.size} entities`);

            // Step 3: Process contracts and build aggregations
            const agg = new Map(); // key = `${status}|${country}|${cs}|${attempts}`
            const normCountry = (raw) => String(raw || "").toLowerCase().trim();
            const normContractStatus = (raw) => String(raw || "").toLowerCase().trim();
            
            // Track unique contract IDs for "all" metrics
            const uniqueContractIdsByCountry = new Set(); // Set of unique contract IDs by country
            const uniqueContractIdsTotal = new Set(); // Set of unique contract IDs total
            
            console.log(`🔍 [CONTRACTPROCESSED-TODAY] Processing ${contractRows.length} contract records...`);
            
            for (const contractRow of contractRows) {
                const batchId = contractRow.batchId;
                const entityBatchId = batchId.startsWith("CMP-Contract-") ? batchId.substring(13) : batchId;
                const entity = entityData.get(entityBatchId);
                
                if (entity) {
                    const country = normCountry(entity.countryCode || "unk");
                    const cs = normContractStatus(entity.contractStatus || "unk");
                    const contractId = entity.contractId;
                    const attempts = contractRow.attempts || 0;
                    const status = normalizeStatus(contractRow.status);
                    
                    // Contract header exists and upload document exists - Processed
                    const k = `${status}|${country}|${cs}|0`;
                    agg.set(k, (agg.get(k) || 0) + 1);
                    console.log(`📊 [CONTRACTPROCESSED-TODAY] Processed: ${batchId} -> status=${status}, country=${country}, contractStatus=${cs}, attempts=${attempts}`);
                    
                    // Track unique contract IDs for "all" metrics
                    uniqueContractIdsByCountry.add(`${contractId}|${country}`);
                    uniqueContractIdsTotal.add(contractId);
                } else {
                    console.log(`⚠️ [CONTRACTPROCESSED-TODAY] Upload doc exists but no entity data for ${batchId} (entityBatchId: ${entityBatchId})`);
                }
            }

            // Step 4: Add unique contract ID metrics
            console.log(`🔍 [CONTRACTPROCESSED-TODAY] Adding unique contract ID metrics...`);
            
            // Count unique contracts by country for "all" metrics
            const uniqueByCountry = new Map(); // country -> count
            for (const contractCountry of uniqueContractIdsByCountry) {
                const [contractId, country] = contractCountry.split('|');
                uniqueByCountry.set(country, (uniqueByCountry.get(country) || 0) + 1);
            }
            
            // Add "all" metrics for each country
            for (const [country, count] of uniqueByCountry) {
                const allKey = `completed_unique|${country}|all|0`;
                agg.set(allKey, count);
                console.log(`📊 [CONTRACTPROCESSED-TODAY] Unique contracts (all statuses): completed ${country} = ${count} unique contract IDs`);
            }
            
            // Add total "all" metric
            const allTotalKey = `completed_unique|total|all|0`;
            agg.set(allTotalKey, uniqueContractIdsTotal.size);
            console.log(`📊 [CONTRACTPROCESSED-TODAY] Unique contracts (all statuses): completed total = ${uniqueContractIdsTotal.size} unique contract IDs`);

            // Calculate totals for each status/contractstatus combination across all countries
            // BUT EXCLUDE the "all" contract status since we handle it separately above
            const totalAgg = new Map(); // key = `${status}|total|${cs}|${attempts}`
            for (const [key, value] of agg) {
                const [status, country, cs, attempts] = key.split('|');
                // Skip "all" contract status as we handle it separately
                if (cs === 'all') {
                    continue;
                }
                const totalKey = `${status}|total|${cs}|${attempts}`;
                totalAgg.set(totalKey, (totalAgg.get(totalKey) || 0) + value);
            }

            // Merge country-specific and total aggregations
            const finalAgg = new Map([...agg, ...totalAgg]);
            console.log(`✅ [CONTRACTPROCESSED-TODAY] Final aggregation has ${finalAgg.size} entries`);

            // Generate cumulative metrics (sum across all attempts) - ONLY THESE
            const cumulativeMetrics = generateProcessedCumulativeMetricsFromData(finalAgg, "today");
            console.log(`✅ [CONTRACTPROCESSED-TODAY] Generated ${cumulativeMetrics.length} cumulative metrics`);

            console.log(`✅ [CONTRACTPROCESSED-TODAY] Query completed successfully. Returning ${cumulativeMetrics.length} metrics`);
            return cumulativeMetrics;
        }
    }
];
