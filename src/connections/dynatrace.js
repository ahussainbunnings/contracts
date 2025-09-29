// src/connections/dynatrace.js
import { getSecret } from "./keyvault.js";

let dynatraceConfig = null;

/**
 * Get Dynatrace configuration using Key Vault for API token
 */
export async function getDynatraceConfig() {
    if (dynatraceConfig) {
        return dynatraceConfig;
    }

    try {
        console.log("📊 [DYNATRACE] Initializing Dynatrace configuration...");
        
        // Get API token from Key Vault using the correct secret name
        const token = await getSecret("cos-dashboard-dynatraceapitoken");
        
        if (!token?.trim()) {
            throw new Error("Dynatrace API token not found in Key Vault");
        }

        // Get other configuration from environment variables
        const DEBUG_LINES = String(process.env.DEBUG_DT_LINES || "").toLowerCase() === "true";
        const DEBUG_LOGS  = String(process.env.DEBUG_DT_LOGS  || "").toLowerCase() === "true";
        const DRYRUN      = String(process.env.DEBUG_DT_DRYRUN|| "").toLowerCase() === "true";

        dynatraceConfig = {
            token: token.trim(),
            DEBUG_LINES,
            DEBUG_LOGS,
            DRYRUN,
            urls: {
                base: process.env.DYNATRACE_URL?.trim() || "",
                mFullLegacy: process.env.DYNATRACE_METRICS_URL?.trim() || "",
                lFullLegacy: process.env.DYNATRACE_LOGS_URL?.trim() || "",
                logIngestVar: process.env.DYNATRACE_LOG_INGEST_URL?.trim() || "",
                mPathNew: process.env.DYNATRACE_METRICS_PATH?.trim() || "",
                lPathNew: process.env.DYNATRACE_LOGS_PATH?.trim() || ""
            }
        };

        console.log("✅ [DYNATRACE] Successfully configured Dynatrace");
        return dynatraceConfig;

    } catch (error) {
        console.error("❌ [DYNATRACE] Error configuring Dynatrace:", error.message);
        throw error;
    }
}

/**
 * Explain Dynatrace configuration
 */
export function explainDynatraceConfig() {
    console.log("📊 DYNATRACE CONFIGURATION:");
    console.log("================================");
    console.log(`🔑 Token: ${dynatraceConfig?.token ? '***' + dynatraceConfig.token.slice(-4) : 'Not loaded'}`);
    console.log(`🌐 Base URL: ${dynatraceConfig?.urls?.base || 'Not set'}`);
    console.log(`📈 Metrics URL: ${dynatraceConfig?.urls?.mFullLegacy || 'Not set'}`);
    console.log(`📝 Logs URL: ${dynatraceConfig?.urls?.lFullLegacy || 'Not set'}`);
    console.log(`🐛 Debug Lines: ${dynatraceConfig?.DEBUG_LINES || false}`);
    console.log(`🐛 Debug Logs: ${dynatraceConfig?.DEBUG_LOGS || false}`);
    console.log(`🧪 Dry Run: ${dynatraceConfig?.DRYRUN || false}`);
    console.log("================================");
}

/**
 * Send metrics to Dynatrace
 */
export async function sendMetrics(lines) {
    try {
        const config = await getDynatraceConfig();
        
        if (config.DRYRUN) {
            console.log("🧪 [DYNATRACE] DRY RUN - Not sending metrics");
            console.log("📊 [DYNATRACE] Would send lines:", lines.length);
            return { linesOk: lines.length, linesInvalid: 0, invalidLines: [] };
        }

        if (!config.urls.mFullLegacy) {
            throw new Error("Dynatrace metrics URL not configured");
        }

        const headers = {
            'Authorization': `Api-Token ${config.token}`,
            'Content-Type': 'text/plain; charset=utf-8'
        };

        if (config.DEBUG_LINES) {
            console.log("📊 [DYNATRACE] Sending metrics:");
            lines.forEach((line, index) => {
                console.log(`  ${index + 1}. ${line}`);
            });
        }

        const response = await fetch(config.urls.mFullLegacy, {
            method: 'POST',
            headers: headers,
            body: lines.join('\n')
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Dynatrace API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        console.log(`✅ [DYNATRACE] Successfully sent ${result.linesOk || lines.length} metrics`);
        
        if (result.linesInvalid > 0) {
            console.warn(`⚠️ [DYNATRACE] ${result.linesInvalid} invalid lines:`, result.invalidLines);
        }

        return result;

    } catch (error) {
        console.error("❌ [DYNATRACE] Error sending metrics:", error.message);
        throw error;
    }
}

/**
 * Send logs to Dynatrace
 */
export async function sendLogs(entries) {
    try {
        const config = await getDynatraceConfig();
        
        if (config.DRYRUN) {
            console.log("🧪 [DYNATRACE] DRY RUN - Not sending logs");
            console.log("📝 [DYNATRACE] Would send entries:", entries.length);
            return { linesOk: entries.length, linesInvalid: 0, invalidLines: [] };
        }

        if (!config.urls.lFullLegacy) {
            throw new Error("Dynatrace logs URL not configured");
        }

        const headers = {
            'Authorization': `Api-Token ${config.token}`,
            'Content-Type': 'application/json; charset=utf-8'
        };

        if (config.DEBUG_LOGS) {
            console.log("📝 [DYNATRACE] Sending logs:");
            entries.forEach((entry, index) => {
                console.log(`  ${index + 1}. ${JSON.stringify(entry, null, 2)}`);
            });
        }

        const response = await fetch(config.urls.lFullLegacy, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(entries)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Dynatrace API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        console.log(`✅ [DYNATRACE] Successfully sent ${result.linesOk || entries.length} log entries`);
        
        if (result.linesInvalid > 0) {
            console.warn(`⚠️ [DYNATRACE] ${result.linesInvalid} invalid entries:`, result.invalidLines);
        }

        return result;

    } catch (error) {
        console.error("❌ [DYNATRACE] Error sending logs:", error.message);
        throw error;
    }
}
