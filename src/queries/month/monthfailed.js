
export const queries = [
    {
        name: "contractfailed_month",
        output: "metricsSeries",
        metricBase: "custom.dashboard.contractfailed.month",
        run: async (containers, win) => {
            console.log(`🔍 [CONTRACTFAILED-MONTH] Querying failed contract processing records...`);
            console.log(`🔍 [CONTRACTFAILED-MONTH] Time window: ${win.startSec} to ${win.endSec}`);
            
            try {
                // Query contract table for failed processing records within the time window
                const query = {
                    query: `
                        SELECT c.id, c.contractBatchId, c.contractId, c.largeEntityType, 
                               c.salesforceResponse, c.empRetryCount, c._ts
                        FROM c WHERE 1=1 
                        
                        AND IS_DEFINED(c.salesforceResponse) AND IS_DEFINED(c.salesforceResponse.result)
                        AND (c.salesforceResponse.result = "Failed" OR CONTAINS(LOWER(c.salesforceResponse.result), "permanent"))
                        AND c._ts >= @startSec
                        AND c._ts < @endSec
                        ORDER BY c._ts DESC
                    `,
                    parameters: [
                        { name: "@startSec", value: win.startSec },
                        { name: "@endSec", value: win.endSec }
                    ]
                };

                console.log(`🔍 [CONTRACTFAILED-MONTH] Query parameters: @startSec=${win.startSec}, @endSec=${win.endSec}`);

                const result = await containers.contract.items.query(query).fetchAll();
                
                console.log(`✅ [CONTRACTFAILED-MONTH] Found ${result.resources.length} failed processing records`);

                if (result.resources.length === 0) {
                    console.log(`📊 [CONTRACTFAILED-MONTH] No failed records found for month, returning zero metrics`);
                    // Return zero metrics for both failure types and both error patterns
                    return [
                        // Account_doesnot_exists pattern - failed
                        {
                            value: 0,
                            labels: {
                                entity_type: 'ContractCustomer',
                                error_code: 'INVALID_FIELD',
                                error_message: 'Account_doesnot_exists',
                                failure_type: 'failed',
                                country: 'total',
                                window: 'month'
                            }
                        },
                        // Account_doesnot_exists pattern - permanently_failed
                        {
                            value: 0,
                            labels: {
                                entity_type: 'ContractCustomer',
                                error_code: 'INVALID_FIELD',
                                error_message: 'Account_doesnot_exists',
                                failure_type: 'permanently_failed',
                                country: 'total',
                                window: 'month'
                            }
                        },
                        // Other errors pattern - failed
                        {
                            value: 0,
                            labels: {
                                entity_type: 'ContractCustomer',
                                error_code: 'other',
                                error_message: 'other',
                                failure_type: 'failed',
                                country: 'total',
                                window: 'month'
                            }
                        },
                        // Other errors pattern - permanently_failed
                        {
                            value: 0,
                            labels: {
                                entity_type: 'ContractCustomer',
                                error_code: 'other',
                                error_message: 'other',
                                failure_type: 'permanently_failed',
                                country: 'total',
                                window: 'month'
                            }
                        },
                        // Total unique contracts failed metric
                        {
                            value: 0,
                            labels: {
                                country: 'total',
                                window: 'month'
                            }
                        }
                    ];
                }

                const failedRecordsRaw = result.resources;
                
                // DEDUPLICATION: Keep only the most recent failure for each contractId
                console.log(`🔍 [CONTRACTFAILED-MONTH] Deduplicating failed records by contractId...`);
                const latestFailureByContract = new Map(); // contractId -> latest failed record
                
                failedRecordsRaw.forEach(record => {
                    const contractId = record.contractId;
                    const timestamp = record._ts;
                    
                    if (!latestFailureByContract.has(contractId)) {
                        latestFailureByContract.set(contractId, record);
                    } else {
                        const existing = latestFailureByContract.get(contractId);
                        if (timestamp > existing._ts) {
                            console.log(`🔄 [CONTRACTFAILED-MONTH] Replaced older failure for contract ${contractId} (old ts: ${existing._ts}, new ts: ${timestamp})`);
                            latestFailureByContract.set(contractId, record);
                        }
                    }
                });
                
                const deduplicatedFailures = Array.from(latestFailureByContract.values());
                console.log(`✅ [CONTRACTFAILED-MONTH] After deduplication: ${failedRecordsRaw.length} records -> ${deduplicatedFailures.length} unique contracts with latest failures\n`);
                
                // Log details of each unique failed record
                console.log(`📋 [CONTRACTFAILED-MONTH] Failed Record Details (Latest per Contract):`);
                deduplicatedFailures.forEach((record, idx) => {
                    console.log(`\n   Record ${idx + 1}:`);
                    console.log(`   ├─ ID: ${record.id}`);
                    console.log(`   ├─ Contract ID: ${record.contractId}`);
                    console.log(`   ├─ Batch ID: ${record.contractBatchId}`);
                    console.log(`   ├─ Entity Type: ${record.largeEntityType}`);
                    console.log(`   ├─ Retry Count: ${record.empRetryCount || 0}`);
                    console.log(`   ├─ Timestamp: ${new Date(record._ts * 1000).toISOString()}`);
                    console.log(`   └─ Salesforce Result: ${record.salesforceResponse?.result || 'N/A'}`);
                    if (record.salesforceResponse?.errors?.length > 0) {
                        record.salesforceResponse.errors.forEach((error, errIdx) => {
                            console.log(`      Error ${errIdx + 1}: ${error.statusCode} - ${error.message}`);
                        });
                    }
                });
                console.log(`\n`);

                const failedRecordsGrouped = new Map(); // Key: entityType|errorCode|errorMessage|failureType

                deduplicatedFailures.forEach(record => {
                    const entityType = record.largeEntityType || 'Unknown';
                    let errorCode = 'UNKNOWN_ERROR';
                    let errorMessage = 'Unknown Error Message';
                    let failureType = 'unknown';

                    // Determine failure type
                    if (record.salesforceResponse?.result === "Failed") {
                        failureType = 'failed';
                    } else if (record.salesforceResponse?.result && record.salesforceResponse.result.toLowerCase().includes("permanent")) {
                        failureType = 'permanently_failed';
                    }

                    if (record.salesforceResponse?.errors && record.salesforceResponse.errors.length > 0) {
                        const error = record.salesforceResponse.errors[0];
                        errorCode = error.statusCode || 'UNKNOWN_ERROR';
                        errorMessage = error.message || 'Unknown Error Message';

                        // Special handling for Account_doesnot_exists
                        if (errorCode === 'INVALID_FIELD' && errorMessage.includes('Account_Identification__c in entity Account')) {
                            errorMessage = 'Account_doesnot_exists';
                        } else {
                            // Normalize other errors to 'other'
                            errorCode = 'other';
                            errorMessage = 'other';
                        }
                    } else {
                        // If no specific error details, normalize to 'other'
                        errorCode = 'other';
                        errorMessage = 'other';
                    }

                    const key = `${entityType}|${errorCode}|${errorMessage}|${failureType}`;
                    if (!failedRecordsGrouped.has(key)) {
                        failedRecordsGrouped.set(key, {
                            entityType,
                            errorCode,
                            errorMessage,
                            failureType,
                            count: 0,
                            uniqueContracts: new Set(),
                        });
                    }
                    const data = failedRecordsGrouped.get(key);
                    data.count++;
                    data.uniqueContracts.add(record.id);
                });

                const metrics = [];
                const windowLabel = win.label || "month";

                failedRecordsGrouped.forEach((data) => {
                    console.log(`📈 [CONTRACTFAILED-MONTH] ${data.entityType} | ${data.errorCode} | ${data.errorMessage} | Failure Type: ${data.failureType} | Count: ${data.count} | Unique Contracts: ${data.uniqueContracts.size}`);
                    metrics.push({
                        value: data.count,
                        labels: {
                            entity_type: data.entityType,
                            error_code: data.errorCode,
                            error_message: data.errorMessage,
                            failure_type: data.failureType,
                            country: 'total', // Assuming total for month
                            window: windowLabel
                        }
                    });
                });

                // Always send zero metrics for "other" errors if not present
                const ensureMetricExists = (errorCode, errorMessage, failureType) => {
                    const key = `ContractCustomer|${errorCode}|${errorMessage}|${failureType}`;
                    if (!failedRecordsGrouped.has(key)) {
                        console.log(`📊 [CONTRACTFAILED-MONTH] Adding zero metric: ContractCustomer | ${errorCode} | ${errorMessage} | ${failureType}`);
                        metrics.push({
                            value: 0,
                            labels: {
                                entity_type: 'ContractCustomer',
                                error_code: errorCode,
                                error_message: errorMessage,
                                failure_type: failureType,
                                country: 'total',
                                window: windowLabel
                            }
                        });
                    }
                };

                // Ensure "other" metrics exist for both failure types
                ensureMetricExists('other', 'other', 'failed');
                ensureMetricExists('other', 'other', 'permanently_failed');

                // Add total unique contracts failed metric (independent of error types)
                const totalUniqueContracts = deduplicatedFailures.length;
                console.log(`📊 [CONTRACTFAILED-MONTH] Adding total unique contracts failed metric: ${totalUniqueContracts} unique contracts`);
                metrics.push({
                    value: totalUniqueContracts,
                    labels: {
                        country: 'total',
                        window: windowLabel
                    }
                });

                console.log(`✅ [CONTRACTFAILED-MONTH] Generated ${metrics.length} failure metrics`);
                return metrics;

            } catch (error) {
                console.error(`❌ [CONTRACTFAILED-MONTH] Error:`, error.message);
                console.error(`📋 Stack trace:`, error.stack);
                // Return zero metrics for all patterns even on error
                return [
                    {
                        value: 0,
                        labels: {
                            entity_type: 'ContractCustomer',
                            error_code: 'INVALID_FIELD',
                            error_message: 'Account_doesnot_exists',
                            failure_type: 'failed',
                            country: 'total',
                            window: 'month'
                        }
                    },
                    {
                        value: 0,
                        labels: {
                            entity_type: 'ContractCustomer',
                            error_code: 'INVALID_FIELD',
                            error_message: 'Account_doesnot_exists',
                            failure_type: 'permanently_failed',
                            country: 'total',
                            window: 'month'
                        }
                    },
                    {
                        value: 0,
                        labels: {
                            entity_type: 'ContractCustomer',
                            error_code: 'other',
                            error_message: 'other',
                            failure_type: 'failed',
                            country: 'total',
                            window: 'month'
                        }
                    },
                    {
                        value: 0,
                        labels: {
                            entity_type: 'ContractCustomer',
                            error_code: 'other',
                            error_message: 'other',
                            failure_type: 'permanently_failed',
                            country: 'total',
                            window: 'month'
                        }
                    }
                ];
            }
        }
    }
];
