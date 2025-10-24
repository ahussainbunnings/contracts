// src/index.js
import { DateTime } from "luxon";
import { getCosmos } from "./connections/cosmos.js";
import { sendMetrics } from "./connections/dynatrace.js";
import { createQuerySummary } from "./utils/dashboardSummary.js";
import { displaySuperCleanSummary } from "./utils/superCleanDisplay.js";
import { allTimeWindow, logWindow, todayWindow } from "./utils/windows.js";

/* -------------------- tiny CLI parser -------------------- */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith("--")) {
      const [k, v] = tok.slice(2).split("=");
      if (v !== undefined) out[k] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) out[k] = argv[++i];
      else out[k] = true;
    } else if (tok.startsWith("-")) {
      out[tok.replace(/^-+/, "")] = true;
    } else {
      out._.push(tok);
    }
  }
  return out;
}

const argv = parseArgs(process.argv.slice(2));

/* -------------------- config & validation -------------------- */
const positionalMode = argv._[0];           // allow: "today" or "all"
const positionalWindow = argv._[1];         // allow: "today" or "overall"

const config = {
  mode: (argv.mode || positionalMode || "today").toLowerCase(),           // today|all
  timeWindow: (argv.window || positionalWindow || "today").toLowerCase(), // today|overall
  layout: (argv.layout || "sectioned").toLowerCase(),                     // sectioned|flat
  sections: (argv.sections || "").toLowerCase(),                           // e.g. "status,contractstatus,country"
  verbose: Boolean(argv.verbose),
  color: (argv.color || "auto").toLowerCase(),                             // auto|always|never
};

const validModes = new Set(["today", "all"]);
const validWindows = new Set(["today", "overall"]);
const validLayouts = new Set(["sectioned", "flat"]);
const validColor = new Set(["auto", "always", "never"]);

function fail(msg) {
  console.error(`❌ ${msg}`);
  console.error(
    `\nUsage:\n  node src/index.js [today|all] [today|overall] [--layout sectioned|flat] [--sections key1,key2,...] [--color auto|always|never] [--verbose]\n\nExamples:\n  node src/index.js today\n  node src/index.js all overall --layout flat --color never\n  node src/index.js today today --sections status,contractstatus,country --color always\n`
  );
  process.exit(1);
}

if (!validModes.has(config.mode)) fail("Invalid mode. Use 'today' or 'all'.");
if (!validWindows.has(config.timeWindow)) fail("Invalid time window. Use 'today' or 'overall'.");
if (!validLayouts.has(config.layout)) fail("Invalid --layout. Use sectioned|flat.");
if (!validColor.has(config.color)) fail("Invalid --color. Use auto|always|never.");

/* -------------------- color helpers -------------------- */
const isTTY = process.stdout && process.stdout.isTTY;
const envForcesNo = process.env.NO_COLOR === "1" || process.env.NO_COLOR === "true";
const envForcesYes = process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0";
const colorEnabled =
  config.color === "always" ? true :
  config.color === "never" ? false :
  // auto:
  (!!isTTY && !envForcesNo) || !!envForcesYes;

const c = (code, s) => (colorEnabled ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = (s) => c(1, s);
const dim = (s) => c(2, s);
const red = (s) => c(31, s);
const green = (s) => c(32, s);
const yellow = (s) => c(33, s);
const blue = (s) => c(34, s);
const magenta = (s) => c(35, s);
const cyan = (s) => c(36, s);
const gray = (s) => c(90, s);

/* -------------------- pretty printing helpers -------------------- */
function box(title) {
  const line = "═".repeat(70);
  const top = colorEnabled ? cyan(`╔${line}`) : `╔${line}`;
  const bottom = colorEnabled ? cyan(`╚${line}`) : `╚${line}`;
  console.log(`\n${top}\n║ ${bold(title)}\n${bottom}\n`);
}

function titleLine(depth, label, count) {
  const pad = depth === 0 ? "" : "│  ".repeat(depth - 1);
  const bullet = depth === 0 ? "▌" : depth === 1 ? "├─" : `${pad}└─`;
  const tinted =
    depth === 0 ? bold(magenta(label)) :
    depth === 1 ? bold(cyan(label)) :
    bold(yellow(label));
  const cnt = gray(`(${count})`);
  return `${tinted} ${cnt}`.replace(label, `${bullet} ${label}`);
}

function groupBy(items, key) {
  const out = new Map();
  for (const it of items) {
    const labels = it.labels || {};
    const v = labels[key] ?? "(none)";
    if (!out.has(v)) out.set(v, []);
    out.get(v).push(it);
  }
  return out;
}

// Recreate the exact Dynatrace line you send so console matches payload
function buildDynatraceLine(mod, r, envLower, timestamp) {
  const labelsStr = Object.entries(r.labels || {})
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .concat([`env=${envLower}`]) // make sure env is on every line
    .join(",");
  const metric = `${mod.metricBase},${labelsStr} gauge,${r.value} ${timestamp}`;
  return colorEnabled ? `${gray(metric)}` : metric;
}

/**
 * Recursively print results grouped by section keys (e.g., ["status","contractstatus","country"])
 * Prints ALL metrics in leaf groups (no truncation).
 */
function printSectionedResults({ mod, results, envLower, timestamp, sectionKeys, depth = 0 }) {
  if (!sectionKeys.length) {
    // Leaf: print every metric line
    let i = 1;
    for (const r of results) {
      const idx = gray(String(i++).padStart(3, " "));
      console.log(`   ${idx}. ${buildDynatraceLine(mod, r, envLower, timestamp)}`);
    }
    return;
  }

  const [key, ...rest] = sectionKeys;
  const groups = groupBy(results, key);

  // Stable order: non-(none) alphabetically, then (none)
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === "(none)" && b !== "(none)") return 1;
    if (b === "(none)" && a !== "(none)") return -1;
    return String(a).localeCompare(String(b));
  });

  for (const val of keys) {
    const bucket = groups.get(val);
    console.log(titleLine(depth, `${key} = ${val}`, bucket.length));
    printSectionedResults({ mod, results: bucket, envLower, timestamp, sectionKeys: rest, depth: depth + 1 });
  }
}

/* -------------------- section defaults -------------------- */
/** Per-module sensible defaults; fallback to generic */
const MODULE_DEFAULT_SECTIONS = {
  // based on your outputs
  contractreceived_today: "status,contractstatus,country",
  contractreceived_subdomains_today: "status,contractstatus,country",
  contractprocessed_today_by_status: "status,contractstatus,country",
  contractfailed_today: "failure_type,entity_type,error_code,country",
};

function resolveSectionKeys(modName) {
  const raw =
    config.sections ||
    MODULE_DEFAULT_SECTIONS[modName] ||
    "status,contractstatus,country"; // generic fallback
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/* -------------------- banner -------------------- */
const effectiveEnv = (process.env.ENVIRONMENT || "UNKNOWN").toUpperCase();
console.log(bold(`🚀 DASHBOARD STARTING - RESTRUCTURED QUERY SYSTEM`));
console.log(`🏷️ Environment: ${bold(effectiveEnv)}`);
console.log(`🔧 Service: ${bold("dashboard")}`);
console.log(`📋 Mode: ${bold(config.mode.toUpperCase())}`);
console.log(`📅 Time Window: ${bold(config.timeWindow.toUpperCase())}`);
console.log(`🧩 Layout: ${bold(config.layout.toUpperCase())}  Sections: ${bold(config.sections || "(auto)")}`);
console.log(
  `🕐 Current Melbourne Time: ${bold(
    DateTime.now().setZone("Australia/Melbourne").toFormat("dd/MM/yyyy, HH:mm:ss")
  )} Australia/Melbourne`
);

/* -------------------- window selection -------------------- */
let windowToUse;
if (config.mode === "all" || config.timeWindow === "overall") {
  windowToUse = allTimeWindow();
  console.log(`📅 Using ${bold("ALL-TIME")} window (no time filter)`);
} else {
  windowToUse = todayWindow();
  console.log(`📅 Using ${bold("TODAY")} window (Melbourne timezone)`);
}
logWindow(config.timeWindow.toUpperCase(), windowToUse);

/* -------------------- dynamic queries loader -------------------- */
async function loadQueryFiles(mode, timeWindow) {
  const queryFiles = [];
  try {
    const folder = mode === "all" ? "overall" : timeWindow;

    const tryLoad = async (path) => {
      try {
        const mod = await import(path);
        if (mod?.queries?.length) queryFiles.push(...mod.queries);
        else if (typeof mod?.queries !== "undefined") {
          console.warn(gray(`ℹ️ Loaded ${path} but no 'queries' found`));
        }
      } catch (err) {
        console.warn(gray(`⚠️ Skipping ${path}: ${err.message}`));
      }
    };

    await tryLoad(`./queries/${folder}/${folder}received.js`);
    await tryLoad(`./queries/${folder}/${folder}processed.js`);
    await tryLoad(`./queries/${folder}/${folder}failed.js`);

    return queryFiles;
  } catch (error) {
    console.error(red(`❌ Error loading query files for ${mode}/${timeWindow}: ${error.message}`));
    return [];
  }
}

/* -------------------- main -------------------- */
async function main() {
  // Cosmos
  const { containers } = await getCosmos();

  // Queries
  console.log(`🔍 Loading ${bold(config.mode.toUpperCase())} query modules...`);
  const queries = await loadQueryFiles(config.mode, config.timeWindow);

  console.log(`📊 LOADED ${bold(String(queries.length))} QUERY MODULES:`);
  queries.forEach((q, i) => console.log(`   ${gray(String(i + 1).padStart(2, " "))}. ${bold(q.name)}`));

  let totalMetricsSent = 0;
  const queryResults = [];

  const envLower = effectiveEnv.toLowerCase();

  for (const mod of queries) {
    try {
      // rolling summary before each module
      displaySuperCleanSummary(queryResults, totalMetricsSent, windowToUse);

      box(`PROCESSING: ${mod.name.toUpperCase()}`);
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
        box(`[DYNATRACE PAYLOAD] ${mod.name}`);
        if (config.layout === "flat") {
          let i = 1;
          for (const line of cumulativePayloadLines) {
            const idx = gray(String(i++).padStart(3, " "));
            console.log(`  ${idx}. ${gray(line)}`);
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

// Run
main().catch((e) => {
  console.error(red("💥 Fatal error:"), e);
  process.exit(99);
});
