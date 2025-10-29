
export const queries = [
    {
        name: "contractfailed_week",
        output: "metricsSeries",
        metricBase: "custom.dashboard.contractfailed.week",
        run: async (containers, win) => {
            console.log(`🔍 [CONTRACTFAILED-WEEK] Querying failed contract processing records...`);
            console.log(`🔍 [CONTRACTFAILED-WEEK] Time window: ${win.startSec} to ${win.endSec}`);
            
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

                console.log(`🔍 [CONTRACTFAILED-WEEK] Query parameters: @startSec=${win.startSec}, @endSec=${win.endSec}`);

                const result = await containers.contract.items.query(query).fetchAll();
                
                console.log(`✅ [CONTRACTFAILED-WEEK] Found ${result.resources.length} failed processing records`);

                if (result.resources.length === 0) {
                    console.log(`📊 [CONTRACTFAILED-WEEK] No failed records found for week, returning zero metrics`);
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
                                window: 'week'
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
                                window: 'week'
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
                                window: 'week'
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
                                window: 'week'
                            }
                        },
                        // Total unique contracts failed metric
                        {
                            value: 0,
                            labels: {
                                country: 'total',
                                window: 'week'
                            }
                        }
                    ];
                }

                const failedRecordsRaw = result.resources;
                
                // DEDUPLICATION: Keep only the most recent failure for each contractId
                console.log(`🔍 [CONTRACTFAILED-WEEK] Deduplicating failed records by contractId...`);
                const latestFailureByContract = new Map(); // contractId -> latest failed record
                
                failedRecordsRaw.forEach(record => {
                    const contractId = record.contractId;
                    const timestamp = record._ts;
                    
                    if (!latestFailureByContract.has(contractId)) {
                        latestFailureByContract.set(contractId, record);
                    } else {
                        const existing = latestFailureByContract.get(contractId);
                        if (timestamp > existing._ts) {
                            console.log(`🔄 [CONTRACTFAILED-WEEK] Replaced older failure for contract ${contractId} (old ts: ${existing._ts}, new ts: ${timestamp})`);
                            latestFailureByContract.set(contractId, record);
                        }
                    }
                });
                
                const deduplicatedFailures = Array.from(latestFailureByContract.values());
                console.log(`✅ [CONTRACTFAILED-WEEK] After deduplication: ${failedRecordsRaw.length} records -> ${deduplicatedFailures.length} unique contracts with latest failures\n`);
                
                // Log details of each unique failed record
                console.log(`📋 [CONTRACTFAILED-WEEK] Failed Record Details (Latest per Contract):`);
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
                const windowLabel = win.label || "week";

                failedRecordsGrouped.forEach((data) => {
                    console.log(`📈 [CONTRACTFAILED-WEEK] ${data.entityType} | ${data.errorCode} | ${data.errorMessage} | Failure Type: ${data.failureType} | Count: ${data.count} | Unique Contracts: ${data.uniqueContracts.size}`);
                    metrics.push({
                        value: data.count,
                        labels: {
                            entity_type: data.entityType,
                            error_code: data.errorCode,
                            error_message: data.errorMessage,
                            failure_type: data.failureType,
                            country: 'total', // Assuming total for week
                            window: windowLabel
                        }
                    });
                });

                // Always send zero metrics for "other" errors if not present
                const ensureMetricExists = (errorCode, errorMessage, failureType) => {
                    const key = `ContractCustomer|${errorCode}|${errorMessage}|${failureType}`;
                    if (!failedRecordsGrouped.has(key)) {
                        console.log(`📊 [CONTRACTFAILED-WEEK] Adding zero metric: ContractCustomer | ${errorCode} | ${errorMessage} | ${failureType}`);
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

                // Ensure all metric patterns exist for both failure types
                ensureMetricExists('INVALID_FIELD', 'Account_doesnot_exists', 'failed');
                ensureMetricExists('INVALID_FIELD', 'Account_doesnot_exists', 'permanently_failed');
                ensureMetricExists('other', 'other', 'failed');
                ensureMetricExists('other', 'other', 'permanently_failed');

                // Add total unique contracts failed metric (independent of error types)
                const totalUniqueContracts = deduplicatedFailures.length;
                console.log(`📊 [CONTRACTFAILED-WEEK] Adding total unique contracts failed metric: ${totalUniqueContracts} unique contracts`);
                metrics.push({
                    value: totalUniqueContracts,
                    labels: {
                        country: 'total',
                        window: windowLabel
                    }
                });

                console.log(`✅ [CONTRACTFAILED-WEEK] Generated ${metrics.length} failure metrics`);
                return metrics;

            } catch (error) {
                console.error(`❌ [CONTRACTFAILED-WEEK] Error:`, error.message);
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
                            window: 'week'
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
                            window: 'week'
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
                            window: 'week'
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
                            window: 'week'
                        }
                    }
                ];
            }
        }
    }
];
