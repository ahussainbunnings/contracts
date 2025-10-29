// src/index.js
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

import { DateTime } from "luxon";
import { getCosmos } from "./connections/cosmos.js";
import { sendMetrics } from "./connections/dynatrace.js";
import { createQuerySummary } from "./utils/dashboardSummary.js";
import { displaySuperCleanSummary } from "./utils/superCleanDisplay.js";
import { allTimeWindow, logWindow, monthWindow, todayWindow, weekWindow } from "./utils/windows.js";

// CLI utilities
import {
  bold,
  gray,
  green,
  initializeColors,
  printBox,
  printSectionedResults,
  red,
  yellow
} from "./cli/formatter.js";
import { buildConfig, parseArgs, showHelpAndExit, validateConfig } from "./cli/parser.js";

// Configuration
import { resolveSectionKeys } from "./config/sections.js";

// Core utilities
import { loadQueryFiles } from "./core/query-loader.js";

// Services
import { logError, withErrorHandling } from "./services/index.js";

/* -------------------- Configuration Setup -------------------- */
const argv = parseArgs(process.argv.slice(2));
const config = buildConfig(argv);

try {
  validateConfig(config);
} catch (error) {
  showHelpAndExit(error.message);
}

// Initialize colors based on config
const colors = initializeColors(config);

/* -------------------- Environment Detection -------------------- */
const effectiveEnv = (process.env.ENVIRONMENT || "UNKNOWN").toUpperCase();

// Select appropriate window function based on config
let windowToUse;
switch (config.timeWindow) {
  case "today":
    windowToUse = todayWindow();
    break;
  case "week":
    windowToUse = weekWindow();
    break;
  case "month":
    windowToUse = monthWindow();
    break;
  case "overall":
    windowToUse = allTimeWindow();
    break;
  default:
    windowToUse = todayWindow();
}

// Add label to window for query modules
windowToUse.label = config.timeWindow;

/* -------------------- Startup Banner -------------------- */
console.log(colors.bold(`🚀 DASHBOARD STARTING - RESTRUCTURED QUERY SYSTEM`));
console.log(`🏷️ Environment: ${colors.bold(effectiveEnv)}`);
console.log(`🔧 Service: ${colors.bold("dashboard")}`);
console.log(`📋 Mode: ${colors.bold(config.mode.toUpperCase())}`);
console.log(`📅 Time Window: ${colors.bold(config.timeWindow.toUpperCase())}`);
console.log(`🧩 Layout: ${colors.bold(config.layout.toUpperCase())}  Sections: ${colors.bold(config.sections || "(auto)")}`);
console.log(
  `🕐 Current Melbourne Time: ${colors.bold(
    DateTime.now().setZone("Australia/Melbourne").toFormat("dd/MM/yyyy, HH:mm:ss")
  )} Australia/Melbourne`
);

if (config.mode === "all" || config.timeWindow === "overall") {
  console.log(`📅 Using ${colors.bold("ALL-TIME")} window (no time filter)`);
} else if (config.timeWindow === "week") {
  console.log(`📅 Using ${colors.bold("WEEK")} window (Melbourne timezone)`);
} else if (config.timeWindow === "month") {
  console.log(`📅 Using ${colors.bold("MONTH")} window (Melbourne timezone)`);
} else {
  console.log(`📅 Using ${colors.bold("TODAY")} window (Melbourne timezone)`);
}
logWindow(config.timeWindow.toUpperCase(), windowToUse);



/* -------------------- main -------------------- */
async function main() {
  // Cosmos
  const { containers } = await getCosmos();

  // Queries
  console.log(`🔍 Loading ${bold(config.mode.toUpperCase())} query modules...`);
  const queries = await loadQueryFiles(config.mode, config.timeWindow, colors);

  console.log(`📊 LOADED ${bold(String(queries.length))} QUERY MODULES:`);
  queries.forEach((q, i) => console.log(`   ${gray(String(i + 1).padStart(2, " "))}. ${bold(q.name)}`));

  let totalMetricsSent = 0;
  const queryResults = [];

  const envLower = effectiveEnv.toLowerCase();

  for (const mod of queries) {
    try {
      // rolling summary before each module
      displaySuperCleanSummary(queryResults, totalMetricsSent, windowToUse);

      printBox(`PROCESSING: ${mod.name.toUpperCase()}`);
      logWindow(config.timeWindow.toUpperCase(), windowToUse);

      const result = await mod.run(containers, windowToUse);

      if (result && result.length > 0) {
        console.log(green(`✅ ${mod.name}: ${result.length} series`));

        // Build payload lines exactly as before (preserve env + any labels your modules set)
        const timestamp = Date.now();
        const cumulativePayloadLines = result.map((r) => {
          const labelsCore = Object.entries(r.labels || {})
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}=${v}`);

          // ensure env is present
          if (!labelsCore.find((l) => l.startsWith("env="))) labelsCore.push(`env=${envLower}`);

          return `${mod.metricBase},${labelsCore.join(",")} gauge,${r.value} ${timestamp}`;
        });

        // === Pretty full output ===
        printBox(`[DYNATRACE PAYLOAD] ${mod.name}`, colors);
        if (config.layout === "flat") {
          let i = 1;
          for (const line of cumulativePayloadLines) {
            const idx = colors.gray(String(i++).padStart(3, " "));
            console.log(`  ${idx}. ${colors.gray(line)}`);
          }
        } else {
          // sectioned
          const sectionKeys = resolveSectionKeys(mod.name);
          printSectionedResults({
            mod,
            results: result, // use structured results for grouping
            envLower,
            timestamp,
            sectionKeys,
            colors,
          });
        }

        // === Send to Dynatrace (unchanged) ===
        const sendResult = await sendMetrics(cumulativePayloadLines);
        console.log(green(`✅ Successfully sent ${sendResult.linesOk} metrics to Dynatrace`));
        if (sendResult.linesInvalid > 0) {
          console.error(red(`❌ Failed to send ${sendResult.linesInvalid} metrics: ${JSON.stringify(sendResult.invalidLines)}`));
        }

        totalMetricsSent += sendResult.linesOk;
        queryResults.push(createQuerySummary(mod.name, result));
      } else {
        console.log(yellow(`❌ ${mod.name}: No data found`));
      }
    } catch (error) {
      console.error(red(`❌ Error processing ${mod.name}: ${error.message}`));
      console.error(gray(`📋 Stack trace: ${error.stack}`));
    }
  }

  displaySuperCleanSummary(queryResults, totalMetricsSent, windowToUse);
}

// Run with enhanced error handling
const mainWithErrorHandling = withErrorHandling(main, "MAIN_EXECUTION");

mainWithErrorHandling().catch((error) => {
  logError("FATAL", error);
  process.exit(99);
});
