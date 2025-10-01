// Clean metrics display utilities

export function displayMetricsSummary(queryName, result, metricBase) {
    if (!result || result.length === 0) {
        console.log(`❌ ${queryName}: No data found`);
        return;
    }

    console.log(`✅ ${queryName}: ${result.length} metrics`);
    
    // Group metrics by key dimensions for cleaner display
    const groupedMetrics = groupMetricsByDimensions(result);
    
    // Display summary table
    displayMetricsTable(queryName, groupedMetrics);
}

function groupMetricsByDimensions(metrics) {
    const groups = new Map();
    
    metrics.forEach(metric => {
        const { labels, value } = metric;
        
        // Create a key based on main dimensions
        const key = createGroupKey(labels);
        
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push({ labels, value });
    });
    
    return groups;
}

function createGroupKey(labels) {
    // Group by status and contractstatus for cleaner display
    const status = labels.status || 'unknown';
    const contractstatus = labels.contractstatus || 'unknown';
    const country = labels.country || 'unknown';
    
    return `${status}|${contractstatus}|${country}`;
}

function displayMetricsTable(queryName, groupedMetrics) {
    console.log(`\n📊 METRICS SUMMARY (${queryName}):`);
    console.log(`${'─'.repeat(80)}`);
    
    // Create table header
    console.log(`│ ${'Status'.padEnd(20)} │ ${'Contract Status'.padEnd(15)} │ ${'Country'.padEnd(8)} │ ${'Count'.padEnd(8)} │`);
    console.log(`${'─'.repeat(80)}`);
    
    // Sort groups for consistent display
    const sortedGroups = Array.from(groupedMetrics.entries()).sort();
    
    sortedGroups.forEach(([key, metrics]) => {
        const [status, contractstatus, country] = key.split('|');
        
        // Sum up values for this group
        const totalCount = metrics.reduce((sum, m) => sum + m.value, 0);
        
        // Only show non-zero metrics
        if (totalCount > 0) {
            console.log(`│ ${status.padEnd(20)} │ ${contractstatus.padEnd(15)} │ ${country.padEnd(8)} │ ${totalCount.toString().padEnd(8)} │`);
        }
    });
    
    console.log(`${'─'.repeat(80)}`);
}

export function displayDynatracePayload(queryName, payloadLines, metricBase) {
    console.log(`\n📤 DYNATRACE PAYLOAD (${queryName}):`);
    console.log(`📊 Metric Base: ${metricBase}`);
    console.log(`📈 Total Lines: ${payloadLines.length}`);
    
    // Show first few lines as examples
    if (payloadLines.length > 0) {
        console.log(`\n📋 Sample Metrics (showing first 3):`);
        payloadLines.slice(0, 3).forEach((line, i) => {
            console.log(`   ${i + 1}. ${line}`);
        });
        
        if (payloadLines.length > 3) {
            console.log(`   ... and ${payloadLines.length - 3} more metrics`);
        }
    }
}

export function displayQueryResults(queryName, result, metricBase, payloadLines) {
    // Display clean metrics summary
    displayMetricsSummary(queryName, result, metricBase);
    
    // Display Dynatrace payload info
    displayDynatracePayload(queryName, payloadLines, metricBase);
}
