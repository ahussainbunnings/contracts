// src/utils/windows.js
import { DateTime } from "luxon";

const MEL_TZ = "Australia/Melbourne";
const toSecs = (ms) => Math.floor(ms / 1000);
const toWin = (startMel, endMel) => {
    const startUtcMs = startMel.toUTC().toMillis();
    const endUtcMs   = endMel.toUTC().toMillis();
    return { startUtcMs, endUtcMs, startSec: toSecs(startUtcMs), endSec: toSecs(endUtcMs) };
};

// TODAY: Melbourne start of day -> end of day
export function todayWindow() {
    const nowMel = DateTime.now().setZone(MEL_TZ);
    const start  = nowMel.startOf("day");
    const end    = nowMel.endOf("day");
    return toWin(start, end);
}

// WEEK: Melbourne start of current week (Monday) -> end of week (Sunday)
export function weekWindow() {
    const nowMel = DateTime.now().setZone(MEL_TZ);
    const start  = nowMel.startOf("week");
    const end    = nowMel.endOf("week");
    return toWin(start, end);
}

// MONTH: Melbourne start of current month -> end of month
export function monthWindow() {
    const nowMel = DateTime.now().setZone(MEL_TZ);
    const start  = nowMel.startOf("month");
    const end    = nowMel.endOf("month");
    return toWin(start, end);
}

export function allTimeWindow() {
    const endUtcMs = Date.now();
    return { startUtcMs: 0, endUtcMs, startSec: 0, endSec: Math.floor(endUtcMs / 1000) };
}

export function logWindow(label, win) {
    const startMel = DateTime.fromMillis(win.startUtcMs).setZone(MEL_TZ);
    const endMel = DateTime.fromMillis(win.endUtcMs).setZone(MEL_TZ);
    
    console.log(
        `🗂️ ${label}: UTC window [${new Date(win.startUtcMs).toISOString()} .. ${new Date(win.endUtcMs).toISOString()}) ` +
        `secs=[${win.startSec}..${win.endSec})`
    );
    console.log(
        `🕐 ${label}: Melbourne time [${startMel.toFormat('yyyy-MM-dd HH:mm:ss z')} .. ${endMel.toFormat('yyyy-MM-dd HH:mm:ss z')})`
    );
}

export function logCurrentMelbourneTime() {
    const nowMel = DateTime.now().setZone(MEL_TZ);
    console.log(`🕐 Current Melbourne Time: ${nowMel.toFormat('yyyy-MM-dd HH:mm:ss z')}`);
    console.log(`🕐 Current UTC Time: ${DateTime.now().setZone('utc').toFormat('yyyy-MM-dd HH:mm:ss z')}`);
}
