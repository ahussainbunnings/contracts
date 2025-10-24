// src/config/sections.js
/**
 * Module-specific section configurations
 */

/**
 * Per-module sensible defaults for sectioning
 */
export const MODULE_DEFAULT_SECTIONS = {
  // based on your outputs
  contractreceived_today: "status,contractstatus,country",
  contractreceived_subdomains_today: "status,contractstatus,country",
  contractprocessed_today_by_status: "status,contractstatus,country",
  contractfailed_today: "failure_type,entity_type,error_code,country",
  contractreceived_overall: "status,contractstatus,country",
  contractprocessed_overall_by_status: "status,contractstatus,country",
  contractfailed_overall: "failure_type,entity_type,error_code,country",
  // debug
  contractinfo: "status,contractstatus,country",
  contractsearch: "status,contractstatus,country",
};

/**
 * Generic fallback
 */
export const GENERIC_FALLBACK = "status,country";

/**
 * Resolve section keys for a module
 * @param {string} moduleName - Name of the module
 * @param {string} configSections - User-provided sections
 * @returns {string[]} Array of section keys
 */
export function resolveSectionKeys(moduleName, configSections = "") {
  let sectionsStr = configSections;
  
  if (!sectionsStr) {
    sectionsStr = MODULE_DEFAULT_SECTIONS[moduleName] || GENERIC_FALLBACK;
  }
  
  return sectionsStr.split(",").map(s => s.trim()).filter(Boolean);
}
