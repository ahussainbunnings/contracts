// src/utils/status.js
// Normalise status values and provide consistent labels & pretty strings.

export function normalizeStatus(raw) {
    const s = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "");
    if (s === "inprogress" || s === "in_progress" || s === "processing" || s === "pending") return "inprogress";
    if (s === "completed"  || s === "complete" || s === "done" || s === "success")         return "completed";
    if (s === "failed"     || s === "error" || s === "permanentlyfailed" || s === "permfailed") return "failed";
    return "other";
}

export function statusLabel(statusNorm) {
    switch (statusNorm) {
        case "inprogress": return "contract_awaiting_process";
        case "completed":  return "contract_processed";
        case "failed":     return "contract_processing_failed";
        default:           return "other";
    }
}

// For console tables / human-readable output
export function statusPretty(raw) {
    const s = normalizeStatus(raw);
    switch (s) {
        case "inprogress": return "Contract awaiting process";
        case "completed":  return "Contract Processed";
        case "failed":     return "Contract Processing Failed";
        default:           return String(raw ?? "Unknown");
    }
}

// Maps single-letter entity status codes to human-readable names
export function mapEntityStatusToReadable(code) {
    const c = String(code || "").toLowerCase();
    switch (c) {
        case "d": return "draft";
        case "p": return "pending";
        case "v": return "reviewed";
        case "a": return "approved";
        case "r": return "rejected";
        case "s": return "submitted";
        case "c": return "active";
        case "e": return "expired";
        case "all": return "all";
        default: return "unknown";
    }
}

// Enrich a labels object with normalised status + statuslabel if `status` exists
export function enrichStatusLabels(labels = {}) {
    if (!Object.prototype.hasOwnProperty.call(labels, "status")) return labels;
    const norm = normalizeStatus(labels.status);
    return {
        ...labels,
        status: norm,                 // unify status key to normalised value
        statuslabel: statusLabel(norm) // add label dimension for dashboards
    };
}
