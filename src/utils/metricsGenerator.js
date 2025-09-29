// src/utils/metricsGenerator.js
import { mapEntityStatusToReadable } from "./status.js";

// All possible statuses for contractreceived queries
const allStatuses = [
    "successfully_received",
    "failed_to_receive",
    "successfully_received_unique",
    "failed_to_receive_unique"
];

// All possible statuses for contractprocessed queries (using simple names for Dynatrace compatibility)
const allProcessedStatuses = [
    "inprogress",
    "completed",
    "partial_complete",
    "failed",
    "permanentlyfailed",
    "inprogress_unique",
    "completed_unique",
    "partial_complete_unique",
    "failed_unique",
    "permanentlyfailed_unique"
];

// All possible contract statuses (using raw codes that match the data)
const allContractStatuses = [
    "c",  // active
    "d",  // draft
    "e",  // expired
    "p",  // pending
    "v",  // reviewed
    "a",  // approved
    "r",  // rejected
    "s",  // submitted
    "all" // all contract statuses combined
];

// All possible countries
const allCountries = ["au", "nz", "total"];

// All possible windows
const allWindows = ["today", "overall"];

/**
 * Generate all possible metric combinations for contractreceived queries
 * @param {string} targetWindow - The specific window to generate combinations for ("today" or "overall")
 */
export function generateAllMetricCombinations(targetWindow) {
    const combinations = [];
    const windowsToUse = targetWindow ? [targetWindow] : allWindows; // Use targetWindow if provided, else all

    for (const status of allStatuses) {
        for (const contractStatus of allContractStatuses) {
            for (const country of allCountries) {
                for (const window of windowsToUse) {
                    combinations.push({
                        status,
                        contractstatus: contractStatus,
                        country,
                        window
                    });
                }
            }
        }
    }
    
    return combinations;
}

/**
 * Generate all possible metric combinations for contractprocessed queries
 * @param {string} targetWindow - The specific window to generate combinations for ("today" or "overall")
 */
export function generateAllProcessedMetricCombinations(targetWindow) {
    const combinations = [];
    const windowsToUse = targetWindow ? [targetWindow] : allWindows; // Use targetWindow if provided, else all
    
    for (const status of allProcessedStatuses) {
        for (const contractStatus of allContractStatuses) {
            for (const country of allCountries) {
                for (const window of windowsToUse) {
                    combinations.push({
                        status,
                        contractstatus: contractStatus,
                        country,
                        window
                    });
                }
            }
        }
    }
    return combinations;
}

/**
 * Generate metrics from aggregated data for contractreceived queries
 */
export function generateMetricsFromData(agg, window) {
    const results = [];
    
    // Generate all possible combinations for contractreceived only
    const allCombinations = generateAllMetricCombinations(window); // Pass the window here
    
    for (const combo of allCombinations) {
        const key = `${combo.status}|${combo.country}|${combo.contractstatus}|0`;
        const value = agg.get(key) || 0;
        
        results.push({
            labels: {
                status: combo.status,
                contractstatus: mapEntityStatusToReadable(combo.contractstatus),
                country: combo.country,
                window: combo.window
            },
            value
        });
    }
    
    return results;
}

/**
 * Generate metrics from aggregated data for contractprocessed queries
 */
export function generateProcessedMetricsFromData(agg, window) {
    const results = [];
    
    // Generate all possible combinations for contractprocessed only
    const allProcessedCombinations = generateAllProcessedMetricCombinations(window); // Pass the window here
    
    for (const combo of allProcessedCombinations) {
        const key = `${combo.status}|${combo.country}|${combo.contractstatus}|0`;
        const value = agg.get(key) || 0;
        
        results.push({
            labels: {
                status: combo.status,
                contractstatus: mapEntityStatusToReadable(combo.contractstatus),
                country: combo.country,
                window: combo.window
            },
            value
        });
    }
    
    return results;
}

/**
 * Generate cumulative metrics from aggregated data (sum across all attempts) - CONTRACTRECEIVED ONLY
 */
export function generateCumulativeMetricsFromData(agg, window) {
    const results = [];
    
    // Generate all possible combinations for contractreceived only
    const allCombinations = generateAllMetricCombinations(window); // Pass the window here
    
    for (const combo of allCombinations) {
        const key = `${combo.status}|${combo.country}|${combo.contractstatus}|0`;
        const value = agg.get(key) || 0;
        
        results.push({
            labels: {
                status: combo.status,
                contractstatus: mapEntityStatusToReadable(combo.contractstatus),
                country: combo.country,
                window: combo.window
            },
            value
        });
    }
    
    return results;
}

/**
 * Generate cumulative metrics from aggregated data (sum across all attempts) - CONTRACTPROCESSED ONLY
 */
export function generateProcessedCumulativeMetricsFromData(agg, window) {
    const results = [];
    
    // Generate all possible combinations for contractprocessed only
    const allProcessedCombinations = generateAllProcessedMetricCombinations(window); // Pass the window here
    
    for (const combo of allProcessedCombinations) {
        const key = `${combo.status}|${combo.country}|${combo.contractstatus}|0`;
        const value = agg.get(key) || 0;
        
        results.push({
            labels: {
                status: combo.status,
                contractstatus: mapEntityStatusToReadable(combo.contractstatus),
                country: combo.country,
                window: combo.window
            },
            value
        });
    }
    
    return results;
}

/**
 * Generate all metrics from data (both detailed and cumulative)
 */
export function generateAllMetricsFromData(agg, window) {
    const results = [];
    
    // Generate cumulative metrics (sum across all attempts) - ONLY THESE
    const cumulativeMetrics = generateCumulativeMetricsFromData(agg, window);
    results.push(...cumulativeMetrics);
    
    return results;
}
