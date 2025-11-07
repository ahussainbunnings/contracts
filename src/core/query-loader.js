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

    // Always use the specified timeWindow folder
    // mode "all" means load all query types (received, processed, failed) from that folder
    const folder = timeWindow;
    
    console.log(colors.gray(`📁 Loading queries from folder: ${folder}`));
    
    await tryLoad(`../queries/${folder}/${folder}received.js`);
    await tryLoad(`../queries/${folder}/${folder}processed.js`);
    await tryLoad(`../queries/${folder}/${folder}failed.js`);
    await tryLoad(`../queries/${folder}/${folder}integrationstatus.js`);

    return queryFiles;
  } catch (error) {
    console.error(colors.red(`❌ Error loading query files for ${mode}/${timeWindow}: ${error.message}`));
    return [];
  }
}
