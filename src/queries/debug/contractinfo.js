// src/queries/debug/contractinfo.js

export const name = "contractdetails_contractinfo";
export const metricBase = "custom.dashboard.contractdetails.contractinfo";
export const output = "report";

export async function run(containers, options = {}) {
    const { contractId, batchId } = options;
    
    if (!contractId && !batchId) {
        console.log("❌ [CONTRACTDETAILS-CONTRACTINFO] No contractId or batchId provided");
        return [];
    }

    console.log(`🔍 [CONTRACTDETAILS-CONTRACTINFO] Searching for contract details...`);
    console.log(`   Contract ID: ${contractId || 'N/A'}`);
    console.log(`   Batch ID: ${batchId || 'N/A'}`);

    try {
        // Query contract-entities for contract details - select full document
        const entitiesQuery = {
            query: `
                SELECT c
                FROM c 
                WHERE ${contractId ? 'c.header.metadata.contractId = @contractId' : 'c.id = @batchId'}
                ORDER BY c._ts DESC
            `,
            parameters: contractId 
                ? [{ name: "@contractId", value: contractId }]
                : [{ name: "@batchId", value: batchId }]
        };

        const entitiesResult = await containers.entitiesContainer.items.query(entitiesQuery).fetchAll();
        
        if (entitiesResult.resources.length === 0) {
            console.log("❌ [CONTRACTDETAILS-CONTRACTINFO] No contract found in contract-entities");
            return [];
        }

        console.log(`✅ [CONTRACTDETAILS-CONTRACTINFO] Found ${entitiesResult.resources.length} entities`);

        // Extract and process the data
        const processedEntities = entitiesResult.resources.map(item => {
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

        // Query contract table for processing details
        const contractQuery = {
            query: `
                SELECT c
                FROM c 
                WHERE ${contractId ? 'c.contractBatchId = @batchId' : 'c.id = @batchId'}
                ORDER BY c._ts DESC
            `,
            parameters: contractId 
                ? [{ name: "@batchId", value: processedEntities[0].partitionKey }]
                : [{ name: "@batchId", value: batchId }]
        };

        const contractResult = await containers.statusContainer.items.query(contractQuery).fetchAll();

        // Query for ContractCosmosDataModel documents to get integrationStatus
        // Try multiple approaches to find the integration status
        const integrationQuery = {
            query: `
                SELECT c.id, c.integrationStatus, c.integrationComment, c.contractStatus, c._ts
                FROM c 
                WHERE c.documentType = "ContractCosmosDataModel"
                AND ${contractId ? '(c.id = @contractId OR c.contractId = @contractId OR CONTAINS(TOSTRING(c.id), @contractId))' : 'c.contractBatchId = @batchId'}
                ORDER BY c._ts DESC
            `,
            parameters: contractId 
                ? [{ name: "@contractId", value: String(contractId) }]
                : [{ name: "@batchId", value: batchId }]
        };

        const integrationResult = await containers.statusContainer.items.query(integrationQuery).fetchAll();
        
        // Create a map of contract IDs to integration status
        const integrationStatusMap = new Map();
        integrationResult.resources.forEach(item => {
            const doc = item.c || item;
            integrationStatusMap.set(doc.id, {
                integrationStatus: doc.integrationStatus || 'Unknown',
                integrationComment: doc.integrationComment || null,
                contractStatus: doc.contractStatus || 'Unknown',
                timestamp: doc._ts
            });
        });
        
        console.log(`✅ [CONTRACTDETAILS-CONTRACTINFO] Found ${integrationResult.resources.length} integration status records`);
        
        console.log(`✅ [CONTRACTDETAILS-CONTRACTINFO] Found ${contractResult.resources.length} contract records`);

        // Extract contract processing data with correct field names
        const processedContracts = contractResult.resources.map(item => {
            const contract = item.c || item; // Handle both formats
            // Look up integration status for this contract
            const integrationInfo = integrationStatusMap.get(contract.id) || integrationStatusMap.get(contractId) || {};
            
            return {
                id: contract.id,
                batchId: contract.batchCorrelationId,
                contractBatchId: contract.contractBatchId,
                status: contract.salesforceResponse?.result || 'Unknown',
                attempts: contract.empRetryCount || 0, // Use empRetryCount as attempts
                empRetryCount: contract.empRetryCount || 0,
                salesforceResponse: contract.salesforceResponse,
                largeEntityType: contract.largeEntityType || 'Unknown',
                errorStatusCode: contract.salesforceResponse?.errors?.[0]?.statusCode || 'N/A',
                errorMessage: contract.salesforceResponse?.errors?.[0]?.message || 'N/A',
                integrationStatus: integrationInfo.integrationStatus || 'Unknown',
                integrationComment: integrationInfo.integrationComment || null,
                timestamp: contract._ts
            };
        });

        // Process and group the data
        const contractGroups = new Map();
        
        // Group entities by contract ID
        processedEntities.forEach(entity => {
            const contractId = entity.contractId || 'Unknown';
            if (!contractGroups.has(contractId)) {
                contractGroups.set(contractId, {
                    contractId,
                    country: entity.countryCode || 'Unknown',
                    entities: [],
                    contracts: []
                });
            }
            contractGroups.get(contractId).entities.push(entity);
        });

        // Add contract processing data
        processedContracts.forEach(contract => {
            // Find matching contract group by contractBatchId
            for (const [contractId, group] of contractGroups) {
                const matchingEntity = group.entities.find(e => e.partitionKey === contract.contractBatchId);
                if (matchingEntity) {
                    group.contracts.push(contract);
                    break;
                }
            }
        });

        // Display detailed information in table format
        console.log(`\n${'='.repeat(140)}`);
        console.log(`📋 CONTRACT DETAILS REPORT`);
        console.log(`${'='.repeat(140)}`);

        // Summary by Contract
        console.log(`\n📊 SUMMARY BY CONTRACT:`);
        console.log(`${'-'.repeat(220)}`);
        console.log(`| Contract ID  | Country  | Status     | Integration Status         | PartitionKeys   | Total Docs   | Contract | ContractLine | ContractCustomer | Processing Status | Attempts |`);
        console.log(`${'-'.repeat(220)}`);

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
            
            // Get processing status and integration status
            const latestContract = group.contracts.sort((a, b) => b.timestamp - a.timestamp)[0];
            const processingStatus = latestContract?.status || 'N/A';
            const attempts = latestContract?.attempts || 'N/A';
            const integrationStatus = latestContract?.integrationStatus || 'Unknown';

            console.log(`| ${String(contractId).padEnd(12)} | ${String(group.country).padEnd(8)} | ${String(contractStatus).padEnd(11)} | ${String(integrationStatus).padEnd(26)} | ${String(partitionKeys.length).padEnd(15)} | ${String(group.entities.length).padEnd(12)} | ${String(subDomainCounts.Contract).padEnd(8)} | ${String(subDomainCounts.ContractLine).padEnd(12)} | ${String(subDomainCounts.ContractCustomer).padEnd(16)} | ${String(processingStatus).padEnd(18)} | ${String(attempts).padEnd(8)} |`);
        }
        console.log(`${'-'.repeat(140)}`);

        // Detailed breakdown by Batch - Group by batch and show each batch separately
        console.log(`\n📊 DETAILED BREAKDOWN BY BATCH:`);
        console.log(`${'-'.repeat(140)}`);

        for (const [contractId, group] of contractGroups) {
            // Group by partition key (batch)
            const byBatch = new Map();
            group.entities.forEach(entity => {
                const batchId = entity.partitionKey;
                if (!byBatch.has(batchId)) {
                    byBatch.set(batchId, []);
                }
                byBatch.get(batchId).push(entity);
            });

            // Display each batch separately
            let batchNumber = 1;
            for (const [batchId, batchEntities] of byBatch) {
                console.log(`\n🔹 BATCH ${batchNumber}: ${batchId}`);
                console.log(`${'-'.repeat(140)}`);
                console.log(`| Contract ID  | Document ID | Sub Domain      | Contract Status | Country  | Timestamp                |`);
                console.log(`${'-'.repeat(140)}`);
                
                // Sort by subDomain for consistent display
                const sortedEntities = batchEntities.sort((a, b) => {
                    const order = { 'Contract': 1, 'ContractLine': 2, 'ContractCustomer': 3 };
                    return (order[a.subDomain] || 999) - (order[b.subDomain] || 999);
                });
                
                sortedEntities.forEach(entity => {
                    const timestamp = new Date(entity.timestamp * 1000).toISOString();
                    const subDomain = entity.subDomain || 'N/A';
                    const contractStatus = entity.contractStatus || 'N/A';
                    const country = entity.countryCode || 'N/A';
                    
                    console.log(`| ${String(contractId).padEnd(12)} | ${String(entity.id).padEnd(11)} | ${String(subDomain).padEnd(15)} | ${String(contractStatus).padEnd(15)} | ${String(country).padEnd(8)} | ${timestamp.padEnd(24)} |`);
                });
                console.log(`${'-'.repeat(140)}`);
                batchNumber++;
            }
        }

        // Processing Details
        if (processedContracts.length > 0) {
            console.log(`\n📊 PROCESSING DETAILS:`);
            console.log(`${'-'.repeat(220)}`);
            console.log(`| Contract ID  | Batch ID                                        | Status      | Integration Status         | Attempts | Emp Retry | Large Entity Type | Error Code | Error Message        | Salesforce Result | Timestamp                |`);
            console.log(`${'-'.repeat(220)}`);

            for (const [contractId, group] of contractGroups) {
                group.contracts.forEach(contract => {
                    const timestamp = new Date(contract.timestamp * 1000).toISOString();
                    const salesforceResult = contract.salesforceResponse?.result || 'N/A';
                    const errorCode = contract.errorStatusCode || 'N/A';
                    const errorMsg = (contract.errorMessage || 'N/A').substring(0, 20);
                    const largeEntity = contract.largeEntityType || 'N/A';
                    const integrationStatus = contract.integrationStatus || 'Unknown';
                    console.log(`| ${String(contractId).padEnd(12)} | ${String(contract.id).padEnd(48)} | ${String(contract.status || 'N/A').padEnd(11)} | ${String(integrationStatus).padEnd(26)} | ${String(contract.attempts).padEnd(8)} | ${String(contract.empRetryCount).padEnd(9)} | ${String(largeEntity).padEnd(17)} | ${String(errorCode).padEnd(10)} | ${String(errorMsg).padEnd(20)} | ${String(salesforceResult).padEnd(17)} | ${timestamp.padEnd(24)} |`);
                    
                    // Show integration comment if there are errors
                    if (contract.integrationComment && integrationStatus === 'Completed With Errors') {
                        console.log(`  ⚠️  Integration Error: ${contract.integrationComment}`);
                    }
                });
            }
            console.log(`${'-'.repeat(220)}`);
        }

        // Summary
        console.log(`\n📊 SUMMARY:`);
        console.log(`${'-'.repeat(60)}`);
        console.log(`Total Contract Groups: ${contractGroups.size}`);
        console.log(`Total Batches: ${processedContracts.length}`);
        
        // Integration Status Summary
        const integrationStatusCounts = {
            'Completed': 0,
            'Completed With Errors': 0,
            'Loading': 0,
            'Unknown': 0
        };
        
        for (const [contractId, group] of contractGroups) {
            const latestContract = group.contracts.sort((a, b) => b.timestamp - a.timestamp)[0];
            const status = latestContract?.integrationStatus || 'Unknown';
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
        
        // To get unique counts, we need to query the full documents and extract entity IDs
        const fullEntitiesQuery = {
            query: `
                SELECT c
                FROM c 
                WHERE ${contractId ? 'c.header.metadata.contractId = @contractId' : 'c.id = @batchId'}
            `,
            parameters: contractId 
                ? [{ name: "@contractId", value: contractId }]
                : [{ name: "@batchId", value: batchId }]
        };

        const fullEntitiesResult = await containers.entitiesContainer.items.query(fullEntitiesQuery).fetchAll();
        
        // Count unique entities using their actual entity IDs from the document
        const uniqueContracts = new Set();
        const uniqueCustomers = new Set();
        const uniqueLines = new Set();
        
        fullEntitiesResult.resources.forEach(item => {
            const entity = item.c || item;
            const subDomain = entity.header?.subDomain;
            
            if (subDomain === 'Contract') {
                // Use contractId as the unique identifier for Contract
                uniqueContracts.add(entity.header?.contract?.contractId || entity.header?.metadata?.contractId);
            } else if (subDomain === 'ContractCustomer') {
                // Use customerId as the unique identifier for ContractCustomer
                uniqueCustomers.add(entity.header?.contractCustomer?.customerId);
            } else if (subDomain === 'ContractLine') {
                // Use contractLineId as the unique identifier for ContractLine
                uniqueLines.add(entity.header?.contractLine?.contractLineId);
            }
        });
        
        console.log(`\n� Summary:`);
        console.log(`   - Contract: ${uniqueContracts.size}`);
        console.log(`   - Customers: ${uniqueCustomers.size}`);
        console.log(`   - Lines: ${uniqueLines.size}`);
        
        // Show per-batch breakdown (using partitionKey as batchId)
        const batchGroups = {};
        processedEntities.forEach(entity => {
            const batch = entity.partitionKey;
            if (!batchGroups[batch]) {
                batchGroups[batch] = { Contract: 0, ContractCustomer: 0, ContractLine: 0 };
            }
            batchGroups[batch][entity.subDomain]++;
        });
        
        const batchCount = Object.keys(batchGroups).length;
        console.log(`\n📦 Batches (${batchCount} total):`);
        Object.entries(batchGroups).forEach(([batch, counts]) => {
            const total = counts.Contract + counts.ContractCustomer + counts.ContractLine;
            console.log(`   ${batch}: Contract: ${counts.Contract}, Customers: ${counts.ContractCustomer}, Lines: ${counts.ContractLine} (Total: ${total})`);
        });

        return [];

    } catch (error) {
        console.error(`❌ [CONTRACTDETAILS-CONTRACTINFO] Error:`, error.message);
        return [];
    }
}
