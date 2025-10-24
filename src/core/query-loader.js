// src/core/query-loader.js
/**
 * Dynamic query loading utilities
 */

/**
 * Load query files based on mode and time window
 * @param {string} mode - Mode (today/all)
 * @param {string} timeWindow - Time window (today/overall)
 * @param {object} colors - Color helper functions
 * @returns {Promise<Array>} Array of loaded query modules
 */
export async function loadQueryFiles(mode, timeWindow, colors) {
  const queryFiles = [];
  
  try {
    const folder = mode === "all" ? "overall" : timeWindow;

    const tryLoad = async (path) => {
      try {
        const mod = await import(path);
        if (mod?.queries?.length) {
          queryFiles.push(...mod.queries);
        } else if (typeof mod?.queries !== "undefined") {
          console.warn(colors.gray(`ℹ️ Loaded ${path} but no 'queries' found`));
        }
      } catch (err) {
        console.warn(colors.gray(`⚠️ Skipping ${path}: ${err.message}`));
      }
    };

    await tryLoad(`../queries/${folder}/${folder}received.js`);
    await tryLoad(`../queries/${folder}/${folder}processed.js`);
    await tryLoad(`../queries/${folder}/${folder}failed.js`);

    return queryFiles;
  } catch (error) {
    console.error(colors.red(`❌ Error loading query files for ${mode}/${timeWindow}: ${error.message}`));
    return [];
  }
}
