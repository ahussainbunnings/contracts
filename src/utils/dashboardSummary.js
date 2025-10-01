// Dashboard summary display utilities

export function displayDashboardSummary(results, totalMetricsSent, timeWindow) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 DASHBOARD SUMMARY`);
    console.log(`${'='.repeat(80)}`);
    
    console.log(`🕐 Time Window: ${timeWindow.label || 'Custom'}`);
    console.log(`📅 Period: ${new Date(timeWindow.startUtcMs).toISOString()} to ${new Date(timeWindow.endUtcMs).toISOString()}`);
    console.log(`📈 Total Metrics Sent: ${totalMetricsSent}`);
    
    console.log(`\n📋 QUERY RESULTS:`);
    console.log(`${'─'.repeat(60)}`);
    
    results.forEach((result, i) => {
        const { queryName, metricsCount, summary } = result;
        console.log(`${i + 1}. ${queryName}: ${metricsCount} metrics`);
        
        if (summary && summary.length > 0) {
            summary.forEach(line => {
                console.log(`   ${line}`);
            });
        }
    });
    
    console.log(`${'─'.repeat(60)}`);
    console.log(`🎉 Dashboard execution completed successfully!`);
    console.log(`${'='.repeat(80)}`);
}

export function createQuerySummary(queryName, result) {
    if (!result || result.length === 0) {
        return { queryName, metricsCount: 0, summary: ['No data found'] };
    }
    
    const summary = [];
    
    // Group metrics by main categories
    const categories = new Map();
    
    result.forEach(metric => {
        const { labels, value } = metric;
        const status = labels.status || 'unknown';
        const contractstatus = labels.contractstatus || 'unknown';
        const country = labels.country || 'unknown';
        
        if (value > 0) {
            const key = `${status}|${contractstatus}|${country}`;
            if (!categories.has(key)) {
                categories.set(key, 0);
            }
            categories.set(key, categories.get(key) + value);
        }
    });
    
    // Create summary lines for non-zero metrics
    categories.forEach((count, key) => {
        if (count > 0) {
            const [status, contractstatus, country] = key.split('|');
            summary.push(`   ${status} | ${contractstatus} | ${country}: ${count}`);
        }
    });
    
    return { queryName, metricsCount: result.length, summary };
}
