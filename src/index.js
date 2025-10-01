// src/index.js
import { getCosmos } from "./connections/cosmos.js";
import { sendMetrics } from "./connections/dynatrace.js";
import { todayWindow, allTimeWindow, logWindow } from "./utils/windows.js";
import { displayQueryResults } from "./utils/metricsDisplay.js";
import { displayDashboardSummary, createQuerySummary } from "./utils/dashboardSummary.js";
import { displaySuperCleanSummary } from "./utils/superCleanDisplay.js";
import { DateTime } from "luxon";

// Parse command line arguments
const args = process.argv.slice(2);
const config = {
    mode: args[0] || 'today',
    timeWindow: args[1] || 'today'
};

// Validate configuration
if (!['today', 'all'].includes(config.mode)) {
    console.error("❌ Invalid mode. Use 'today' or 'all'");
    process.exit(1);
}

if (!['today', 'overall'].includes(config.timeWindow)) {
    console.error("❌ Invalid time window. Use 'today' or 'overall'");
    process.exit(1);
}

// Summary displayed above
console.log(`🚀 DASHBOARD STARTING - RESTRUCTURED QUERY SYSTEM`);
// Summary displayed above
console.log(`🏷️ Environment: ${process.env.ENVIRONMENT || 'UNKNOWN'}`);
console.log(`🔧 Service: dashboard`);
console.log(`📋 Mode: ${config.mode.toUpperCase()}`);
console.log(`📅 Time Window: ${config.timeWindow.toUpperCase()}`);
console.log(`🕐 Current Melbourne Time: ${DateTime.now().setZone('Australia/Melbourne').toFormat('dd/MM/yyyy, HH:mm:ss')} Australia/Melbourne`);
// Summary displayed above

// Load query files based on mode and time window
async function loadQueryFiles(mode, timeWindow) {
    const queryFiles = [];
    
    try {
        // Determine the folder to load from based on mode
        const folder = mode === 'all' ? 'overall' : timeWindow;
        
        // Load received queries
        const receivedModule = await import(`./queries/${folder}/${folder}received.js`);
        if (receivedModule.queries) {
            queryFiles.push(...receivedModule.queries);
        }
        
        // Load processed queries
        const processedModule = await import(`./queries/${folder}/${folder}processed.js`);
        if (processedModule.queries) {
            queryFiles.push(...processedModule.queries);
        }
        
        // Load failed queries
        const failedModule = await import(`./queries/${folder}/${folder}failed.js`);
        if (failedModule.queries) {
            queryFiles.push(...failedModule.queries);
        }
        
        return queryFiles;
    } catch (error) {
        console.error(`❌ Error loading query files for ${mode}/${timeWindow}:`, error.message);
        return [];
    }
}

async function main() {
    let windowToUse;
    
    // Determine time window based on mode
    if (config.mode === 'all') {
        windowToUse = allTimeWindow();
        console.log(`📅 Using ALL-TIME window (no time filter)`);
    } else {
        windowToUse = todayWindow();
        console.log(`📅 Using TODAY window (Melbourne timezone)`);
    }
    
    // Print detailed time window information
    logWindow(config.timeWindow.toUpperCase(), windowToUse);
    
    // Get Cosmos DB connection using Key Vault
    const { containers } = await getCosmos();
    
    // Load queries based on mode and time window
    let queries = [];
    console.log(`🔍 Loading ${config.mode.toUpperCase()} query modules...`);
    queries = await loadQueryFiles(config.mode, config.timeWindow);
    
    console.log(`📊 LOADED ${queries.length} QUERY MODULES:`);
    queries.forEach((q, i) => console.log(`   ${i + 1}. ${q.name}`));
    // Summary displayed above
    
    let totalMetricsSent = 0;
    const queryResults = [];
    
    // Execute each query
    for (const mod of queries) {
        try {
            displaySuperCleanSummary(queryResults, totalMetricsSent, windowToUse);
            console.log(`🔍 PROCESSING: ${mod.name.toUpperCase()}`);
            // Summary displayed above
            
            // Print detailed time window information
            logWindow(config.timeWindow.toUpperCase(), windowToUse);
            
            const result = await mod.run(containers, windowToUse);
            
            if (result && result.length > 0) {
                console.log(`✅ ${mod.name}: ${result.length} series`);
                
                // Send to Dynatrace
                const timestamp = Date.now();
                const envLower = (process.env.ENVIRONMENT || 'UNKNOWN').toLowerCase();
                
                let cumulativePayloadLines = result.map(r => {
                    let labels = Object.keys(r.labels)
                        .filter(key => r.labels[key] !== undefined) // Filter out undefined labels
                        .map(key => `${key}=${r.labels[key]}`)
                        .join(',');
                    
                    // Add environment label
                    labels += `,env=${envLower}`;
                    
                    return `${mod.metricBase},${labels} gauge,${r.value} ${timestamp}`;
                });
                
                // Clean display: show only essential info
                console.log(`✅ ${mod.name}: ${result.length} metrics sent to Dynatrace`);
                // Display handled by displayQueryResults
                // Display handled by displayQueryResults
                
                const sendResult = await sendMetrics(cumulativePayloadLines);
                console.log(`✅ Successfully sent ${sendResult.linesOk} metrics to Dynatrace`);
                if (sendResult.linesInvalid > 0) {
                    console.error(`❌ Failed to send ${sendResult.linesInvalid} metrics:`, sendResult.invalidLines);
                }
                
                totalMetricsSent += sendResult.linesOk;
                // Store result for summary
                queryResults.push(createQuerySummary(mod.name, result));
                
            } else {
                console.log(`❌ ${mod.name}: No data found`);
            }
        } catch (error) {
            console.error(`❌ Error processing ${mod.name}:`, error.message);
            console.error(`📋 Stack trace:`, error.stack);
        }
    }
    
    displaySuperCleanSummary(queryResults, totalMetricsSent, windowToUse);
    // Summary displayed above
    // Summary displayed above
    // Summary displayed above
}

// Run the dashboard
main().catch(console.error);
