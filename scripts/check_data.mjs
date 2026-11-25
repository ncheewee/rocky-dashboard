// Sanity check of src/data/dashboard.json against the contract in src/data/types.ts (top-level keys + basic shapes).
// Run: node scripts/check_data.mjs   (CI runs it on every push / PR)
import { readFileSync } from "node:fs";
const d = JSON.parse(readFileSync(new URL("../src/data/dashboard.json", import.meta.url), "utf8"));
const need = {
  schemaVersion: "number", UPDATED: "string", READINGS_TO: "string", TODAY: "string", START_DATE: "string", DELIVERY: "string",
  WARRANTY_Y8: "string", WARRANTY_END: "string", WEEKLY: "array", MONTHLY: "array", DAILY: "array", SOH_RATED_KWH: "number",
  SOH: "array", SOC_RAW: "string", SOC_DAYS: "number", CHARGES: "array", SPEED: "array", DRIVE_MIN: "object", TRIPS_LONGEST: "array",
  TRIPS_RECENT: "array", INSIGHTS: "array", TILES: "array", STATS: "array", DRIVES: "array", EFF_DAY: "object", EFF_BINS: "object",
  RESTS: "array", REST_SUM: "object", TYRE_COLD: "array", TYRE_HOT: "object", STYLE_TRIPS: "array", STYLE_PEAK: "array", STYLE: "object",
};
const bad = [];
for (const [k, t] of Object.entries(need)) {
  const v = d[k];
  const ok = t === "array" ? Array.isArray(v) : t === "object" ? v !== null && typeof v === "object" && !Array.isArray(v) : typeof v === t;
  if (!ok) bad.push(`${k}: expected ${t}`);
}
if (d.schemaVersion !== 1) bad.push(`schemaVersion ${d.schemaVersion} (UI expects 1)`);
if (d.SOH_RATED_KWH !== 71.2) bad.push("SOH_RATED_KWH must be 71.2 (health = capacity / rated)");
if (d.TILES?.length !== 8) bad.push("TILES must have 8 entries (8x1 desktop row)");
if (d.DAILY?.some((r) => r.date > d.TODAY)) bad.push("DAILY has days after TODAY");
// CHARGES[].site (optional): development name only - no digits (postal/unit/receipt no.), no street words, no "#"
for (const c of d.CHARGES ?? []) {
  if (c.site === undefined) continue;
  if (typeof c.site !== "string" || c.site.length > 60 || /[0-9#]/.test(c.site) || /\b(road|rd|street|avenue|ave|drive|lane|jalan|lorong|blk|block|unit|level)\b/i.test(c.site))
    bad.push(`CHARGES site "${c.site}" is not a plain development name`);
}
if (/(password|token|secret|api[_-]?key)/i.test(JSON.stringify(d))) bad.push("looks like a credential in the data");
if (bad.length) { console.error("dashboard.json contract check FAILED:\n- " + bad.join("\n- ")); process.exit(1); }
console.log(`dashboard.json OK: schema ${d.schemaVersion}, ${d.DAILY.length} days through ${d.TODAY}, updated ${d.UPDATED}`);
