// Data contract between the pipeline (scripts/build_ui_data.py) and the UI (src/Dashboard.tsx).
// src/data/dashboard.json must match DashboardData. Bump schemaVersion on a breaking change and
// update the pipeline and the UI in the same PR (see AGENTS.md "Data contract").
export type Bucket = { label: string; short?: string; km: number | null; kwh: number; kwhEst: number; cost: number; costEst: number; pending: boolean };
export type Day = Bucket & { date: string; short: string; src: string };
export type SohPoint = { date: string; rel: number; pctNew: number; kwh: number; lo: number; hi: number };
export type Charge = { label: string; time: string; tag: string; live: boolean; socFrom: number; socTo: number; socNote: string; profile: number[]; stats: [string, string][]; coverage?: number; finalPending?: boolean; site?: string /* development name only, e.g. "Nuovo" */ };
export type SpeedBin = { band: string; time: number; km: number; eff: number | null };
export type Trip = { when: string; km: number; min: number; eff: number; max: number; avg: number };
export type Tile = { icon: string; color: string; value: string; unit?: string; label: string; note: string };
export type Stat = { label: string; value: string; note: string; flag?: string };

export interface DashboardData {
  schemaVersion: 1;
  /** "23 Nov 2026": when the data was last refreshed (SGT) */
  UPDATED: string;
  /** "22 Nov": last day of XPENG export data */
  READINGS_TO: string;
  /** "2026-11-22": last data day shown (Monday refresh shows data through the Sunday before) */
  TODAY: string;
  START_DATE: string;
  DELIVERY: string;
  /** warranty points: SOH >= 70% at 8 yr / 160,000 km, >= 62% at 10 yr / 200,000 km */
  WARRANTY_Y8: string;
  WARRANTY_END: string;
  WEEKLY: Bucket[];
  MONTHLY: Bucket[];
  DAILY: Day[];
  /** rated pack capacity = 100% health (71.2 kWh) */
  SOH_RATED_KWH: number;
  SOH: SohPoint[];
  /** "minutes since START_DATE 00:00,SOC %,state(c|d|p)" joined by ";" */
  SOC_RAW: string;
  SOC_DAYS: number;
  CHARGES: Charge[];
  SPEED: SpeedBin[];
  /** date -> 24 hourly minutes moving */
  DRIVE_MIN: Record<string, number[]>;
  TRIPS_LONGEST: Trip[];
  TRIPS_RECENT: Trip[];
  INSIGHTS: string[];
  TILES: Tile[];
  STATS: Stat[];
  /** [date, start min of day, end min, km, minutes, kWh/100 km | null] */
  DRIVES: [string, number, number, number, number, number | null][];
  EFF_DAY: Record<string, number | null>;
  EFF_BINS: { avg: number; greenBelow: number; redFrom: number };
  /** [MM-DD, HH:MM, minutes, kWh, S$, avg kW] */
  RESTS: [string, string, number, number, number, number][];
  REST_SUM: { rests: number; hours: number; kwh: number; sgd: number; avgKw: number };
  /** [YYYY-MM-DD HH:MM, FL, FR, RL, RR] cold bar */
  TYRE_COLD: [string, number, number, number, number][];
  TYRE_HOT: { date: string; lo: number; hi: number };
  /** [pedal p95 %, brake p99 m/s², km, harsh count] */
  STYLE_TRIPS: [number, number, number, number][];
  /** [pedal max %, "MM-DD HH:MM"] */
  STYLE_PEAK: [number, string][];
  STYLE: { heavyPct: number; pedalP95: number; harshPer100: number; harshAcc: number; harshBrk: number; latG: number; latGMax: number; brakePct: number; brakeP99: number; silhouette: number; distinct: boolean };
}
