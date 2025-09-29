// src/queries/today/todayfailed.js
import { generateCumulativeMetricsFromData } from "../../utils/metricsGenerator.js";

export const queries = [
    {
        name: "contractfailed_today",
        output: "metricsSeries",
        metricBase: "custom.dashboard.contractfailed.today",
        run: async (containers, win) => {
            console.log(`🔍 [CONTRACTFAILED-TODAY] Querying failed contract processing records...`);
            console.log(`🔍 [CONTRACTFAILED-TODAY] Time window: ${win.startSec} to ${win.endSec}`);
            
            try {
                // Query contract table for failed processing records within the time window
                const query = {
                    query: `
                        SELECT c.id, c.contractBatchId, c.contractId, c.largeEntityType, 
                               c.salesforceResponse, c._ts
                        FROM c 
                        WHERE c.salesforceResponse.result = "Failed"
                        AND c._ts >= @startSec
                        AND c._ts <= @endSec
                        ORDER BY c._ts DESC
                    `,
                    parameters: [
                        { name: "@startSec", value: win.startSec },
                        { name: "@endSec", value: win.endSec }
                    ]
                };

                console.log(`🔍 [CONTRACTFAILED-TODAY] Query parameters: @startSec=${win.startSec}, @endSec=${win.endSec}`);

                const result = await containers.contract.items.query(query).fetchAll();
                
                console.log(`✅ [CONTRACTFAILED-TODAY] Found ${result.resources.length} failed processing records`);

                if (result.resources.length === 0) {
                    console.log(`📊 [CONTRACTFAILED-TODAY] No failed records found for today`);
                    return [];
                }

                // Process failed records and group by entity type, error code, and error message
                const failedRecords = new Map();
                
                result.resources.forEach(record => {
                    const entity = record;
                    
                    // Extract error details
                    const errorCode = entity.salesforceResponse?.errors?.[0]?.statusCode || 'UNKNOWN';
                    let errorMessage = entity.salesforceResponse?.errors?.[0]?.message || 'UNKNOWN';
                    
                    // Special handling for Account-related errors
                    if (errorMessage.includes('Account_Identification__c in entity Account')) {
                        errorMessage = 'Account_doesnot_exists';
                    }
                    
                    // Create unique key for grouping
                    const key = `${entity.largeEntityType || 'Unknown'}_${errorCode}_${errorMessage}`;
                    
                    if (!failedRecords.has(key)) {
                        failedRecords.set(key, {
                            entityType: entity.largeEntityType || 'Unknown',
                            errorCode: errorCode,
                            errorMessage: errorMessage,
                            count: 0,
                            uniqueContracts: new Set()
                        });
                    }
                    
                    const recordData = failedRecords.get(key);
                    recordData.count++;
                    recordData.uniqueContracts.add(entity.contractId);
                });

                console.log(`📊 [CONTRACTFAILED-TODAY] Processing ${failedRecords.size} unique failure combinations`);

                // Generate metrics for each failure combination
                const metrics = [];
                
                for (const [key, data] of failedRecords) {
                    const metric = {
                        labels: {
                            entity_type: data.entityType,
                            error_code: data.errorCode,
                            error_message: data.errorMessage,
                            country: 'total',
                            window: 'today'
                        },
                        value: data.count
                    };
                    
                    metrics.push(metric);
                    
                    console.log(`📈 [CONTRACTFAILED-TODAY] ${data.entityType} | ${data.errorCode} | ${data.errorMessage} | Count: ${data.count} | Unique Contracts: ${data.uniqueContracts.size}`);
                }

                console.log(`✅ [CONTRACTFAILED-TODAY] Generated ${metrics.length} failure metrics`);
                return metrics;

            } catch (error) {
                console.error(`❌ [CONTRACTFAILED-TODAY] Error:`, error.message);
                return [];
            }
        }
    }
];
