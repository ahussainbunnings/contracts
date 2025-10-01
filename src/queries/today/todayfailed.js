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

                console.log(`🔍 [CONTRACTFAILED-TODAY] Query parameters: @startSec=${win.startSec}, @endSec=${win.endSec}`);

                const result = await containers.contract.items.query(query).fetchAll();
                
                console.log(`✅ [CONTRACTFAILED-TODAY] Found ${result.resources.length} failed processing records`);

                if (result.resources.length === 0) {
                    console.log(`📊 [CONTRACTFAILED-TODAY] No failed records found for today, returning zero metrics`);
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
                                window: 'today'
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
                                window: 'today'
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
                                window: 'today'
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
                                window: 'today'
                            }
                        }
                    ];
                }

                const failedRecordsRaw = result.resources;
                const failedRecordsGrouped = new Map(); // Key: entityType|errorCode|errorMessage|failureType

                failedRecordsRaw.forEach(record => {
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
                const windowLabel = win.label || "today";

                failedRecordsGrouped.forEach((data) => {
                    console.log(`📈 [CONTRACTFAILED-TODAY] ${data.entityType} | ${data.errorCode} | ${data.errorMessage} | Failure Type: ${data.failureType} | Count: ${data.count} | Unique Contracts: ${data.uniqueContracts.size}`);
                    metrics.push({
                        value: data.count,
                        labels: {
                            entity_type: data.entityType,
                            error_code: data.errorCode,
                            error_message: data.errorMessage,
                            failure_type: data.failureType,
                            country: 'total', // Assuming total for today
                            window: windowLabel
                        }
                    });
                });

                console.log(`✅ [CONTRACTFAILED-TODAY] Generated ${metrics.length} failure metrics`);
                return metrics;

            } catch (error) {
                console.error(`❌ [CONTRACTFAILED-TODAY] Error:`, error.message);
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
                            window: 'today'
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
                            window: 'today'
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
                            window: 'today'
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
                            window: 'today'
                        }
                    }
                ];
            }
        }
    }
];
