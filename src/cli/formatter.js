// src/cli/formatter.js
/**
 * CLI output formatting utilities
 */

/**
 * Initialize color settings based on configuration
 * @param {object} config - Configuration with color settings
 * @returns {object} Color helper functions
 */
export function initializeColors(config) {
  const isTTY = process.stdout && process.stdout.isTTY;
  const envForcesNo = process.env.NO_COLOR === "1" || process.env.NO_COLOR === "true";
  const envForcesYes = process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0";
  
  const colorEnabled =
    config.color === "always" ? true :
    config.color === "never" ? false :
    // auto:
    (!!isTTY && !envForcesNo) || !!envForcesYes;

  const c = (code, s) => (colorEnabled ? `\x1b[${code}m${s}\x1b[0m` : String(s));
  
  return {
    colorEnabled,
    bold: (s) => c(1, s),
    dim: (s) => c(2, s),
    red: (s) => c(31, s),
    green: (s) => c(32, s),
    yellow: (s) => c(33, s),
    blue: (s) => c(34, s),
    magenta: (s) => c(35, s),
    cyan: (s) => c(36, s),
    gray: (s) => c(90, s)
  };
}

// Default color functions (fallback when colors not initialized)
let defaultColors = initializeColors({ color: "auto" });

export const bold = (s) => defaultColors.bold(s);
export const dim = (s) => defaultColors.dim(s);
export const red = (s) => defaultColors.red(s);
export const green = (s) => defaultColors.green(s);
export const yellow = (s) => defaultColors.yellow(s);
export const blue = (s) => defaultColors.blue(s);
export const magenta = (s) => defaultColors.magenta(s);
export const cyan = (s) => defaultColors.cyan(s);
export const gray = (s) => defaultColors.gray(s);

/**
 * Print a fancy box around a title
 * @param {string} title - Title to display
 * @param {object} colors - Color helper functions (optional)
 */
export function printBox(title, colors = defaultColors) {
  const line = "═".repeat(70);
  const top = colors.colorEnabled ? colors.cyan(`╔${line}`) : `╔${line}`;
  const bottom = colors.colorEnabled ? colors.cyan(`╚${line}`) : `╚${line}`;
  console.log(`\n${top}\n║ ${colors.bold(title)}\n${bottom}\n`);
}

/**
 * Create a formatted title line for tree display
 * @param {number} depth - Nesting depth
 * @param {string} label - Label text
 * @param {number} count - Item count
 * @param {object} colors - Color helper functions
 * @returns {string} Formatted title line
 */
export function createTitleLine(depth, label, count, colors) {
  const pad = depth === 0 ? "" : "│  ".repeat(depth - 1);
  const bullet = depth === 0 ? "▌" : depth === 1 ? "├─" : `${pad}└─`;
  const tinted =
    depth === 0 ? colors.bold(colors.magenta(label)) :
    depth === 1 ? colors.bold(colors.cyan(label)) :
    colors.bold(colors.yellow(label));
  const cnt = colors.gray(`(${count})`);
  return `${tinted} ${cnt}`.replace(label, `${bullet} ${label}`);
}

/**
 * Group items by a key
 * @param {Array} items - Items to group
 * @param {string} key - Key to group by
 * @returns {Map} Grouped items
 */
export function groupBy(items, key) {
  const out = new Map();
  for (const it of items) {
    const labels = it.labels || {};
    const v = labels[key] ?? "(none)";
    if (!out.has(v)) out.set(v, []);
    out.get(v).push(it);
  }
  return out;
}

/**
 * Build a Dynatrace metric line for display
 * @param {object} mod - Module with metricBase
 * @param {object} result - Result with labels and value
 * @param {number} timestamp - Timestamp
 * @param {object} colors - Color helper functions
 * @returns {string} Formatted metric line
 */
export function buildDynatraceLine(mod, result, timestamp, colors) {
  const labelsStr = Object.entries(result.labels || {})
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  const metric = `${mod.metricBase},${labelsStr} gauge,${result.value} ${timestamp}`;
  return colors.colorEnabled ? colors.gray(metric) : metric;
}

/**
 * Recursively print results grouped by section keys
 * @param {object} options - Print options
 */
export function printSectionedResults({ mod, results, timestamp, sectionKeys, colors = defaultColors, depth = 0 }) {
  if (!sectionKeys.length) {
    // Leaf: print every metric line
    let i = 1;
    for (const r of results) {
      const idx = colors.gray(String(i++).padStart(3, " "));
      console.log(`   ${idx}. ${buildDynatraceLine(mod, r, timestamp, colors)}`);
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
    console.log(createTitleLine(depth, `${key} = ${val}`, bucket.length, colors));
    printSectionedResults({ 
      mod, 
      results: bucket, 
      timestamp, 
      sectionKeys: rest, 
      colors,
      depth: depth + 1 
    });
  }
}

/**
 * Print flat results
 * @param {Array} payloadLines - Metric lines to print
 * @param {object} colors - Color helper functions (optional)
 */
export function printFlatResults(payloadLines, colors = defaultColors) {
  let i = 1;
  for (const line of payloadLines) {
    const idx = colors.gray(String(i++).padStart(3, " "));
    console.log(`  ${idx}. ${colors.gray(line)}`);
  }
}
