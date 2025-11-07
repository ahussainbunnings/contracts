// src/queries/month/integrationstatus.js
export const name = "integrationstatus_month";
export const metricBase = "custom.dashboard.integrationstatus.month";

export async function run(containers, win) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 [INTEGRATIONSTATUS-MONTH] Starting query for time window: ${win.startSec} to ${win.endSec}`);
    console.log(`${'='.repeat(80)}`);

    try {
        // Query for ContractCosmosDataModel documents within time window
        const integrationQuery = {
            query: `
                SELECT c.id, c.contractId, c.integrationStatus, c.integrationComment, c.contractStatus, c.countryCode, c._ts
                FROM c 
                WHERE c.documentType = "ContractCosmosDataModel"
                AND c._ts >= @startSec
                AND c._ts < @endSec
                ORDER BY c._ts DESC
            `,
            parameters: [
                { name: "@startSec", value: win.startSec },
                { name: "@endSec", value: win.endSec }
            ]
        };

        const result = await containers.contract.items.query(integrationQuery).fetchAll();
        
        console.log(`✅ [INTEGRATIONSTATUS-MONTH] Found ${result.resources.length} contracts in time window`);

        if (result.resources.length === 0) {
            console.log(`⚠️ [INTEGRATIONSTATUS-MONTH] No contracts found, returning zero metrics`);
            
            // Return zero metrics for all statuses
            const metrics = [];
            const statuses = ['completed', 'completed_with_errors', 'loading', 'unknown'];
            const contractStatuses = ['active', 'draft', 'expired', 'pending', 'reviewed', 'approved', 'rejected', 'submitted'];
            
            statuses.forEach(intStatus => {
                // Total
                metrics.push({
                    labels: { integration_status: intStatus, country: 'total', window: 'month' },
                    value: 0
                });
                
                // By country
                ['au', 'nz'].forEach(country => {
                    metrics.push({
                        labels: { integration_status: intStatus, country: country, window: 'month' },
                        value: 0
                    });
                });
                
                // By contract status
                contractStatuses.forEach(cStatus => {
                    metrics.push({
                        labels: { integration_status: intStatus, contract_status: cStatus, country: 'total', window: 'month' },
                        value: 0
                    });
                });
            });
            
            return metrics;
        }

        // Initialize counters
        const statusCounts = {
            'Completed': { total: 0, byCountry: { au: 0, nz: 0 }, byContractStatus: {} },
            'Completed With Errors': { total: 0, byCountry: { au: 0, nz: 0 }, byContractStatus: {} },
            'Loading': { total: 0, byCountry: { au: 0, nz: 0 }, byContractStatus: {} },
            'Unknown': { total: 0, byCountry: { au: 0, nz: 0 }, byContractStatus: {} }
        };

        const contractStatuses = ['active', 'draft', 'expired', 'pending', 'reviewed', 'approved', 'rejected', 'submitted'];
        
        // Initialize byContractStatus for each integration status
        Object.keys(statusCounts).forEach(intStatus => {
            contractStatuses.forEach(cStatus => {
                statusCounts[intStatus].byContractStatus[cStatus] = 0;
            });
        });

        // Deduplicate by contractId - keep only the most recent record per contract
        const contractMap = new Map();
        
        result.resources.forEach(item => {
            const doc = item.c || item;
            const contractId = doc.contractId || doc.id;
            
            // Keep the most recent document for each contract (already ordered by _ts DESC)
            if (!contractMap.has(contractId)) {
                contractMap.set(contractId, doc);
            }
        });
        
        console.log(`🔍 [INTEGRATIONSTATUS-MONTH] After deduplication: ${contractMap.size} unique contracts`);

        // Fetch country codes for all unique contracts from contractEntities
        const contractIds = Array.from(contractMap.keys());
        const countryMap = new Map(); // contractId -> countryCode
        
        if (contractIds.length > 0) {
            console.log(`🔍 [INTEGRATIONSTATUS-MONTH] Fetching country codes for ${contractIds.length} contracts...`);
            
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
                
                const countryQuery = {
                    query: `
                        SELECT DISTINCT c.header.metadata.contractId AS contractId, 
                               c.header.metadata.countryCode AS countryCode
                        FROM c
                        WHERE c.header.metadata.contractId IN (${placeholders.join(',')})
                          AND c.header.subDomain = "Contract"
                    `,
                    parameters: parameters
                };
                
                const { resources: countryResults } = await containers.contractEntities.items.query(countryQuery).fetchAll();
                
                for (const result of (countryResults || [])) {
                    if (result.contractId && result.countryCode) {
                        countryMap.set(result.contractId, result.countryCode);
                    }
                }
            }
            
            console.log(`✅ [INTEGRATIONSTATUS-MONTH] Found country codes for ${countryMap.size} contracts`);
        }

        // Process deduplicated results
        const errorDetails = [];
        
        contractMap.forEach((doc, contractId) => {
            const integrationStatus = doc.integrationStatus || 'Unknown';
            const contractStatus = (doc.contractStatus || 'Unknown').toLowerCase();
            
            // Get country from the countryMap lookup
            const rawCountry = (countryMap.get(contractId) || '').toLowerCase().trim();
            const country = (rawCountry === 'au' || rawCountry === 'nz') ? rawCountry : 'unknown';

            // Normalize integration status
            let normalizedIntStatus = integrationStatus;
            if (!statusCounts.hasOwnProperty(integrationStatus)) {
                normalizedIntStatus = 'Unknown';
            }

            console.log(`📊 [INTEGRATIONSTATUS-MONTH] Contract ${contractId}: integrationStatus=${integrationStatus}, contractStatus=${contractStatus}, country=${country}`);

            // Count totals
            statusCounts[normalizedIntStatus].total++;

            // Count by country
            if (statusCounts[normalizedIntStatus].byCountry.hasOwnProperty(country)) {
                statusCounts[normalizedIntStatus].byCountry[country]++;
            }

            // Count by contract status
            if (contractStatuses.includes(contractStatus)) {
                statusCounts[normalizedIntStatus].byContractStatus[contractStatus]++;
            }

            // Collect error details for "Completed With Errors"
            if (integrationStatus === 'Completed With Errors' && doc.integrationComment) {
                errorDetails.push({
                    contractId: contractId,
                    contractStatus: doc.contractStatus,
                    error: doc.integrationComment,
                    timestamp: new Date(doc._ts * 1000).toISOString()
                });
            }
        });

        // Display summary
        console.log(`\n${'='.repeat(80)}`);
        console.log(`📊 INTEGRATION STATUS SUMMARY - MONTH`);
        console.log(`${'='.repeat(80)}`);
        
        console.log(`\n📈 Overview:`);
        console.log(`   Total Unique Contracts: ${contractMap.size}`);
        console.log(`   - Completed: ${statusCounts['Completed'].total}`);
        console.log(`   - Completed With Errors: ${statusCounts['Completed With Errors'].total}`);
        console.log(`   - Loading: ${statusCounts['Loading'].total}`);
        console.log(`   - Unknown: ${statusCounts['Unknown'].total}`);

        console.log(`\n📍 By Country:`);
        Object.keys(statusCounts).forEach(intStatus => {
            if (statusCounts[intStatus].total > 0) {
                console.log(`   ${intStatus}:`);
                console.log(`      AU: ${statusCounts[intStatus].byCountry.au}`);
                console.log(`      NZ: ${statusCounts[intStatus].byCountry.nz}`);
            }
        });

        // Show error details if any
        if (errorDetails.length > 0) {
            console.log(`\n⚠️  ERROR DETAILS (Completed With Errors):`);
            console.log(`${'-'.repeat(120)}`);
            console.log(`| Contract ID                              | Contract Status | Error                                                  | Timestamp                |`);
            console.log(`${'-'.repeat(120)}`);
            errorDetails.slice(0, 10).forEach(detail => {
                const errorMsg = String(detail.error).substring(0, 54);
                console.log(`| ${String(detail.contractId).padEnd(40)} | ${String(detail.contractStatus).padEnd(15)} | ${errorMsg.padEnd(54)} | ${detail.timestamp.padEnd(24)} |`);
            });
            console.log(`${'-'.repeat(120)}`);
            if (errorDetails.length > 10) {
                console.log(`   ... and ${errorDetails.length - 10} more error(s)`);
            }
        }

        // Generate metrics
        const metrics = [];

        // Metrics by integration status and country
        Object.keys(statusCounts).forEach(intStatus => {
            const normalizedStatus = intStatus.toLowerCase().replace(/ /g, '_');
            
            // Total metrics
            metrics.push({
                labels: {
                    integration_status: normalizedStatus,
                    country: 'total',
                    window: 'month'
                },
                value: statusCounts[intStatus].total
            });

            // By country
            ['au', 'nz'].forEach(country => {
                metrics.push({
                    labels: {
                        integration_status: normalizedStatus,
                        country: country,
                        window: 'month'
                    },
                    value: statusCounts[intStatus].byCountry[country]
                });
            });

            // By contract status
            contractStatuses.forEach(cStatus => {
                const count = statusCounts[intStatus].byContractStatus[cStatus] || 0;
                metrics.push({
                    labels: {
                        integration_status: normalizedStatus,
                        contract_status: cStatus,
                        country: 'total',
                        window: 'month'
                    },
                    value: count
                });
            });
        });

        console.log(`\n✅ [INTEGRATIONSTATUS-MONTH] Generated ${metrics.length} metrics`);

        return metrics;

    } catch (error) {
        console.error(`❌ [INTEGRATIONSTATUS-MONTH] Error:`, error.message);
        console.error(error.stack);
        return [];
    }
}

// Export the queries array for the loader
export const queries = [
    {
        name,
        metricBase,
        run
    }
];
