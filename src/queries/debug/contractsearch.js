// src/queries/debug/contractsearch.js
export const name = "contractdetails_contractsearch";
export const metricBase = "custom.dashboard.contractdetails.contractsearch";
export const output = "report";

export async function run(containers, options = {}) {
    const { searchTerm, searchType = 'contractId' } = options;
    
    if (!searchTerm) {
        console.log("❌ [CONTRACTDETAILS-CONTRACTSEARCH] No search term provided");
        console.log("Usage: searchType can be 'contractId', 'batchId', or 'status'");
        return [];
    }

    console.log(`🔍 [CONTRACTDETAILS-CONTRACTSEARCH] Searching for: ${searchTerm}`);
    console.log(`   Search Type: ${searchType}`);

    try {
        let query, parameters;

        switch (searchType) {
            case 'contractId':
                // Try both string and number
                query = {
                    query: `
                        SELECT c
                        FROM c 
                        WHERE c.header.metadata.contractId = @searchTerm OR c.header.metadata.contractId = @searchTermNum
                        ORDER BY c._ts DESC
                    `,
                    parameters: [
                        { name: "@searchTerm", value: searchTerm },
                        { name: "@searchTermNum", value: parseInt(searchTerm) }
                    ]
                };
                break;
            case 'batchId':
                query = {
                    query: `
                        SELECT c
                        FROM c 
                        WHERE c.id = @searchTerm
                        ORDER BY c._ts DESC
                    `,
                    parameters: [{ name: "@searchTerm", value: searchTerm }]
                };
                break;
            case 'status':
                query = {
                    query: `
                        SELECT c
                        FROM c 
                        WHERE c.header.metadata.contractStatus = @searchTerm
                        ORDER BY c._ts DESC
                    `,
                    parameters: [{ name: "@searchTerm", value: searchTerm }]
                };
                break;
            default:
                console.log("❌ [CONTRACTDETAILS-CONTRACTSEARCH] Invalid search type. Use 'contractId', 'batchId', or 'status'");
                return [];
        }

        const result = await containers.entitiesContainer.items.query(query).fetchAll();
        
        console.log(`✅ [CONTRACTDETAILS-CONTRACTSEARCH] Found ${result.resources.length} results`);

        if (result.resources.length > 0) {
            // Extract and process the data (same pattern as contractinfo)
            const processedEntities = result.resources.map(item => {
                const entity = item.c || item; // Handle both formats
                return {
                    id: entity.id,
                    partitionKey: entity.partitionKey,
                    subDomain: entity.header?.subDomain,
                    contractId: entity.header?.metadata?.contractId,
                    contractStatus: entity.header?.metadata?.contractStatus,
                    countryCode: entity.header?.metadata?.countryCode,
                    timestamp: entity._ts
                };
            });

            // Group results by contract ID
            const contractGroups = new Map();
            
            processedEntities.forEach(entity => {
                const contractId = entity.contractId || 'Unknown';
                if (!contractGroups.has(contractId)) {
                    contractGroups.set(contractId, {
                        contractId,
                        country: entity.countryCode || 'Unknown',
                        entities: []
                    });
                }
                contractGroups.get(contractId).entities.push(entity);
            });

            // Query for integration status for all found contracts
            const contractIds = [...contractGroups.keys()];
            const integrationStatusMap = new Map();
            
            if (contractIds.length > 0) {
                // Query in batches if needed
                for (let i = 0; i < contractIds.length; i += 100) {
                    const batch = contractIds.slice(i, i + 100);
                    const integrationQuery = {
                        query: `
                            SELECT c.id, c.integrationStatus, c.integrationComment, c.contractStatus
                            FROM c 
                            WHERE c.documentType = "ContractCosmosDataModel"
                            AND c.id IN (${batch.map((_, idx) => `@id${idx}`).join(',')})
                        `,
                        parameters: batch.map((id, idx) => ({ name: `@id${idx}`, value: String(id) }))
                    };

                    const integrationResult = await containers.statusContainer.items.query(integrationQuery).fetchAll();
                    integrationResult.resources.forEach(item => {
                        const doc = item.c || item;
                        integrationStatusMap.set(doc.id, {
                            integrationStatus: doc.integrationStatus || 'Unknown',
                            integrationComment: doc.integrationComment || null
                        });
                    });
                }
            }

            console.log(`\n${'='.repeat(120)}`);
            console.log(`🔍 SEARCH RESULTS`);
            console.log(`${'='.repeat(120)}`);

            // Summary by Contract
            console.log(`\n📊 SUMMARY BY CONTRACT:`);
            console.log(`${'-'.repeat(180)}`);
            console.log(`| Contract ID  | Country  | Status     | Integration Status         | PartitionKeys   | Total Docs   | Contract | ContractLine | ContractCustomer |`);
            console.log(`${'-'.repeat(180)}`);

            for (const [contractId, group] of contractGroups) {
                // Count subdomains
                const subDomainCounts = {
                    Contract: 0,
                    ContractLine: 0,
                    ContractCustomer: 0
                };
                
                group.entities.forEach(entity => {
                    const subDomain = entity.subDomain || 'Unknown';
                    if (subDomainCounts.hasOwnProperty(subDomain)) {
                        subDomainCounts[subDomain]++;
                    }
                });

                // Get unique partition keys
                const partitionKeys = [...new Set(group.entities.map(e => e.partitionKey))];
                
                // Get latest contract status
                const latestEntity = group.entities.sort((a, b) => b.timestamp - a.timestamp)[0];
                const contractStatus = latestEntity?.contractStatus || 'Unknown';
                
                // Get integration status
                const integrationInfo = integrationStatusMap.get(String(contractId)) || {};
                const integrationStatus = integrationInfo.integrationStatus || 'Unknown';

                console.log(`| ${String(contractId).padEnd(12)} | ${String(group.country).padEnd(8)} | ${String(contractStatus).padEnd(11)} | ${String(integrationStatus).padEnd(26)} | ${String(partitionKeys.length).padEnd(15)} | ${String(group.entities.length).padEnd(12)} | ${String(subDomainCounts.Contract).padEnd(8)} | ${String(subDomainCounts.ContractLine).padEnd(12)} | ${String(subDomainCounts.ContractCustomer).padEnd(16)} |`);
                
                // Show integration comment if there are errors
                if (integrationInfo.integrationComment && integrationStatus === 'Completed With Errors') {
                    console.log(`  ⚠️  Integration Error: ${integrationInfo.integrationComment}`);
                }
            }
            console.log(`${'-'.repeat(180)}`);

            // Detailed breakdown
            console.log(`\n📊 DETAILED BREAKDOWN:`);
            console.log(`${'-'.repeat(120)}`);
            console.log(`| Contract ID  | Partition Key                                    | Contract Status | Country  | Sub Domain      | Timestamp                |`);
            console.log(`${'-'.repeat(120)}`);

            for (const [contractId, group] of contractGroups) {
                group.entities.forEach(entity => {
                    const timestamp = new Date(entity.timestamp * 1000).toISOString();
                    console.log(`| ${String(contractId).padEnd(12)} | ${String(entity.partitionKey || 'N/A').padEnd(48)} | ${String(entity.contractStatus || 'N/A').padEnd(15)} | ${String(entity.countryCode || 'N/A').padEnd(8)} | ${String(entity.subDomain || 'N/A').padEnd(15)} | ${timestamp.padEnd(24)} |`);
                });
            }
            console.log(`${'-'.repeat(120)}`);

            // Summary
            console.log(`\n📊 SUMMARY:`);
            console.log(`${'-'.repeat(60)}`);
            console.log(`Total Contract Groups: ${contractGroups.size}`);
            console.log(`Total Results: ${processedEntities.length}`);
            
            // Integration Status Summary
            const integrationStatusCounts = {
                'Completed': 0,
                'Completed With Errors': 0,
                'Loading': 0,
                'Unknown': 0
            };
            
            for (const [contractId, group] of contractGroups) {
                const integrationInfo = integrationStatusMap.get(String(contractId)) || {};
                const status = integrationInfo.integrationStatus || 'Unknown';
                if (integrationStatusCounts.hasOwnProperty(status)) {
                    integrationStatusCounts[status]++;
                } else {
                    integrationStatusCounts['Unknown']++;
                }
            }
            
            console.log(`\n📊 Integration Status Summary:`);
            console.log(`   - Completed: ${integrationStatusCounts['Completed']}`);
            console.log(`   - Completed With Errors: ${integrationStatusCounts['Completed With Errors']}`);
            console.log(`   - Loading: ${integrationStatusCounts['Loading']}`);
            console.log(`   - Unknown: ${integrationStatusCounts['Unknown']}`);
        } else {
            console.log("❌ No contracts found matching the search criteria");
        }

        return [];

    } catch (error) {
        console.error(`❌ [CONTRACTDETAILS-CONTRACTSEARCH] Error:`, error.message);
        return [];
    }
}
