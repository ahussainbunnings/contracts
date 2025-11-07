// src/queries/week/integrationstatus.js
export const name = "integrationstatus_week";
export const metricBase = "custom.dashboard.integrationstatus.week";

export async function run(containers, options = {}) {
    const { window } = options;
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 [INTEGRATIONSTATUS-WEEK] Starting query for time window: ${window.startSec} to ${window.endSec}`);
    console.log(`${'='.repeat(80)}`);

    try {
        // Query for ContractCosmosDataModel documents within time window
        const integrationQuery = {
            query: `
                SELECT c.id, c.integrationStatus, c.integrationComment, c.contractStatus, c._ts
                FROM c 
                WHERE c.documentType = "ContractCosmosDataModel"
                AND c._ts >= @startSec
                AND c._ts < @endSec
                ORDER BY c._ts DESC
            `,
            parameters: [
                { name: "@startSec", value: window.startSec },
                { name: "@endSec", value: window.endSec }
            ]
        };

        const result = await containers.statusContainer.items.query(integrationQuery).fetchAll();
        
        console.log(`✅ [INTEGRATIONSTATUS-WEEK] Found ${result.resources.length} contracts in time window`);

        if (result.resources.length === 0) {
            console.log(`⚠️ [INTEGRATIONSTATUS-WEEK] No contracts found, returning zero metrics`);
            
            // Return zero metrics for all statuses
            const metrics = [];
            const timestamp = Date.now();
            const statuses = ['completed', 'completed_with_errors', 'loading', 'unknown'];
            const contractStatuses = ['active', 'draft', 'expired', 'pending', 'reviewed', 'approved', 'rejected', 'submitted'];
            
            statuses.forEach(intStatus => {
                // Total
                metrics.push({
                    metric: `${this.metricBase},integration_status=${intStatus},country=total,window=week`,
                    value: 0,
                    timestamp
                });
                
                // By country
                ['au', 'nz'].forEach(country => {
                    metrics.push({
                        metric: `${this.metricBase},integration_status=${intStatus},country=${country},window=week`,
                        value: 0,
                        timestamp
                    });
                });
                
                // By contract status
                contractStatuses.forEach(cStatus => {
                    metrics.push({
                        metric: `${this.metricBase},integration_status=${intStatus},contract_status=${cStatus},country=total,window=week`,
                        value: 0,
                        timestamp
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

        // Process results
        const errorDetails = [];
        
        result.resources.forEach(item => {
            const doc = item.c || item;
            const integrationStatus = doc.integrationStatus || 'Unknown';
            const contractStatus = (doc.contractStatus || 'Unknown').toLowerCase();
            const contractId = doc.id;
            
            // Determine country from contract ID or default to unknown
            let country = 'unknown';
            if (String(contractId).includes('-au') || String(contractId).toLowerCase().includes('au')) {
                country = 'au';
            } else if (String(contractId).includes('-nz') || String(contractId).toLowerCase().includes('nz')) {
                country = 'nz';
            }

            // Normalize integration status
            let normalizedIntStatus = integrationStatus;
            if (!statusCounts.hasOwnProperty(integrationStatus)) {
                normalizedIntStatus = 'Unknown';
            }

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
        console.log(`📊 INTEGRATION STATUS SUMMARY - WEEK`);
        console.log(`${'='.repeat(80)}`);
        
        console.log(`\n📈 Overview:`);
        console.log(`   Total Contracts: ${result.resources.length}`);
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
        const timestamp = Date.now();

        // Metrics by integration status and country
        Object.keys(statusCounts).forEach(intStatus => {
            const normalizedStatus = intStatus.toLowerCase().replace(/ /g, '_');
            
            // Total metrics
            metrics.push({
                metric: `${this.metricBase},integration_status=${normalizedStatus},country=total,window=week`,
                value: statusCounts[intStatus].total,
                timestamp
            });

            // By country
            ['au', 'nz'].forEach(country => {
                metrics.push({
                    metric: `${this.metricBase},integration_status=${normalizedStatus},country=${country},window=week`,
                    value: statusCounts[intStatus].byCountry[country],
                    timestamp
                });
            });

            // By contract status
            contractStatuses.forEach(cStatus => {
                const count = statusCounts[intStatus].byContractStatus[cStatus] || 0;
                metrics.push({
                    metric: `${this.metricBase},integration_status=${normalizedStatus},contract_status=${cStatus},country=total,window=week`,
                    value: count,
                    timestamp
                });
            });
        });

        console.log(`\n✅ [INTEGRATIONSTATUS-WEEK] Generated ${metrics.length} metrics`);

        return metrics;

    } catch (error) {
        console.error(`❌ [INTEGRATIONSTATUS-WEEK] Error:`, error.message);
        console.error(error.stack);
        return [];
    }
}
