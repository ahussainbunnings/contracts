// src/index.js
import { getCosmos } from "./connections/cosmos.js";
import { sendMetrics } from "./connections/dynatrace.js";
import { todayWindow, allTimeWindow, logWindow } from "./utils/windows.js";
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

if (!['today', 'overall', 'week', 'month'].includes(config.timeWindow)) {
    console.error("❌ Invalid time window. Use 'today', 'overall', 'week', or 'month'");
    process.exit(1);
}

console.log(`${'='.repeat(80)}`);
console.log(`🚀 DASHBOARD STARTING - RESTRUCTURED QUERY SYSTEM`);
console.log(`${'='.repeat(80)}`);
console.log(`🏷️ Environment: ${process.env.ENVIRONMENT || 'UNKNOWN'}`);
console.log(`🔧 Service: dashboard`);
console.log(`📋 Mode: ${config.mode.toUpperCase()}`);
console.log(`📅 Time Window: ${config.timeWindow.toUpperCase()}`);
console.log(`🕐 Current Melbourne Time: ${DateTime.now().setZone('Australia/Melbourne').toFormat('dd/MM/yyyy, HH:mm:ss')} Australia/Melbourne`);
console.log(`${'='.repeat(80)}`);

// Load query files based on time window
async function loadQueryFiles(timeWindow) {
    const queryFiles = [];
    
    try {
        // Load received queries
        const receivedModule = await import(`./queries/${timeWindow}/todayreceived.js`);
        if (receivedModule.queries) {
            queryFiles.push(...receivedModule.queries);
        }
        
        // Load processed queries
        const processedModule = await import(`./queries/${timeWindow}/todayprocessed.js`);
        if (processedModule.queries) {
            queryFiles.push(...processedModule.queries);
        }
        
        // Load failed queries
        const failedModule = await import(`./queries/${timeWindow}/todayfailed.js`);
        if (failedModule.queries) {
            queryFiles.push(...failedModule.queries);
        }
        
        return queryFiles;
    } catch (error) {
        console.error(`❌ Error loading query files:`, error.message);
        return [];
    }
}

async function main() {
    let windowToUse;
    
    // Determine time window
    if (config.timeWindow === 'today') {
        windowToUse = todayWindow();
        console.log(`📅 Using TODAY window (Melbourne timezone)`);
    } else {
        windowToUse = allTimeWindow();
        console.log(`📅 Using ALL-TIME window (no time filter)`);
    }
    
    // Print detailed time window information
    logWindow(config.timeWindow.toUpperCase(), windowToUse);
    
    // Get Cosmos DB connection using Key Vault
    console.log("🔗 [COSMOS] Initializing Cosmos DB connection...");
    const { containers } = await getCosmos();
    console.log(`🔗 Cosmos: db=${process.env.COSMOS_DATABASE}, statusContainer=${process.env.CONTRACT_CONTAINER}, entitiesContainer=${process.env.CONTRACT_ENTITIES_CONTAINER}`);
    
    // Load queries based on mode
    let queries = [];
    if (config.mode === 'all') {
        console.log(`🔍 Loading ALL query modules...`);
        const todayReceived = await import('./queries/today/todayreceived.js');
        const todayProcessed = await import('./queries/today/todayprocessed.js');
        const todayFailed = await import('./queries/today/todayfailed.js');
        queries = [...todayReceived.queries, ...todayProcessed.queries, ...todayFailed.queries];
    } else if (config.mode === 'today') {
        console.log(`🔍 Loading TODAY query modules only...`);
        const todayReceived = await import('./queries/today/todayreceived.js');
        const todayProcessed = await import('./queries/today/todayprocessed.js');
        const todayFailed = await import('./queries/today/todayfailed.js');
        queries = [...todayReceived.queries, ...todayProcessed.queries, ...todayFailed.queries];
    }
    
    console.log(`📊 LOADED ${queries.length} QUERY MODULES:`);
    queries.forEach((q, i) => console.log(`   ${i + 1}. ${q.name}`));
    console.log(`${'='.repeat(80)}`);
    
    let totalMetricsSent = 0;
    
    // Execute each query
    for (const mod of queries) {
        try {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`🔍 PROCESSING: ${mod.name.toUpperCase()}`);
            console.log(`${'='.repeat(80)}`);
            
            // Print detailed time window information
            logWindow(config.timeWindow.toUpperCase(), windowToUse);
            
            const result = await mod.run(containers, windowToUse);
            
            if (result && result.length > 0) {
                console.log(`✅ ${mod.name}: ${result.length} series`);

                // Send to Dynatrace
                const timestamp = Date.now();
                const envLower = (process.env.ENVIRONMENT || 'UNKNOWN').toLowerCase();
                
                // Handle different metric types
                let cumulativePayloadLines = [];
                
                if (mod.name === 'contractfailed_today') {
                    // Special handling for failed contract metrics
                    cumulativePayloadLines = result
                        .filter(r => r.labels.attempts === undefined)
                        .map(r => 
                            `${mod.metricBase},entity_type=${r.labels.entity_type},error_code=${r.labels.error_code},error_message=${r.labels.error_message},country=${r.labels.country},window=${r.labels.window},env=${envLower} gauge,${r.value} ${timestamp}`
                        );
                } else {
                    // Standard handling for other metrics
                    cumulativePayloadLines = result
                        .filter(r => r.labels.attempts === undefined)
                        .map(r => 
                            `${mod.metricBase},status=${r.labels.status},contractstatus=${r.labels.contractstatus},country=${r.labels.country},window=${r.labels.window},env=${envLower} gauge,${r.value} ${timestamp}`
                        );
                }

                console.log(`\n📤 DYNATRACE METRICS PAYLOAD (${mod.name}):`);
                console.log(`📊 Metric Base: ${mod.metricBase}`);
                console.log(`📈 Total Lines: ${cumulativePayloadLines.length}`);
                
                const sendResult = await sendMetrics(cumulativePayloadLines);
                console.log(`✅ Successfully sent ${sendResult.linesOk} metrics to Dynatrace`);
                if (sendResult.linesInvalid > 0) {
                    console.error(`❌ Failed to send ${sendResult.linesInvalid} metrics:`, sendResult.invalidLines);
                }
                
                totalMetricsSent += sendResult.linesOk;
                
            } else {
                console.log(`❌ ${mod.name}: No data found`);
            }
        } catch (error) {
            console.error(`❌ Error processing ${mod.name}:`, error.message);
            console.error(`📋 Stack trace:`, error.stack);
        }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎉 QUERIES COMPLETED SUCCESSFULLY`);
    console.log(`📊 Total metrics sent: ${totalMetricsSent}`);
    console.log(`${'='.repeat(80)}`);
}

// Run the dashboard
main().catch(console.error);
