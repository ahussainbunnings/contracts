// src/queries/today/todayreceived.js
// All contract received queries for today

import { generateCumulativeMetricsFromData } from "../../utils/metricsGenerator.js";
import { mapEntityStatusToReadable } from "../../utils/status.js";

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

            // Merge country-specific and total aggregations
            const finalAgg = new Map([...agg, ...totalAgg]);
            console.log(`✅ [CONTRACTRECEIVED-TODAY] Final aggregation has ${finalAgg.size} entries`);

            // Generate cumulative metrics (sum across all attempts) - ONLY THESE
            const cumulativeMetrics = generateCumulativeMetricsFromData(finalAgg, "today");
            console.log(`✅ [CONTRACTRECEIVED-TODAY] Generated ${cumulativeMetrics.length} cumulative metrics`);

            console.log(`✅ [CONTRACTRECEIVED-TODAY] Query completed successfully. Returning ${cumulativeMetrics.length} metrics`);
            return cumulativeMetrics;
        }
    },
    {
        name: "contractreceived_subdomains_today",
        metricBase: "custom.dashboard.contractreceived.today.subdomains",
        run: async (containers, win) => {
            console.log(`🔍 [CONTRACTRECEIVED-SUBDOMAINS-TODAY] Starting query for time window: ${win.startSec} to ${win.endSec}`);

            const entitiesC = containers.contractEntities;

            // Step 1: Find all unique contractIds in today's time window
            const qContractIds = {
                query: `
                    SELECT DISTINCT c.header.metadata.contractId AS contractId
                    FROM c
                    WHERE c._ts >= @startSec AND c._ts < @endSec
                      AND IS_DEFINED(c.header.metadata.contractId)
                `,
                parameters: [
                    { name: "@startSec", value: win.startSec },
                    { name: "@endSec",   value: win.endSec }
                ]
            };

            console.log(`🔍 [CONTRACTRECEIVED-SUBDOMAINS-TODAY] Querying for unique contractIds...`);
            const { resources: contractIds } = await entitiesC.items.query(qContractIds).fetchAll();
            console.log(`✅ [CONTRACTRECEIVED-SUBDOMAINS-TODAY] Found ${contractIds?.length || 0} unique contractIds in time window`);

            if (!contractIds || contractIds.length === 0) {
                console.log(`⚠️ [CONTRACTRECEIVED-SUBDOMAINS-TODAY] No contractIds found, returning zero metrics`);
                return generateCumulativeMetricsFromData(new Map(), "today");
            }

            // Step 2: For each contractId, count subDomains across ALL partitionKeys
            const agg = new Map(); // key = `${subDomain}|${country}|${contractStatus}|${window}`
            const normCountry = (raw) => String(raw || "").toLowerCase().trim();

            console.log(`🔍 [CONTRACTRECEIVED-SUBDOMAINS-TODAY] Analyzing subDomains for ${contractIds.length} contracts...`);

            // Store all contract data for table display
            const contractData = [];

            for (const contractIdRow of contractIds) {
                const contractId = contractIdRow.contractId;
                console.log(`\n📋 [CONTRACTRECEIVED-SUBDOMAINS-TODAY] Analyzing contractId: ${contractId}`);

                // Query all subDomains for this contractId across ALL partitionKeys
                const qSubDomains = {
                    query: `
                        SELECT c.header.subDomain AS subDomain,
                               c.partitionKey AS partitionKey,
                               c.header.metadata.countryCode AS countryCode,
                               c.header.metadata.contractStatus AS contractStatus,
                               c._ts AS timestamp
                        FROM c
                        WHERE c.header.metadata.contractId = @contractId
                        ORDER BY c._ts ASC
                    `,
                    parameters: [
                        { name: "@contractId", value: contractId }
                    ]
                };

                const { resources: subDomainRows } = await entitiesC.items.query(qSubDomains).fetchAll();
                console.log(`   Found ${subDomainRows?.length || 0} total documents for contractId ${contractId}`);

                if (subDomainRows && subDomainRows.length > 0) {
                    // UPDATED: Find the most recent batch (highest timestamp) and only count entities from that batch
                    const batchTimestamps = new Map(); // partitionKey -> maxTimestamp
                    for (const row of subDomainRows) {
                        const partitionKey = row.partitionKey;
                        const timestamp = row.timestamp;
                        if (!batchTimestamps.has(partitionKey) || timestamp > batchTimestamps.get(partitionKey)) {
                            batchTimestamps.set(partitionKey, timestamp);
                        }
                    }

                    // Find the most recent batch
                    let mostRecentBatch = null;
                    let maxTimestamp = 0;
                    for (const [partitionKey, timestamp] of batchTimestamps) {
                        if (timestamp > maxTimestamp) {
                            maxTimestamp = timestamp;
                            mostRecentBatch = partitionKey;
                        }
                    }

                    console.log(`   Most recent batch: ${mostRecentBatch} (timestamp: ${new Date(maxTimestamp * 1000).toISOString()})`);
                    if (batchTimestamps.size > 1) {
                        console.log(`   ⚠️  Contract published ${batchTimestamps.size} times - counting entities from most recent batch only`);
                    }

                    // Now count entities only from the most recent batch
                    const subDomainCounts = new Map();
                    const partitionKeyCounts = new Map();
                    const partitionKeyDetails = new Map();
                    let country = "unk";
                    let contractStatus = "unk";
                    let totalDocsInMostRecentBatch = 0;

                    for (const row of subDomainRows) {
                        // Only count if this row belongs to the most recent batch
                        if (row.partitionKey !== mostRecentBatch) {
                            continue;
                        }

                        const subDomain = row.subDomain || "unknown";
                        const partitionKey = row.partitionKey;
                        const timestamp = new Date(row.timestamp * 1000).toISOString();

                        totalDocsInMostRecentBatch++;

                        // Count by subDomain (only from most recent batch)
                        subDomainCounts.set(subDomain, (subDomainCounts.get(subDomain) || 0) + 1);

                        // Count by partitionKey for detailed logging
                        const key = `${partitionKey}|${subDomain}`;
                        partitionKeyCounts.set(key, (partitionKeyCounts.get(key) || 0) + 1);

                        // Store details for each partitionKey
                        if (!partitionKeyDetails.has(partitionKey)) {
                            partitionKeyDetails.set(partitionKey, {
                                country: row.countryCode,
                                contractStatus: row.contractStatus,
                                firstTimestamp: timestamp,
                                subDomains: new Set()
                            });
                        }
                        partitionKeyDetails.get(partitionKey).subDomains.add(subDomain);

                        // Use the first row's country and contractStatus
                        if (country === "unk") {
                            country = normCountry(row.countryCode);
                            contractStatus = String(row.contractStatus || "").toLowerCase().trim();
                        }
                    }

                    console.log(`   Counted ${totalDocsInMostRecentBatch} entities from most recent batch`);

                    // Store contract data for table
                    contractData.push({
                        contractId,
                        country: country.toUpperCase(),
                        contractStatus: contractStatus.toUpperCase(),
                        totalDocuments: totalDocsInMostRecentBatch,
                        partitionKeyCount: partitionKeyDetails.size,
                        subDomainCounts: Object.fromEntries(subDomainCounts),
                        partitionKeys: Array.from(partitionKeyDetails.keys())
                    });

                    // Create metrics for each subDomain (aggregated across all partitionKeys)
                    for (const [subDomain, count] of subDomainCounts) {
                        const k = `${subDomain}|${country}|${contractStatus}|today`;
                        agg.set(k, count);
                    }
                }
            }

            // Display results in clean table format
            console.log(`\n${'='.repeat(120)}`);
            console.log(`📊 CONTRACT SUBDOMAIN ANALYSIS - CLEAN TABLE FORMAT`);
            console.log(`${'='.repeat(120)}`);

            if (contractData.length > 0) {
                // Summary table
                console.log(`\n📋 SUMMARY BY CONTRACT:`);
                console.log(`${'-'.repeat(120)}`);
                console.log(`| ${'Contract ID'.padEnd(12)} | ${'Country'.padEnd(8)} | ${'Status'.padEnd(10)} | ${'PartitionKeys'.padEnd(15)} | ${'Total Docs'.padEnd(12)} | ${'Contract'.padEnd(8)} | ${'ContractLine'.padEnd(12)} | ${'ContractCustomer'.padEnd(16)} |`);
                console.log(`${'-'.repeat(120)}`);

                for (const contract of contractData) {
                    const contractCount = contract.subDomainCounts.Contract || 0;
                    const contractLineCount = contract.subDomainCounts.ContractLine || 0;
                    const contractCustomerCount = contract.subDomainCounts.ContractCustomer || 0;

                    console.log(`| ${contract.contractId.padEnd(12)} | ${contract.country.padEnd(8)} | ${contract.contractStatus.padEnd(10)} | ${contract.partitionKeyCount.toString().padEnd(15)} | ${contract.totalDocuments.toString().padEnd(12)} | ${contractCount.toString().padEnd(8)} | ${contractLineCount.toString().padEnd(12)} | ${contractCustomerCount.toString().padEnd(16)} |`);
                }

                console.log(`${'-'.repeat(120)}`);

                // Totals
                const totalContracts = contractData.length;
                const totalPartitionKeys = contractData.reduce((sum, c) => sum + c.partitionKeyCount, 0);
                const totalDocuments = contractData.reduce((sum, c) => sum + c.totalDocuments, 0);
                const totalContractDocs = contractData.reduce((sum, c) => sum + (c.subDomainCounts.Contract || 0), 0);
                const totalContractLineDocs = contractData.reduce((sum, c) => sum + (c.subDomainCounts.ContractLine || 0), 0);
                const totalContractCustomerDocs = contractData.reduce((sum, c) => sum + (c.subDomainCounts.ContractCustomer || 0), 0);

                console.log(`\n📊 TOTALS:`);
                console.log(`${'-'.repeat(120)}`);
                console.log(`| ${'Total Contracts'.padEnd(12)} | ${'Total PartitionKeys'.padEnd(20)} | ${'Total Documents'.padEnd(15)} | ${'Contract'.padEnd(8)} | ${'ContractLine'.padEnd(12)} | ${'ContractCustomer'.padEnd(16)} |`);
                console.log(`${'-'.repeat(120)}`);
                console.log(`| ${totalContracts.toString().padEnd(12)} | ${totalPartitionKeys.toString().padEnd(20)} | ${totalDocuments.toString().padEnd(15)} | ${totalContractDocs.toString().padEnd(8)} | ${totalContractLineDocs.toString().padEnd(12)} | ${totalContractCustomerDocs.toString().padEnd(16)} |`);
                console.log(`${'-'.repeat(120)}`);
            } else {
                console.log(`\n❌ No contract data found for the specified time window.`);
            }

            console.log(`${'='.repeat(120)}\n`);

            // Calculate totals for each subDomain across all contracts
            const totalAgg = new Map(); // key = `${subDomain}|total|all|${window}`
            for (const [key, value] of agg) {
                const [subDomain, country, contractStatus, window] = key.split('|');
                const totalKey = `${subDomain}|total|all|${window}`;
                totalAgg.set(totalKey, (totalAgg.get(totalKey) || 0) + value);
            }

            // Merge contract-specific and total aggregations
            const finalAgg = new Map([...agg, ...totalAgg]);
            console.log(`✅ [CONTRACTRECEIVED-SUBDOMAINS-TODAY] Final aggregation has ${finalAgg.size} entries`);

            // Generate metrics
            const results = [];
            for (const [key, value] of finalAgg) {
                const [subDomain, country, contractStatus, window] = key.split('|');

                results.push({
                    labels: {
                        status: subDomain,
                        contractstatus: contractStatus === "all" ? "total" : mapEntityStatusToReadable(contractStatus),
                        country: country,
                        window: window
                    },
                    value
                });
            }

            console.log(`✅ [CONTRACTRECEIVED-SUBDOMAINS-TODAY] Generated ${results.length} metrics`);
            console.log(`✅ [CONTRACTRECEIVED-SUBDOMAINS-TODAY] Query completed successfully. Returning ${results.length} metrics`);
            return results;
        }
    }
];
