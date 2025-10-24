// src/cli/parser.js
/**
 * CLI argument parsing utilities
 */

/**
 * Simple CLI argument parser
 * @param {string[]} argv - Process arguments
 * @returns {object} Parsed arguments
 */
export function parseArgs(argv) {
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

/**
 * Build configuration from parsed arguments
 * @param {object} argv - Parsed arguments
 * @returns {object} Configuration object
 */
export function buildConfig(argv) {
  // Check for help flag first
  if (argv.help || argv.h) {
    showHelp();
    process.exit(0);
  }

  const positionalMode = argv._[0];           // allow: "today" or "all"
  const positionalWindow = argv._[1];         // allow: "today" or "overall"

  return {
    mode: (argv.mode || positionalMode || "today").toLowerCase(),           // today|all
    timeWindow: (argv.window || positionalWindow || "today").toLowerCase(), // today|overall
    layout: (argv.layout || "sectioned").toLowerCase(),                     // sectioned|flat
    sections: (argv.sections || "").toLowerCase(),                           // e.g. "status,contractstatus,country"
    verbose: Boolean(argv.verbose),
    color: (argv.color || "auto").toLowerCase(),                             // auto|always|never
  };
}

/**
 * Validate configuration
 * @param {object} config - Configuration to validate
 * @throws {Error} If configuration is invalid
 */
export function validateConfig(config) {
  const validModes = new Set(["today", "all"]);
  const validWindows = new Set(["today", "overall"]);
  const validLayouts = new Set(["sectioned", "flat"]);
  const validColor = new Set(["auto", "always", "never"]);

  if (!validModes.has(config.mode)) {
    throw new Error("Invalid mode. Use 'today' or 'all'.");
  }
  if (!validWindows.has(config.timeWindow)) {
    throw new Error("Invalid time window. Use 'today' or 'overall'.");
  }
  if (!validLayouts.has(config.layout)) {
    throw new Error("Invalid --layout. Use sectioned|flat.");
  }
  if (!validColor.has(config.color)) {
    throw new Error("Invalid --color. Use auto|always|never.");
  }
}

/**
 * Show usage help
 */
export function showHelp() {
  console.log(
    `📊 Contracts Dashboard - Restructured Query System

Usage:
  node src/index.js [today|all] [today|overall] [OPTIONS]

Positional Arguments:
  [today|all]         Query mode (default: today)
  [today|overall]     Time window (default: today)

Options:
  --layout <type>     Output layout: sectioned|flat (default: sectioned)
  --sections <keys>   Section keys for grouping (comma-separated)
  --color <mode>      Color output: auto|always|never (default: auto)
  --verbose           Enable verbose output
  --help, -h          Show this help message

Examples:
  node src/index.js today
  node src/index.js all overall --layout flat --color never
  node src/index.js today today --sections status,contractstatus,country --color always
  node src/index.js --help
`
  );
}

/**
 * Show usage help and exit with error
 * @param {string} msg - Error message
 */
export function showHelpAndExit(msg) {
  console.error(`❌ ${msg}`);
  console.error(
    `\nUsage:\n  node src/index.js [today|all] [today|overall] [--layout sectioned|flat] [--sections key1,key2,...] [--color auto|always|never] [--verbose]\n\nExamples:\n  node src/index.js today\n  node src/index.js all overall --layout flat --color never\n  node src/index.js today today --sections status,contractstatus,country --color always\n`
  );
  process.exit(1);
}
