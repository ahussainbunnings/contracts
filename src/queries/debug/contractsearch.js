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

            console.log(`\n${'='.repeat(120)}`);
            console.log(`🔍 SEARCH RESULTS`);
            console.log(`${'='.repeat(120)}`);

            // Summary by Contract
            console.log(`\n📊 SUMMARY BY CONTRACT:`);
            console.log(`${'-'.repeat(120)}`);
            console.log(`| Contract ID  | Country  | Status     | PartitionKeys   | Total Docs   | Contract | ContractLine | ContractCustomer |`);
            console.log(`${'-'.repeat(120)}`);

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

                console.log(`| ${String(contractId).padEnd(12)} | ${String(group.country).padEnd(8)} | ${String(contractStatus).padEnd(11)} | ${String(partitionKeys.length).padEnd(15)} | ${String(group.entities.length).padEnd(12)} | ${String(subDomainCounts.Contract).padEnd(8)} | ${String(subDomainCounts.ContractLine).padEnd(12)} | ${String(subDomainCounts.ContractCustomer).padEnd(16)} |`);
            }
            console.log(`${'-'.repeat(120)}`);

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
        } else {
            console.log("❌ No contracts found matching the search criteria");
        }

        return [];

    } catch (error) {
        console.error(`❌ [CONTRACTDETAILS-CONTRACTSEARCH] Error:`, error.message);
        return [];
    }
}
