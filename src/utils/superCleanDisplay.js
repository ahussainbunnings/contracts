// Super clean display for production use

export function displaySuperCleanSummary(queryResults, totalMetricsSent, timeWindow) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 DASHBOARD SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    
    console.log(`🕐 Time Window: ${timeWindow.label || 'Custom'}`);
    console.log(`📈 Total Metrics Sent: ${totalMetricsSent}`);
    
    console.log(`\n📋 RESULTS:`);
    console.log(`${'─'.repeat(40)}`);
    
    queryResults.forEach((result, i) => {
        const { queryName, metricsCount, summary } = result;
        console.log(`${i + 1}. ${queryName}: ${metricsCount} metrics`);
        
        if (summary && summary.length > 0) {
            // Show only the most important metrics (non-zero, non-total)
            const importantMetrics = summary.filter(line => 
                !line.includes('| total:') && 
                !line.includes('| 0') &&
                line.includes('| all |')
            );
            
            if (importantMetrics.length > 0) {
                importantMetrics.forEach(line => {
                    console.log(`   ${line}`);
                });
            }
        }
    });
    
    console.log(`${'─'.repeat(40)}`);
    console.log(`✅ Dashboard completed successfully!`);
    console.log(`${'='.repeat(60)}`);
}
