import { generateCumulativeMetricsFromData } from "../../utils/metricsGenerator.js";

export const queries = [
    {
        name: "contractfailed_overall",
        output: "metricsSeries",
        metricBase: "custom.dashboard.contractfailed.overall",
        run: async (containers, win) => {
            console.log(`🔍 [CONTRACTFAILED-OVERALL] Querying failed contract processing records...`);
            console.log(`🔍 [CONTRACTFAILED-OVERALL] Time window: ${win.startSec} to ${win.endSec}`);
            
            try {
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
                        { name: "@endSec", value: win.endSec },
                    ],
                };

                console.log(`🔍 [CONTRACTFAILED-OVERALL] Query parameters: @startSec=${query.parameters[0].value}, @endSec=${query.parameters[1].value}`);

                const { resources: failedRecordsRaw } = await containers.contract.items.query(query).fetchAll();
                console.log(`✅ [CONTRACTFAILED-OVERALL] Found ${failedRecordsRaw.length} failed processing records`);

                if (failedRecordsRaw.length === 0) {
                    console.log(`📊 [CONTRACTFAILED-OVERALL] No failed records found for overall period, returning zero metrics for all patterns`);
                    return [
                        // Zero metrics for Account_doesnot_exists - failed
                        {
                            value: 0,
                            labels: {
                                entity_type: 'ContractCustomer',
                                error_code: 'INVALID_FIELD',
                                error_message: 'Account_doesnot_exists',
                                failure_type: 'failed',
                                country: 'total',
                                window: 'overall'
                            }
                        },
                        // Zero metrics for Account_doesnot_exists - permanently_failed
                        {
                            value: 0,
                            labels: {
                                entity_type: 'ContractCustomer',
                                error_code: 'INVALID_FIELD',
                                error_message: 'Account_doesnot_exists',
                                failure_type: 'permanently_failed',
                                country: 'total',
                                window: 'overall'
                            }
                        },
                        // Zero metrics for other errors - failed
                        {
                            value: 0,
                            labels: {
                                entity_type: 'ContractCustomer',
                                error_code: 'other',
                                error_message: 'other',
                                failure_type: 'failed',
                                country: 'total',
                                window: 'overall'
                            }
                        },
                        // Zero metrics for other errors - permanently_failed
                        {
                            value: 0,
                            labels: {
                                entity_type: 'ContractCustomer',
                                error_code: 'other',
                                error_message: 'other',
                                failure_type: 'permanently_failed',
                                country: 'total',
                                window: 'overall'
                            }
                        }
                    ];
                }

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
                const windowLabel = win.label || "overall";

                failedRecordsGrouped.forEach((data) => {
                    console.log(`📈 [CONTRACTFAILED-OVERALL] ${data.entityType} | ${data.errorCode} | ${data.errorMessage} | Failure Type: ${data.failureType} | Count: ${data.count} | Unique Contracts: ${data.uniqueContracts.size}`);
                    metrics.push({
                        value: data.count,
                        labels: {
                            entity_type: data.entityType,
                            error_code: data.errorCode,
                            error_message: data.errorMessage,
                            failure_type: data.failureType,
                            country: 'total',
                            window: windowLabel
                        }
                    });
                });

                console.log(`✅ [CONTRACTFAILED-OVERALL] Generated ${metrics.length} failure metrics`);
                return metrics;

            } catch (error) {
                console.error(`❌ [CONTRACTFAILED-OVERALL] Error:`, error.message);
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
                            window: 'overall'
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
                            window: 'overall'
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
                            window: 'overall'
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
                            window: 'overall'
                        }
                    }
                ];
            }
        }
    }
];
