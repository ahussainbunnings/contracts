// src/queries/today/todayreceived.js
// All contract received queries for today

import { generateCumulativeMetricsFromData } from "../../utils/metricsGenerator.js";

export const queries = [
    {
        name: "contractreceived_today",
        metricBase: "custom.dashboard.contractreceived.today.by_status",
        run: async (containers, win) => {
            console.log(`🔍 [CONTRACTRECEIVED-TODAY] Starting query for time window: ${win.startSec} to ${win.endSec}`);

            const entitiesC = containers.contractEntities;
            const contractC = containers.contract;

            // Step 1: Query contract table for upload documents in time window
            const qUploadDocs = {
                query: `
                    SELECT s.contractBatchId as batchId,
                           s.status,
                           s.attempts,
                           s._ts as timestamp
                    FROM s
                    WHERE s._ts >= @startSec AND s._ts < @endSec
                      AND CONTAINS(s.id, "Upload")
                `,
                parameters: [
                    { name: "@startSec", value: win.startSec },
                    { name: "@endSec", value: win.endSec }
                ]
            };

            console.log(`🔍 [CONTRACTRECEIVED-TODAY] Querying contract table for upload documents...`);
            const { resources: uploadDocs } = await contractC.items.query(qUploadDocs).fetchAll();
            console.log(`✅ [CONTRACTRECEIVED-TODAY] Found ${uploadDocs?.length || 0} upload documents in time window`);

            if (!uploadDocs || uploadDocs.length === 0) {
                console.log(`⚠️ [CONTRACTRECEIVED-TODAY] No upload documents found, returning zero metrics`);
                return generateCumulativeMetricsFromData(new Map(), "today");
            }

            // Step 2: Get batchIds to lookup entity data (remove "CMP-Contract-" prefix)
            const isStr = v => typeof v === "string";
            const toEntityBatchId = (batchId) =>
                isStr(batchId) && batchId.startsWith("CMP-Contract-")
                    ? batchId.substring(13)
                    : (isStr(batchId) ? batchId : "");

            // Log & drop any rows with missing/invalid batchId
            const cleanUploadDocs = uploadDocs.filter((d, i) => {
                const ok = isStr(d?.batchId) && d.batchId.length > 0;
                if (!ok) {
                    console.warn(`[CONTRACTRECEIVED-TODAY] Skipping upload doc at index ${i} due to invalid batchId:`, {
                        type: typeof d?.batchId, value: d?.batchId
                    });
                }
                return ok;
            });

            if (cleanUploadDocs.length === 0) {
                console.log(`⚠️ [CONTRACTRECEIVED-TODAY] No valid upload docs with batchId; returning zero metrics`);
                return generateCumulativeMetricsFromData(new Map(), "today");
            }

            const batchIds = cleanUploadDocs.map(d => toEntityBatchId(d.batchId)).filter(Boolean);
            console.log(`🔍 [CONTRACTRECEIVED-TODAY] Processing ${batchIds.length} batchIds for received analysis...`);

            const entityData = new Map(); // batchId -> entity data

            // Process in chunks to avoid query size limits
            const chunkSize = 50;
            for (let i = 0; i < batchIds.length; i += chunkSize) {
                const chunk = batchIds.slice(i, i + chunkSize);
                console.log(`🔍 [CONTRACTRECEIVED-TODAY] Looking up entity data for chunk ${Math.floor(i/chunkSize) + 1}...`);

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
                    console.log(`✅ [CONTRACTRECEIVED-TODAY] Entity data for ${entity.batchId}: country=${entity.countryCode}, status=${entity.contractStatus}, contractId=${entity.contractId}`);
                }
            }

            console.log(`✅ [CONTRACTRECEIVED-TODAY] Entity data lookup complete. Found ${entityData.size} entities`);

            // Step 3: Build a map of contractId -> most recent upload document
            console.log(`🔍 [CONTRACTRECEIVED-TODAY] Finding most recent upload for each contract...`);
            const latestUploadByContractId = new Map(); // contractId -> { uploadDoc, entity }

            for (const uploadDoc of cleanUploadDocs) {
                const batchId = uploadDoc.batchId;
                const entityBatchId = toEntityBatchId(batchId);
                if (!entityBatchId) {
                    console.warn(`[CONTRACTRECEIVED-TODAY] Derived empty entityBatchId from batchId='${batchId}', skipping`);
                    continue;
                }
                const entity = entityData.get(entityBatchId);
                
                if (entity && entity.contractId) {
                    const contractId = entity.contractId;
                    const existing = latestUploadByContractId.get(contractId);
                    
                    // Keep the upload with the latest timestamp
                    if (!existing || uploadDoc.timestamp > existing.uploadDoc.timestamp) {
                        latestUploadByContractId.set(contractId, { uploadDoc, entity });
                        if (existing) {
                            console.log(`� [CONTRACTRECEIVED-TODAY] Replaced older upload for contract ${contractId} (old ts: ${existing.uploadDoc.timestamp}, new ts: ${uploadDoc.timestamp})`);
                        }
                    } else {
                        console.log(`⏭️ [CONTRACTRECEIVED-TODAY] Skipping older upload for contract ${contractId} (current ts: ${uploadDoc.timestamp} <= latest ts: ${existing.uploadDoc.timestamp})`);
                    }
                } else if (!entity) {
                    console.log(`⚠️ [CONTRACTRECEIVED-TODAY] Upload doc exists but no entity data for ${batchId} (entityBatchId: ${entityBatchId})`);
                }
            }

            console.log(`✅ [CONTRACTRECEIVED-TODAY] Found ${latestUploadByContractId.size} unique contracts with their latest uploads`);

            // Step 4: Process only the latest uploads and build aggregations
            const agg = new Map(); // key = `${status}|${country}|${cs}|${attempts}`
            const normCountry = (raw) => String(raw || "").toLowerCase().trim();
            const normContractStatus = (raw) => String(raw || "").toLowerCase().trim();

            // Track unique contract IDs for counting unique received contracts
            const uniqueContractIdsByCountry = new Set(); // Set of unique contract IDs by country
            const uniqueContractIdsTotal = new Set(); // Set of unique contract IDs total

            console.log(`🔍 [CONTRACTRECEIVED-TODAY] Processing ${latestUploadByContractId.size} latest contract uploads...`);

            for (const [contractId, { uploadDoc, entity }] of latestUploadByContractId) {
                const country = normCountry(entity.countryCode || "unk");
                const cs = normContractStatus(entity.contractStatus || "unk");
                const attempts = uploadDoc.attempts || 0;
                const status = uploadDoc.status || "";
                const batchId = uploadDoc.batchId;

                console.log(`📊 [CONTRACTRECEIVED-TODAY] Processing latest upload for contract ${contractId}: ${batchId} -> country=${country}, contractStatus=${cs}, attempts=${attempts}, timestamp=${uploadDoc.timestamp}`);

                const statusLabel = "successfully_received";
                
                // Contract header exists and upload document exists - count this unique received contract
                const k = `${statusLabel}|${country}|${cs}|0`;
                agg.set(k, (agg.get(k) || 0) + 1);
                console.log(`✅ [CONTRACTRECEIVED-TODAY] Successfully received: ${batchId} -> ${statusLabel}|${country}|${cs}|0 (attempts=${attempts}, status=${status})`);
                
                // Track for "all" metrics
                uniqueContractIdsByCountry.add(`${contractId}|${country}`);
                uniqueContractIdsTotal.add(contractId);
            }

            // Step 5: Add unique contract ID metrics
            console.log(`🔍 [CONTRACTRECEIVED-TODAY] Adding unique contract ID metrics...`);

            // Count unique contracts by country for "all" metrics
            const uniqueByCountry = new Map(); // country -> count
            for (const contractCountry of uniqueContractIdsByCountry) {
                const [contractId, country] = contractCountry.split('|');
                uniqueByCountry.set(country, (uniqueByCountry.get(country) || 0) + 1);
            }

            // Add "all" metrics for each country
            for (const [country, count] of uniqueByCountry) {
                const allKey = `successfully_received_unique|${country}|all|0`;
                agg.set(allKey, count);
                console.log(`📊 [CONTRACTRECEIVED-TODAY] Unique contracts (all statuses): successfully_received ${country} = ${count} unique contract IDs`);
            }

            // Add total "all" metric

            // Add "all" contract status metrics for each country (sum of all contract statuses)
            const allByCountry = new Map(); // country -> sum of all contract statuses
            for (const [key, value] of agg) {
                const [status, country, cs, attempts] = key.split("|");
                if (status === "successfully_received" && cs !== "all") {
                    allByCountry.set(country, (allByCountry.get(country) || 0) + value);
                }
            }

            // Add "all" metrics for each country
            for (const [country, count] of allByCountry) {
                const allCountryKey = `successfully_received|${country}|all|0`;
                agg.set(allCountryKey, count);
                console.log(`📊 [CONTRACTRECEIVED-TODAY] All contract statuses for ${country}: successfully_received = ${count}`);
            }

            // Add total "all" metric for successfully_received
            const allTotalCount = Array.from(allByCountry.values()).reduce((sum, count) => sum + count, 0);
            const allTotalReceivedKey = `successfully_received|total|all|0`;
            agg.set(allTotalReceivedKey, allTotalCount);
            console.log(`📊 [CONTRACTRECEIVED-TODAY] All contract statuses total: successfully_received = ${allTotalCount}`);
            const allTotalKey = `successfully_received_unique|total|all|0`;
            agg.set(allTotalKey, uniqueContractIdsTotal.size);
            console.log(`📊 [CONTRACTRECEIVED-TODAY] Unique contracts (all statuses): successfully_received total = ${uniqueContractIdsTotal.size} unique contract IDs`);

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

            // Return ONLY the unique contracts received metric (total across all countries)
            const uniqueMetric = {
                labels: {
                    status: "successfully_received_unique",
                    contractstatus: "all",
                    country: "total",
                    window: "today"
                },
                value: uniqueContractIdsTotal.size
            };

            console.log(`✅ [CONTRACTRECEIVED-TODAY] Returning 1 metric: ${uniqueContractIdsTotal.size} unique contracts received`);
            return [uniqueMetric];
        }
    }
];
