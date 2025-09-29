// src/queries/debug/contractinfo.js
import { generateCumulativeMetricsFromData } from "../../utils/metricsGenerator.js";

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
        
        console.log(`✅ [CONTRACTDETAILS-CONTRACTINFO] Found ${contractResult.resources.length} contract records`);

        // Extract contract processing data with correct field names
        const processedContracts = contractResult.resources.map(item => {
            const contract = item.c || item; // Handle both formats
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
        console.log(`| Contract ID  | Country  | Status     | PartitionKeys   | Total Docs   | Contract | ContractLine | ContractCustomer | Processing Status | Attempts |`);
        console.log(`${'-'.repeat(140)}`);

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
            
            // Get processing status
            const latestContract = group.contracts.sort((a, b) => b.timestamp - a.timestamp)[0];
            const processingStatus = latestContract?.status || 'N/A';
            const attempts = latestContract?.attempts || 'N/A';

            console.log(`| ${String(contractId).padEnd(12)} | ${String(group.country).padEnd(8)} | ${String(contractStatus).padEnd(11)} | ${String(partitionKeys.length).padEnd(15)} | ${String(group.entities.length).padEnd(12)} | ${String(subDomainCounts.Contract).padEnd(8)} | ${String(subDomainCounts.ContractLine).padEnd(12)} | ${String(subDomainCounts.ContractCustomer).padEnd(16)} | ${String(processingStatus).padEnd(18)} | ${String(attempts).padEnd(8)} |`);
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
            console.log(`${'-'.repeat(140)}`);
            console.log(`| Contract ID  | Batch ID                                        | Status      | Attempts | Emp Retry | Large Entity Type | Error Code | Error Message | Salesforce Result | Timestamp                |`);
            console.log(`${'-'.repeat(140)}`);

            for (const [contractId, group] of contractGroups) {
                group.contracts.forEach(contract => {
                    const timestamp = new Date(contract.timestamp * 1000).toISOString();
                    const salesforceResult = contract.salesforceResponse?.result || 'N/A';
                    console.log(`| ${String(contractId).padEnd(12)} | ${String(contract.id).padEnd(48)} | ${String(contract.status || 'N/A').padEnd(11)} | ${String(contract.attempts).padEnd(8)} | ${String(contract.empRetryCount).padEnd(9)} | ${String(contract.largeEntityType).padEnd(16)} | ${String(contract.errorStatusCode).padEnd(10)} | ${String(contract.errorMessage).padEnd(20)} | ${String(salesforceResult).padEnd(17)} | ${timestamp.padEnd(24)} |`);
                });
            }
            console.log(`${'-'.repeat(140)}`);
        }

        // Summary
        console.log(`\n📊 SUMMARY:`);
        console.log(`${'-'.repeat(60)}`);
        console.log(`Total Contract Groups: ${contractGroups.size}`);
        console.log(`Total Entities: ${processedEntities.length}`);
        console.log(`Total Contract Records: ${processedContracts.length}`);

        return [];

    } catch (error) {
        console.error(`❌ [CONTRACTDETAILS-CONTRACTINFO] Error:`, error.message);
        return [];
    }
}
