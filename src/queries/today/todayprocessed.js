// src/queries/today/todayprocessed.js
// All contract processed queries for today

import { generateProcessedCumulativeMetricsFromData } from "../../utils/metricsGenerator.js";
import { normalizeStatus } from "../../utils/status.js";

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
                    SELECT s.contractBatchId as batchId,
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

            // Helpers for safe batchId handling
            const isStr = v => typeof v === "string";
            const toEntityBatchId = (batchId) =>
                isStr(batchId) && batchId.startsWith("CMP-Contract-")
                    ? batchId.substring(13)
                    : (isStr(batchId) ? batchId : "");

            // Filter out rows with missing/invalid batchId (avoid .startsWith on undefined)
            const cleanContractRows = contractRows.filter((d, i) => {
                const ok = isStr(d?.batchId) && d.batchId.length > 0;
                if (!ok) {
                    console.warn(`[CONTRACTPROCESSED-TODAY] Skipping row at index ${i} due to invalid batchId:`, {
                        type: typeof d?.batchId, value: d?.batchId
                    });
                }
                return ok;
            });

            if (cleanContractRows.length === 0) {
                console.log(`⚠️ [CONTRACTPROCESSED-TODAY] No valid rows with batchId; returning zero metrics`);
                return generateProcessedCumulativeMetricsFromData(new Map(), "today");
            }

            // Step 2: Get batchIds to lookup entity data (remove "CMP-Contract-" prefix)
            const batchIds = cleanContractRows.map(doc => toEntityBatchId(doc.batchId)).filter(Boolean);
            console.log(`🔍 [CONTRACTPROCESSED-TODAY] Processing ${batchIds.length} batchIds for processed analysis...`);

            const entityData = new Map(); // batchId -> entity data

            // Process in chunks to avoid query size limits
            const chunkSize = 50;
            for (let i = 0; i < batchIds.length; i += chunkSize) {
                const chunk = batchIds.slice(i, i + chunkSize);
                console.log(`🔍 [CONTRACTPROCESSED-TODAY] Looking up entity data for chunk ${Math.floor(i/chunkSize) + 1}...`);

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

                for (const entity of (entities || [])) {
                    entityData.set(entity.batchId, entity);
                    console.log(`✅ [CONTRACTPROCESSED-TODAY] Entity data for ${entity.batchId}: country=${entity.countryCode}, status=${entity.contractStatus}, contractId=${entity.contractId}`);
                }
            }

            console.log(`✅ [CONTRACTPROCESSED-TODAY] Entity data lookup complete. Found ${entityData.size} entities`);

            // Step 3: Process contracts and build aggregations
            const agg = new Map(); // key = `${status}|${country}|${cs}|${attempts}`
            const normCountry = (raw) => String(raw || "").toLowerCase().trim();
            const normContractStatus = (raw) => String(raw || "").toLowerCase().trim();

            // Track unique contract IDs for counting unique processed contracts
            const uniqueContractIdsByCountryStatus = new Set(); // Set of unique contract IDs by country and status and contract status
            const uniqueContractIdsByCountry = new Set(); // Set of unique contract IDs by country
            const uniqueContractIdsTotal = new Set(); // Set of unique contract IDs total

            console.log(`🔍 [CONTRACTPROCESSED-TODAY] Processing ${cleanContractRows.length} contract records...`);

            for (const contractRow of cleanContractRows) {
                const batchId = contractRow.batchId; // guaranteed string by filter
                const entityBatchId = toEntityBatchId(batchId);
                if (!entityBatchId) {
                    console.warn(`[CONTRACTPROCESSED-TODAY] Derived empty entityBatchId from batchId='${batchId}', skipping`);
                    continue;
                }
                const entity = entityData.get(entityBatchId);

                if (entity) {
                    const country = normCountry(entity.countryCode || "unk");
                    const cs = normContractStatus(entity.contractStatus || "unk");
                    const contractId = entity.contractId;
                    const attempts = contractRow.attempts || 0;
                    const status = normalizeStatus(contractRow.status);

                    console.log(`📊 [CONTRACTPROCESSED-TODAY] Processed: ${batchId} -> status=${status}, country=${country}, contractStatus=${cs}, attempts=${attempts}`);

                    // Track unique contract IDs for aggregation (only count each unique contract once per status/country/contractStatus combination)
                    if (contractId) {
                        const uniqueKey = `${contractId}|${status}|${country}|${cs}`;
                        if (!uniqueContractIdsByCountryStatus.has(uniqueKey)) {
                            uniqueContractIdsByCountryStatus.add(uniqueKey);
                            
                            // Contract header exists and upload document exists - count this unique processed contract
                            const k = `${status}|${country}|${cs}|0`;
                            agg.set(k, (agg.get(k) || 0) + 1);
                        }
                        
                        // Also track for "all" metrics
                        uniqueContractIdsByCountry.add(`${contractId}|${country}`);
                        uniqueContractIdsTotal.add(contractId);
                    }
                } else {
                    console.log(`⚠️ [CONTRACTPROCESSED-TODAY] Upload doc exists but no entity data for ${batchId} (entityBatchId: ${entityBatchId})`);
                }
            }

            // Step 4: Add "all" status metrics and unique contract ID metrics
            console.log(`🔍 [CONTRACTPROCESSED-TODAY] Adding "all" status and unique contract ID metrics...`);

            // Calculate "all" status metrics by summing all contract statuses for each country/status combination
            const allByCountryStatus = new Map(); // key = "country|status" -> count
            for (const [key, value] of agg) {
                const [status, country, cs, attempts] = key.split('|');
                // Skip if this is already an "all" status key or not a regular status
                if (cs === 'all' || status.endsWith('_unique')) {
                    continue;
                }
                const allKey = `${country}|${status}`;
                allByCountryStatus.set(allKey, (allByCountryStatus.get(allKey) || 0) + value);
            }

            // Add "all" metrics for each country/status combination
            for (const [countryStatus, count] of allByCountryStatus) {
                const [country, status] = countryStatus.split('|');
                const allCountryKey = `${status}|${country}|all|0`;
                agg.set(allCountryKey, count);
                console.log(`📊 [CONTRACTPROCESSED-TODAY] All contract statuses for ${country}: ${status} = ${count}`);
            }

            // Add total "all" metrics for each status
            const allByStatus = new Map(); // status -> count
            for (const [countryStatus, count] of allByCountryStatus) {
                const [country, status] = countryStatus.split('|');
                if (country !== 'total') { // Only count actual countries, not total
                    allByStatus.set(status, (allByStatus.get(status) || 0) + count);
                }
            }

            for (const [status, count] of allByStatus) {
                const allTotalKey = `${status}|total|all|0`;
                agg.set(allTotalKey, count);
                console.log(`📊 [CONTRACTPROCESSED-TODAY] All contract statuses total: ${status} = ${count}`);
            }

            // Count unique contracts by country for "all" metrics
            const uniqueByCountry = new Map(); // country -> count
            for (const contractCountry of uniqueContractIdsByCountry) {
                const [contractId, country] = contractCountry.split('|');
                uniqueByCountry.set(country, (uniqueByCountry.get(country) || 0) + 1);
            }

            // Add unique "all" metrics for each country
            for (const [country, count] of uniqueByCountry) {
                const allKey = `completed_unique|${country}|all|0`;
                agg.set(allKey, count);
                console.log(`📊 [CONTRACTPROCESSED-TODAY] Unique contracts (all statuses): completed ${country} = ${count} unique contract IDs`);
            }

            // Add total unique "all" metric
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
