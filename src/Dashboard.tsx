import { Page, Section, Image, useState, useEffect, useRef, useGrokTheme } from "./kit";
import type { ReactNode } from "react";
import type { DashboardData, Bucket, Day } from "./data/types";
import raw from "./data/dashboard.json";
import carPng from "./assets/car-topdown-3x.png";

// ---- Data: src/data/dashboard.json, written by scripts/build_ui_data.py (never edit it by hand; see AGENTS.md) ----
// km = odometer km per day (XPENG export). kwh/cost = receipted; kwhEst/costEst = pending estimate (no receipt yet).
const DATA = raw as unknown as DashboardData;
const {
  UPDATED, READINGS_TO, START_DATE, TODAY, DELIVERY, WARRANTY_END, WARRANTY_Y8,
  WEEKLY, MONTHLY, DAILY, SOH_RATED_KWH, SOH, SOC_RAW, SOC_DAYS, CHARGES, SPEED, DRIVE_MIN,
  TRIPS_LONGEST, TRIPS_RECENT, INSIGHTS, TILES, STATS, DRIVES, EFF_DAY, EFF_BINS, RESTS, REST_SUM,
  TYRE_COLD, TYRE_HOT, STYLE_TRIPS, STYLE_PEAK, STYLE,
} = DATA;


// lo/hi: displayed SOC is whole %, so +-1 pt on the SOC gained (soh_lo / soh_hi)
// [minutes since 11 Nov 00:00, SOC %, state c=charging d=driving p=parked awake]; gaps > 30 min = asleep
// minutes moving per date x hour (SGT), from xpeng.drive_min_by_date_hour



const ACCENTS = ["#2F80ED", "#27AE60", "#F2994A", "#9B51E0", "#EB5757", "#00A3B4", "#D4A20B", "#6C5CE7"];
const FS = 14;

// Desktop layout switch (23 Nov): set by App from the frame width each render; phones (< 1024 px) keep the original single-column layout untouched
let DESK = false;
const vpSize = (): number => typeof window === "undefined" ? 0 : window.innerWidth;
function useViewportW(): number {
  const [vw, setVw] = useState<number>(vpSize);
  useEffect(() => {
    const f = () => setVw(vpSize());
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return vw;
}

function isDarkTheme(theme: { bg: { base: string } }): boolean {
  const k = (theme as unknown as { kind?: string }).kind;
  if (k) return k === "dark";
  const m = /^#([0-9a-f]{6})$/i.exec(String(theme.bg.base).trim());
  if (m && m[1]) {
    const n = parseInt(m[1], 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 128;
  }
  return false;
}

function utc(d: string): number {
  return Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
}
function niceCeil(v: number): number {
  if (!(v > 0)) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const m = steps.find((s) => n <= s) ?? 10;
  return m * p;
}
function effColor(v: number | null): { bg: string; ink: string } {
  if (v === null) return { bg: "#B8BEC4", ink: "#1F2933" };
  if (v <= 10) return { bg: "#2E9E4F", ink: "#FFFFFF" };
  if (v <= 12) return { bg: "#9ED36A", ink: "#1F2933" };
  if (v <= 14) return { bg: "#F2C94C", ink: "#1F2933" };
  if (v <= 16) return { bg: "#F2994A", ink: "#1F2933" };
  return { bg: "#E0453A", ink: "#FFFFFF" };
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [s, setS] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setS({ w: Math.floor(r.width), h: Math.floor(r.height) });
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w: s.w, h: s.h };
}

function Icon({ name }: { name: string }) {
  const s = { fill: "none", stroke: "#FFFFFF", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      {name === "route" && (
        <g>
          <path d="M5 17c0-4 10-3 10-7.5S7 6 7 3" {...s} />
          <circle cx="7" cy="3" r="1.6" fill="#FFFFFF" />
          <circle cx="5" cy="17" r="1.6" fill="#FFFFFF" />
        </g>
      )}
      {name === "coin" && (
        <g>
          <circle cx="10" cy="10" r="7" {...s} />
          <path d="M12.5 7.5c-.5-1-1.5-1.3-2.5-1.3-1.4 0-2.4.8-2.4 1.9 0 2.6 5 1.4 5 4 0 1.1-1 1.9-2.6 1.9-1.1 0-2.1-.4-2.6-1.3M10 5v1.2M10 13.8V15" {...s} strokeWidth={1.6} />
        </g>
      )}
      {name === "gauge" && (
        <g>
          <path d="M3.5 14.5a6.5 6.5 0 1 1 13 0" {...s} />
          <path d="M10 14.5l3.2-4.6" {...s} />
          <circle cx="10" cy="14.5" r="1.5" fill="#FFFFFF" />
        </g>
      )}
      {name === "bolt" && <polygon points="11.5,2 4,11.2 9.2,11.2 8.2,18 16,8.6 10.8,8.6" fill="#FFFFFF" />}
      {name === "battery" && (
        <g>
          <rect x="2.5" y="6" width="13" height="8" rx="2" {...s} />
          <rect x="16" y="8.5" width="2" height="3" rx="0.8" fill="#FFFFFF" />
          <rect x="4.5" y="8" width="9" height="4" rx="1" fill="#FFFFFF" />
        </g>
      )}
      {name === "range" && (
        <g>
          <circle cx="10" cy="10" r="7" {...s} />
          <circle cx="10" cy="10" r="3" fill="#FFFFFF" />
        </g>
      )}
      {name === "regen" && (
        <g>
          <path d="M15.5 8A6 6 0 0 0 4.6 7" {...s} />
          <path d="M4.5 12a6 6 0 0 0 10.9 1" {...s} />
          <path d="M4 3.5V7h3.5M16 16.5V13h-3.5" {...s} />
        </g>
      )}
      {name === "plug" && (
        <g>
          <path d="M7 3v4M13 3v4M5 7h10v3a5 5 0 0 1-10 0zM10 15v3" {...s} />
        </g>
      )}
    </svg>
  );
}

type Pt = { x: number; y: number };
function smoothSegs(p: Pt[]): [Pt, Pt, Pt, Pt][] {
  const n = p.length;
  if (n < 2) return [];
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = p[i]!, b = p[i + 1]!;
    const d = b.x - a.x || 1e-6;
    dx.push(d);
    m.push((b.y - a.y) / d);
  }
  const t: number[] = [m[0]!];
  for (let i = 1; i < n - 1; i++) {
    const m0 = m[i - 1]!, m1 = m[i]!, d0 = dx[i - 1]!, d1 = dx[i]!;
    t.push(m0 * m1 <= 0 ? 0 : (3 * (d0 + d1)) / ((2 * d1 + d0) / m0 + (d1 + 2 * d0) / m1));
  }
  t.push(m[n - 2]!);
  const segs: [Pt, Pt, Pt, Pt][] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = p[i]!, b = p[i + 1]!, h = dx[i]! / 3;
    segs.push([a, { x: a.x + h, y: a.y + t[i]! * h }, { x: b.x - h, y: b.y - t[i + 1]! * h }, b]);
  }
  return segs;
}
function segsD(segs: [Pt, Pt, Pt, Pt][]): string {
  return segs.map(([, a, b, e]) => ` C${a.x},${a.y} ${b.x},${b.y} ${e.x},${e.y}`).join("");
}
function smoothPath(p: Pt[]): string {
  const f = p[0];
  return f ? `M${f.x},${f.y}${segsD(smoothSegs(p))}` : "";
}

function utcDow(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
function tileDetail(t: (typeof TILES)[number]): string[] {
  const nights = DAILY.filter((d) => d.kwh > 0);
  const withKm = nights.filter((d) => d.km != null);
  const receiptOnly = nights.filter((d) => d.km == null);
  const chartKwh = nights.reduce((a, d) => a + d.kwh, 0);
  const kmAll = DAILY.reduce((a, d) => a + (d.km ?? 0), 0);
  const drivenCost = DAILY.filter((d) => d.km != null).reduce((a, d) => a + d.cost, 0);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  switch (t.label) {
    case "Driven since 11 Nov": {
      const kms = DAILY.map((d) => d.km ?? 0);
      const max = Math.max(0, ...kms);
      const maxD = DAILY.find((d) => d.km === max);
      let wd = 0, we = 0, wn = 0, en = 0;
      DAILY.forEach((d) => {
        const km = d.km ?? 0, dow = utcDow(d.date);
        if (dow === 0 || dow === 6) { we += km; en += 1; } else { wd += km; wn += 1; }
      });
      const lines = [`${DAILY.length} days · every day`, `longest ${max} km · ${maxD?.label ?? ""}`];
      if (wn && en) lines.push(`weekdays ${Math.round(wd / wn)} · weekends ${Math.round(we / en)}`);
      return lines;
    }
    case "Efficiency": {
      const ranked = SPEED.filter((s) => s.eff != null) as { band: string; eff: number }[];
      const best = ranked.reduce((a, s) => (s.eff < a.eff ? s : a), ranked[0]);
      const crawl = SPEED.find((s) => s.band.startsWith("0"));
      const parked = (t.note.match(/([\d.]+) incl/) || [])[1];
      const lines = [`driving ${t.value} · parked-in ${parked ?? "–"}`];
      if (best) lines.push(`best ${best.band} · ${best.eff} kWh/100 km`);
      if (crawl?.eff != null) lines.push(`< 20 km/h · ${crawl.eff}`);
      return lines;
    }
    case "Real full range": {
      const pack = SOH[SOH.length - 1]?.kwh;
      const km = Number(String(t.value).replace(/[^\d.]/g, ""));
      const lines: string[] = [];
      if (pack) lines.push(`${pack} kWh pack at ${EFF_BINS.avg} kWh/100 km`);
      if (km) lines.push(`WLTP 520 km · ${km > 520 ? "+" : ""}${Math.round(km - 520)} km`);
      return lines;
    }
    case "Per 100 km": {
      const billed = kmAll > 0 ? (drivenCost / kmAll) * 100 : 0;
      return [`est. ${EFF_BINS.avg} kWh × S$0.58`, `on chart S$${billed.toFixed(2)} / 100 km`, `S$${drivenCost.toFixed(2)} / ${kmAll} km to ${READINGS_TO}`];
    }
    case "Odometer": {
      const odo = Number(String(t.value).replace(/[^\d.]/g, ""));
      const start = odo - kmAll;
      const m = mon[Number(START_DATE.slice(5, 7)) - 1] ?? "";
      return [`at ${READINGS_TO}`, `${kmAll} km since ${Number(START_DATE.slice(8, 10))} ${m}`, start > 0 ? `at delivery ${start} km` : ""].filter(Boolean);
    }
    case "Regen share": {
      const rec = (t.note.match(/([\d.]+) kWh/) || [])[1];
      const per = kmAll > 0 && rec ? ((Number(rec) / kmAll) * 100).toFixed(1) : "";
      return [t.note, per ? `${per} kWh/100 km back` : "of drive energy"];
    }
    case "Battery health": {
      const p = SOH[SOH.length - 1];
      if (!p) return t.note ? [t.note] : [];
      return [`${p.kwh} kWh vs ${SOH_RATED_KWH} kWh rated`, `${p.pctNew}% of new · ${p.lo}–${p.hi}%`, "warranty 70% / 62% · 8 / 10 yr"];
    }
    case "Spent charging": {
      const totK = Number((t.note.match(/([\d.]+) kWh/) || [])[1] || 0);
      const rec = (t.note.match(/(\d+) receipts/) || [])[1];
      const withKmCost = withKm.reduce((a, d) => a + d.cost, 0);
      const onlyCost = receiptOnly.reduce((a, d) => a + d.cost, 0);
      const onlyK = receiptOnly.reduce((a, d) => a + d.kwh, 0);
      const lines = [`${rec ?? "–"} receipts · ${totK || chartKwh} kWh billed`, `${withKm.length} nights with km · S$${withKmCost.toFixed(2)}`];
      if (receiptOnly.length) lines.push(`${receiptOnly.length} after XPENG · S$${onlyCost.toFixed(2)} · ${onlyK} kWh`);
      return lines;
    }
    default:
      return t.note ? [t.note] : [];
  }
}

function Tiles() {
  const theme = useGrokTheme();
  const { ref, w } = useWidth();
  const cols = DESK ? 8 : w > 0 && w < 600 ? 2 : 4;
  const [tip, setTip] = useState<number | null>(null);
  return (
    <div ref={ref} style={{ minWidth: 0, flexShrink: DESK ? 0 : undefined }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: DESK ? 10 : 12 }}>
        {TILES.map((t, i) => DESK ? (
          <div key={t.label} onPointerEnter={() => setTip(i)} onPointerLeave={() => setTip(null)} style={{ position: "relative", background: t.color + "14", border: `2px solid ${t.color}`, borderRadius: 12, padding: "7px 10px 8px", display: "flex", flexDirection: "column", gap: 3, minWidth: 0, boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, background: t.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={t.icon} />
              </div>
              <span style={{ fontSize: 22, fontWeight: 700, lineHeight: "26px", color: theme.text.primary, letterSpacing: "-0.01em" }}>{t.value}</span>
              {t.unit && <span style={{ fontSize: 13, fontWeight: 600, color: theme.text.secondary }}>{t.unit}</span>}
            </div>
            <span style={{ fontSize: 13, color: theme.text.tertiary, lineHeight: "16px" }}><span style={{ fontWeight: 600, color: theme.text.secondary }}>{t.label}</span>{` · ${t.note}`}</span>
            {tip === i && (
              <div role="tooltip" style={{ position: "absolute", top: "100%", [i >= 6 ? "right" : "left"]: 0, marginTop: 6, zIndex: 9, minWidth: "100%", background: theme.bg.elevated, color: theme.text.primary, border: `1px solid ${theme.border.default}`, borderRadius: 8, padding: "6px 10px", fontSize: 13, lineHeight: "18px", whiteSpace: "nowrap", boxShadow: isDarkTheme(theme) ? "0 8px 24px rgba(0,0,0,0.55)" : "0 8px 24px rgba(20,20,20,0.16)" }}>
                {tileDetail(t).map((ln, k) => (
                  <div key={k} style={{ fontWeight: k === 0 ? 700 : 400, color: k === 0 ? theme.text.primary : theme.text.secondary }}>{ln}</div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div key={t.label} style={{ background: t.color + "14", border: `2px solid ${t.color}`, borderRadius: DESK ? 12 : 16, padding: DESK ? "7px 10px 8px" : "13px 12px 15px", display: "flex", flexDirection: "column", gap: DESK ? 2 : 6, minWidth: 0, boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <div style={{ width: DESK ? 24 : 32, height: DESK ? 24 : 32, borderRadius: DESK ? 7 : 10, background: t.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={t.icon} />
              </div>
              <span style={{ fontSize: DESK ? 13 : 14, fontWeight: 600, color: theme.text.secondary, lineHeight: DESK ? "16px" : "18px" }}>{t.label}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: DESK ? 22 : 28, fontWeight: 700, lineHeight: DESK ? "26px" : "32px", color: theme.text.primary, letterSpacing: "-0.01em" }}>{t.value}</span>
              {t.unit && <span style={{ fontSize: 14, fontWeight: 600, color: theme.text.secondary }}>{t.unit}</span>}
            </div>
            <span style={{ fontSize: 13, color: theme.text.tertiary, lineHeight: DESK ? "16px" : "17px" }}>{t.note}</span>
          </div>
        ))}
      </div>
      {!DESK && <div style={{ fontSize: 13, color: theme.text.tertiary, marginTop: 10 }}>{`XPENG data to ${READINGS_TO} · updated ${UPDATED}`}</div>}
    </div>
  );
}

function ChartLegend({ items, stack = false, cols, align = "start" }: { items: { kind: "bar" | "line" | "dash" | "dot" | "box" | "band"; color: string; label: string }[]; stack?: boolean; cols?: number; align?: "start" | "end" }) {
  const theme = useGrokTheme();
  const end = align === "end";
  return (
    <div style={cols ? { display: "grid", gridTemplateColumns: `repeat(${cols}, auto)`, gap: "4px 16px", justifyContent: end ? "end" : "start", justifyItems: end ? "end" : "start", fontSize: FS, color: theme.text.secondary } : { display: "flex", flexDirection: stack ? "column" : "row", flexWrap: stack ? "nowrap" : "wrap", gap: stack ? 4 : "6px 16px", alignItems: stack ? (end ? "flex-end" : "flex-start") : "center", fontSize: FS, color: theme.text.secondary }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {it.kind === "bar" && <span style={{ width: 12, height: 12, borderRadius: 3, background: it.color, display: "inline-block" }} />}
          {it.kind === "box" && <span style={{ width: 12, height: 12, borderRadius: 3, border: `1.5px dashed ${it.color}`, display: "inline-block", boxSizing: "border-box" }} />}
          {it.kind === "dot" && <span style={{ width: 10, height: 10, borderRadius: 5, background: it.color, display: "inline-block" }} />}
          {it.kind === "band" && <span style={{ width: 18, height: 10, borderRadius: 5, background: it.color + "4D", display: "inline-block" }} />}
          {it.kind === "line" && <span style={{ width: 18, height: 0, borderTop: `3px solid ${it.color}`, display: "inline-block" }} />}
          {it.kind === "dash" && <span style={{ width: 18, height: 0, borderTop: `2px dashed ${it.color}`, display: "inline-block" }} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}

function HeadRow({ title, children }: { title: string; children?: ReactNode }) {
  const theme = useGrokTheme();
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", flex: "none", minWidth: 0 }}>
      <h2 dir="auto" style={{ margin: 0, flex: "none", fontFamily: theme.font.family, fontSize: 24, lineHeight: "30px", letterSpacing: "-0.25px", fontWeight: 600, color: theme.text.primary }}>{title}</h2>
      {children && <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>{children}</div>}
    </div>
  );
}

function HoverTip({ x, y, boxW, boxH, lines }: { x: number; y: number; boxW: number; boxH: number; lines: string[] }) {
  const theme = useGrokTheme();
  if (!lines.length) return null;
  const estW = Math.min(boxW - 16, Math.max(80, ...lines.map((ln) => ln.length * 7.6 + 24)));
  const left = Math.max(estW / 2 + 6, Math.min(x, boxW - estW / 2 - 6));
  const below = y < 56;
  return (
    <div
      role="tooltip"
      style={{
        position: "absolute",
        left,
        top: Math.max(6, Math.min(y, boxH - 6)),
        transform: below ? "translate(-50%, 12px)" : "translate(-50%, calc(-100% - 10px))",
        pointerEvents: "none",
        zIndex: 8,
        background: theme.bg.elevated,
        color: theme.text.primary,
        border: `1px solid ${theme.border.default}`,
        borderRadius: 8,
        padding: "6px 10px",
        fontSize: 13,
        lineHeight: "18px",
        whiteSpace: "nowrap",
        boxShadow: isDarkTheme(theme) ? "0 8px 24px rgba(0,0,0,0.55)" : "0 8px 24px rgba(20,20,20,0.16)",
      }}
    >
      {lines.map((ln, i) => (
        <div key={i} style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? theme.text.primary : theme.text.secondary }}>{ln}</div>
      ))}
    </div>
  );
}

function Pills<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const theme = useGrokTheme();
  return (
    <div role="group" style={{ display: "flex", flexWrap: "wrap", gap: 6, maxWidth: "100%", minWidth: 0 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)} style={{ fontSize: 14, fontWeight: 600, lineHeight: "18px", padding: "7px 14px", borderRadius: 999, border: `1px solid ${theme.border.default}`, background: on ? theme.bg.base : "transparent", color: on ? theme.text.primary : theme.text.secondary, cursor: "pointer", fontFamily: "inherit" }}>{o.label}</button>
        );
      })}
    </div>
  );
}

type View = { lo: number; hi: number };
function ComboPanel() {
  const theme = useGrokTheme();
  const c = theme.dataviz.categorical;
  const [period, setPeriodRaw] = useState<"month" | "week" | "day">("day");
  const [view, setView] = useState<View | null>(null);
  const [panning, setPanning] = useState(false);
  const { ref, w, h } = useWidth();
  const narrow = w < 560;
  const all: Bucket[] = period === "month" ? MONTHLY : period === "week" ? WEEKLY : DAILY;
  const n = all.length;
  const minSpan = Math.min(n, period === "day" ? 3 : 1);
  const defSpan = period === "day" && narrow && !DESK ? Math.min(7, n) : n;
  const v: View = view ?? { lo: n - defSpan, hi: n };
  const span = v.hi - v.lo;
  const isDefault = Math.abs(v.lo - (n - defSpan)) < 0.01 && Math.abs(span - defSpan) < 0.01;
  const setPeriod = (p: "month" | "week" | "day") => { setPeriodRaw(p); setView(null); };
  const H = DESK ? Math.max(90, h) : narrow ? 320 : 360;
  const L = narrow ? 40 : 52, T = DESK ? 26 : 34, B = 34;
  const ph = H - T - B, base = T + ph;
  // y scales follow the bars whose centre is in view
  const inView = all.filter((_, i) => i + 0.5 >= v.lo - 0.01 && i + 0.5 <= v.hi + 0.01);
  const rows = inView.length ? inView : all;
  const leftMax = niceCeil(Math.max(1, ...rows.map((r) => Math.max(r.km ?? 0, r.kwh + r.kwhEst))) * 1.12);
  const div = [4, 3, 5].find((d) => Number.isInteger(leftMax / d) && (leftMax / d) % (leftMax / d >= 10 ? 5 : 1) === 0) ?? 4;
  const costMax = Math.max(0, ...rows.map((r) => r.cost + r.costEst));
  const rawRight = (costMax > 0 ? costMax : Math.max(0, ...all.map((r) => r.cost + r.costEst))) * 1.12 / div;
  const rp = Math.pow(10, Math.floor(Math.log10(rawRight > 0 ? rawRight : 1)));
  const rn = rawRight / rp;
  const rightMax = (rn <= 1 ? 1 : rn <= 2 ? 2 : rn <= 5 ? 5 : 10) * rp * div;
  const R = Math.max(narrow ? 46 : 60, 12 + `S$${rightMax}`.length * 8.2);
  const pw = Math.max(10, w - L - R);
  const yl = (x: number) => base - (x / leftMax) * ph;
  const yr = (x: number) => base - (x / rightMax) * ph;
  const bw = pw / Math.max(0.5, span);
  const barW = Math.max(6, Math.min(bw * 0.3, 44));
  const cx = (i: number) => L + (i + 0.5 - v.lo) * bw;
  const ticks = Array.from({ length: div + 1 }, (_, i) => i / div);
  // draw one extra bucket beyond each edge so the curve runs into the clip edge
  // while a pan drag is live, draw one extra screen each side; the plotted layer is translated (rAF), then re-rendered on release
  const extra = panning ? Math.ceil(span) + 1 : 0;
  const i0 = Math.max(0, Math.floor(v.lo) - 1 - extra), i1 = Math.min(n, Math.ceil(v.hi) + 1 + extra);
  const drawn = all.slice(i0, i1).map((r, k) => ({ r, i: i0 + k }));
  const pts = drawn.map(({ r, i }) => ({ x: cx(i), y: yr(r.cost + r.costEst), est: r.costEst > 0 }));
  const costLabel = (r: Bucket) => {
    const x = r.cost + r.costEst;
    const s = x === 0 ? "S$0" : `S$${x.toFixed(2)}`;
    return r.costEst > 0 ? `≈${s}` : s;
  };
  const line = smoothPath(pts);
  const first = pts[0], lastP = pts[pts.length - 1];
  const area = first && lastP && pts.length > 1 ? `${line} L${lastP.x},${base} L${first.x},${base} Z` : "";
  const labelEvery = Math.max(1, Math.ceil((narrow ? 22 : DESK ? 56 : 40) / bw));

  // ---- gestures: one finger / mouse drag = pan, two fingers = pinch-zoom x, double-tap = reset ----
  const zoomable = n > minSpan;
  const viewRef = useRef<View>(v);
  viewRef.current = v;
  const geo = useRef({ L, pw, n, minSpan, defSpan });
  geo.current = { L, pw, n, minSpan, defSpan };
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{ mode: "none" | "pending" | "pan" | "pinch"; x0: number; y0: number; v0: View; d0: number; a0: number; t0: number; moved: boolean }>({ mode: "none", x0: 0, y0: 0, v0: v, d0: 1, a0: 0, t0: 0, moved: false });
  const lastTap = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const plot = useRef<SVGGElement>(null);
  const pan = useRef({ on: false, lo: 0, sp: 1, raf: 0 });
  const pinchRaf = useRef<{ raf: number; v: View | null }>({ raf: 0, v: null });
  const endPan = () => {
    const p = pan.current;
    if (!p.on) return;
    if (p.raf) { cancelAnimationFrame(p.raf); p.raf = 0; }
    p.on = false;
    plot.current?.setAttribute("transform", `translate(${-geo.current.L},0)`);
    const nv = clampG(p.lo, p.sp);
    viewRef.current = nv;
    setView(nv);
    setPanning(false);
  };
  const localX = (clientX: number) => clientX - (box.current ? box.current.getBoundingClientRect().left : 0);
  const clampG = (lo: number, s: number): View => {
    const { n: nn, minSpan: ms } = geo.current;
    const ss = Math.min(Math.max(s, ms), nn);
    const l = Math.min(Math.max(lo, 0), nn - ss);
    return { lo: l, hi: l + ss };
  };
  const startPinch = () => {
    const ps = [...ptrs.current.values()];
    const a = ps[0], b = ps[1];
    if (!a || !b) return;
    const vv = viewRef.current;
    const mid = (a.x + b.x) / 2;
    g.current = { ...g.current, mode: "pinch", v0: vv, d0: Math.max(20, Math.abs(a.x - b.x)), a0: vv.lo + ((mid - geo.current.L) / geo.current.pw) * (vv.hi - vv.lo), moved: true };
  };
  const onDown = (e: { pointerId: number; clientX: number; clientY: number; pointerType: string; currentTarget: HTMLDivElement; button: number }) => {
    if (!zoomable || (e.pointerType === "mouse" && e.button !== 0)) return;
    ptrs.current.set(e.pointerId, { x: localX(e.clientX), y: e.clientY });
    if (ptrs.current.size === 2) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      endPan();
      startPinch();
    } else if (ptrs.current.size === 1) {
      g.current = { mode: e.pointerType === "mouse" ? "pan" : "pending", x0: localX(e.clientX), y0: e.clientY, v0: viewRef.current, d0: 1, a0: 0, t0: Date.now(), moved: false };
      if (e.pointerType === "mouse") { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
    }
  };
  const onMove = (e: { pointerId: number; clientX: number; clientY: number; currentTarget: HTMLDivElement }) => {
    if (!ptrs.current.has(e.pointerId)) return;
    const x = localX(e.clientX);
    ptrs.current.set(e.pointerId, { x, y: e.clientY });
    const s = g.current;
    if (s.mode === "pending") {
      const dx = x - s.x0, dy = e.clientY - s.y0;
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        s.mode = "pan"; s.moved = true;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      } else if (Math.abs(dy) > 8) { s.mode = "none"; s.moved = true; }
      return;
    }
    if (s.mode === "pan") {
      const sp = s.v0.hi - s.v0.lo;
      if (Math.abs(x - s.x0) > 3) s.moved = true;
      const p = pan.current;
      p.lo = clampG(s.v0.lo - ((x - s.x0) / geo.current.pw) * sp, sp).lo;
      p.sp = sp;
      if (!p.on) { p.on = true; setPanning(true); }
      if (!p.raf) p.raf = requestAnimationFrame(() => {
        p.raf = 0;
        if (p.on) plot.current?.setAttribute("transform", `translate(${-geo.current.L + (s.v0.lo - p.lo) * (geo.current.pw / sp)},0)`);
      });
    } else if (s.mode === "pinch") {
      const ps = [...ptrs.current.values()];
      const a = ps[0], b = ps[1];
      if (!a || !b) return;
      const d = Math.max(20, Math.abs(a.x - b.x));
      const mid = (a.x + b.x) / 2;
      const ns = Math.min(Math.max((s.v0.hi - s.v0.lo) * (s.d0 / d), geo.current.minSpan), geo.current.n);
      const pr = pinchRaf.current;
      pr.v = clampG(s.a0 - ((mid - geo.current.L) / geo.current.pw) * ns, ns);
      if (!pr.raf) pr.raf = requestAnimationFrame(() => { pr.raf = 0; if (pr.v) setView(pr.v); });
    }
  };
  const onUp = (e: { pointerId: number; clientX: number; type: string }) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.delete(e.pointerId);
    const s = g.current;
    if (ptrs.current.size === 1 && s.mode === "pinch") {
      const rest = [...ptrs.current.values()][0];
      if (rest) g.current = { ...s, mode: "pan", x0: rest.x, v0: viewRef.current };
      return;
    }
    if (ptrs.current.size === 0) {
      endPan();
      if (e.type === "pointerup" && !s.moved && Date.now() - s.t0 < 300) {
        const now = Date.now();
        if (now - lastTap.current < 320) { setView(null); lastTap.current = 0; } else lastTap.current = now;
      }
      g.current = { ...s, mode: "none" };
    }
  };
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (geo.current.n <= geo.current.minSpan) return;
      const vv = viewRef.current;
      const sp = vv.hi - vv.lo;
      const { L: l, pw: p } = geo.current;
      if (e.ctrlKey || e.metaKey || e.altKey) {
        e.preventDefault();
        const x = e.clientX - el.getBoundingClientRect().left;
        const a = vv.lo + ((x - l) / p) * sp;
        const ns = sp * Math.exp(e.deltaY * 0.004);
        const cl = Math.min(Math.max(ns, geo.current.minSpan), geo.current.n);
        setView(clampG(a - ((x - l) / p) * cl, cl));
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
        e.preventDefault();
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        setView(clampG(vv.lo + (d / p) * sp, sp));
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [w > 0]);
  const comboLegend = [
    { kind: "bar" as const, color: c[0], label: "km" },
    { kind: "bar" as const, color: c[1], label: "kWh" },
    { kind: "line" as const, color: c[2], label: "S$" },
    ...(rows.some((r) => r.pending) ? [{ kind: "box" as const, color: theme.text.tertiary, label: "pending" }] : []),
  ];
  const comboPills = (
        <Pills<"month" | "week" | "day">
          options={[{ value: "day", label: "Daily" }, { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }]}
          value={period}
          onChange={(v: "month" | "week" | "day") => setPeriod(v)}
        />
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: DESK ? 8 : 12, minWidth: 0, height: DESK ? "100%" : undefined, minHeight: DESK ? 0 : undefined }}>
      {DESK ? (
        <HeadRow title="Distance, energy and cost">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            {comboPills}
            <ChartLegend items={comboLegend} />
          </div>
        </HeadRow>
      ) : (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", flex: "none" }}>
        {comboPills}
        <ChartLegend items={comboLegend} />
      </div>
      )}
      <div ref={ref} style={{ width: "100%", minWidth: 0, ...(DESK ? { flex: 1, minHeight: 0 } : { minHeight: H }) }}>
        {w > 0 && (!DESK || h > 0) && (
          <div
            ref={box}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            style={{ position: "relative", touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none", cursor: zoomable ? "grab" : "default", width: w, height: H }}
          >
            {!isDefault && (
              <button type="button" onClick={() => setView(null)} style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", fontSize: 13, fontWeight: 700, lineHeight: "16px", padding: "5px 12px", borderRadius: 999, border: `1.5px solid ${c[2]}`, background: theme.bg.base, color: theme.text.primary, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>↺ Reset</button>
            )}
          <svg width={w} height={H} style={{ display: "block", pointerEvents: "none" }} role="img" aria-label="Distance, energy charged and cost over time">
            <defs>
              <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c[2]} stopOpacity={0.22} />
                <stop offset="100%" stopColor={c[2]} stopOpacity={0} />
              </linearGradient>
            </defs>
            {ticks.map((f) => (
              <g key={f}>
                <line x1={L} x2={w - R} y1={base - f * ph} y2={base - f * ph} stroke={theme.border.subtle} />
                <text x={L - 8} y={base - f * ph + 5} textAnchor="end" fontSize={FS} fill={theme.text.tertiary}>{Math.round(leftMax * f)}</text>
                <text x={w - R + 8} y={base - f * ph + 5} textAnchor="start" fontSize={FS} fill={theme.text.tertiary}>{`S$${Math.round(rightMax * f)}`}</text>
              </g>
            ))}
            {!DESK && <text x={0} y={T - 16} textAnchor="start" fontSize={FS} fill={theme.text.tertiary}>km · kWh</text>}
            {!DESK && <text x={w} y={T - 16} textAnchor="end" fontSize={FS} fill={theme.text.tertiary}>S$</text>}
            <svg x={L} y={0} width={pw} height={H} overflow="hidden">
            <g ref={plot} transform={`translate(${-L},0)`}>
            {drawn.map(({ r, i }) => {
              const kx = cx(i) - barW - 2;
              const ex = cx(i) + 2;
              const etot = r.kwh + r.kwhEst;
              const showVals = barW >= 12;
              return (
                <g key={r.label}>
                  {r.km === null ? (
                    <rect x={kx} y={base - 22} width={barW} height={22} fill="none" stroke={theme.border.strong} strokeDasharray="4 3" rx={3} />
                  ) : (
                    <g>
                      <rect x={kx} y={yl(r.km)} width={barW} height={base - yl(r.km)} fill={c[0]} rx={3} />
                      {showVals && <text x={kx + barW / 2} y={yl(r.km) - 6} textAnchor="middle" fontSize={13} fontWeight={600} fill={theme.text.secondary}>{Math.round(r.km)}</text>}
                    </g>
                  )}
                  {r.kwh > 0 && <rect x={ex} y={yl(r.kwh)} width={barW} height={base - yl(r.kwh)} fill={c[1]} rx={3} />}
                  {r.kwhEst > 0 && <rect x={ex} y={yl(etot)} width={barW} height={yl(r.kwh) - yl(etot)} fill={c[1] + theme.dataviz.areaAlpha} stroke={c[1]} strokeWidth={1.5} strokeDasharray="4 3" rx={3} />}
                  {etot > 0 && showVals && <text x={ex + barW / 2} y={yl(etot) - 6} textAnchor="middle" fontSize={13} fontWeight={600} fill={theme.text.secondary}>{`${r.kwhEst > 0 ? "≈" : ""}${Math.round(etot)}`}</text>}
                  {(n - 1 - i) % labelEvery === 0 && <text x={cx(i)} y={base + 22} textAnchor="middle" fontSize={FS} fill={theme.text.tertiary}>{narrow && r.short ? r.short : r.label}</text>}
                </g>
              );
            })}
            {area && <path d={area} fill="url(#costFill)" />}
            {pts.length > 1 && <path d={line} fill="none" stroke={c[2]} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
            {pts.map((p, i) => (
              <circle key={`c${i}`} cx={p.x} cy={p.y} r={p.est ? 5.5 : 5} fill={p.est ? theme.bg.base : c[2]} stroke={p.est ? c[2] : theme.bg.base} strokeWidth={p.est ? 2.5 : 2} strokeDasharray={p.est ? "3 2" : undefined} />
            ))}
            {drawn.map(({ r }, i) => {
              const p = pts[i];
              if (!p) return null;
              if (r.cost + r.costEst === 0) return null;
              const s = costLabel(r);
              const tw = s.length * 7.8;
              const dk = isDarkTheme(theme);
              const ink = dk ? "#7EEBF2" : "#0A6670";
              const shadow = { textShadow: dk ? "0 1px 3px rgba(0,0,0,0.9)" : "0 1px 2px rgba(0,0,0,0.22)" };
              // Daily: always horizontal above the dot. Week/month may rotate if the bucket is too narrow.
              if (period === "day" || tw <= bw - 4) {
                const valYs = barW >= 12 ? [r.km === null ? null : yl(r.km) - 6, r.kwh + r.kwhEst > 0 ? yl(r.kwh + r.kwhEst) - 6 : null].filter((v): v is number => v !== null) : [];
                let ly = p.y - 12;
                if (valYs.some((v) => Math.abs(v - ly) < 16)) ly = Math.min(...valYs) - 18;
                if (ly < 14) ly = 14;
                return <text key={`l${i}`} x={p.x} y={ly} textAnchor="middle" fontSize={13} fontWeight={700} fill={ink} style={shadow}>{s}</text>;
              }
              const up = p.y - 12 - tw >= 4;
              return (
                <text key={`l${i}`} x={p.x} y={up ? p.y - 11 : p.y + 11} textAnchor={up ? "start" : "end"} dominantBaseline="central" transform={`rotate(-90 ${p.x} ${up ? p.y - 11 : p.y + 11})`} fontSize={13} fontWeight={700} fill={ink} style={shadow}>{s}</text>
              );
            })}
            </g>
            </svg>
            {span < n - 0.01 && (
              <g>
                <rect x={L} y={H - 5} width={pw} height={4} rx={2} fill={theme.border.subtle} />
                <rect x={L + (v.lo / n) * pw} y={H - 5} width={Math.max(8, (span / n) * pw)} height={4} rx={2} fill={c[2]} />
              </g>
            )}
          </svg>
          </div>
        )}
      </div>
    </div>
  );
}

function SohPanel() {
  const theme = useGrokTheme();
  const dv = theme.dataviz;
  const hc = dv.categorical[0];
  const risk = "#E0453A";
  const [view, setView] = useState<"10y" | "zoom">(DESK ? "zoom" : "10y");
  const [tip, setTip] = useState<number | null>(null);
  const zoom = view === "zoom";
  const { ref, w, h } = useWidth();
  const narrow = w < 560;
  const H = DESK ? Math.max(90, h) : narrow ? 280 : 330;
  const L = 48, R = DESK ? 14 : 18, T = DESK ? 6 : 22, B = DESK ? 32 : 38;
  const pw = Math.max(10, w - L - R), ph = H - T - B;
  const t0 = utc(DELIVERY), t1 = utc(WARRANTY_END), t8 = utc(WARRANTY_Y8);
  const xMin = zoom ? utc("2026-11-01") : t0;
  const xMax = zoom ? utc("2027-02-28") : t1;
  const yMin = zoom ? 95 : 50, yMax = zoom ? 115 : 120;
  const x = (t: number) => L + ((t - xMin) / (xMax - xMin)) * pw;
  const y = (v: number) => T + ph - ((Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin)) * ph;
  const warr = (t: number) => (t <= t8 ? 100 - (30 * (t - t0)) / (t8 - t0) : 70 - (8 * (t - t8)) / (t1 - t8));
  const yTicks = (zoom ? [100, 95, 105, 110, 115] : [62, 70, 100, 50, 120, 110, 90, 80])
    .reduce<number[]>((a, v) => (a.every((u) => Math.abs(((u - v) / (yMax - yMin)) * ph) >= 16) ? [...a, v] : a), []);
  const xTicks = zoom
    ? [
        { t: utc("2026-11-01"), label: narrow ? "Nov" : "1 Nov 2026" },
        { t: utc("2026-12-01"), label: narrow ? "Dec" : "1 Dec" },
        { t: utc("2027-01-01"), label: narrow ? "Jan" : "1 Jan 2027" },
        { t: utc("2027-02-01"), label: narrow ? "Feb" : "1 Feb" },
      ]
    : (narrow ? [2026, 2031, 2036] : [2026, 2028, 2030, 2032, 2034, 2036]).map((yr) => ({ t: utc(`${yr}-11-10`), label: narrow ? `${yr}` : `Nov ${yr}` }));
  const wa = Math.max(xMin, t0);
  const pts = SOH.map((p) => ({ x: x(utc(p.date)), y: y(p.rel), hi: y(p.hi), lo: y(p.lo) }));
  const l = pts[pts.length - 1];
  const last = SOH[SOH.length - 1];
  const pill = last ? `${last.rel}%` : "";
  const pillW = pill.length * 8.4 + 18;
  const pillRight = l ? l.x + 16 + pillW < w - R : true;
  const sub = last && !narrow ? `${last.pctNew}% of new` : "";
  const wx0 = x(wa), wx1 = x(xMax), wy0 = y(warr(wa)), wy1 = y(warr(xMax));
  const w8 = !zoom ? { x: x(t8), y: y(70) } : null;
  const wd = w8 ? `M${wx0},${wy0} L${w8.x},${w8.y} L${wx1},${wy1}` : `M${wx0},${wy0} L${wx1},${wy1}`;
  const sohLegend = [
    { kind: "dot" as const, color: hc, label: `Health (${SOH_RATED_KWH} kWh rated = 100%)` },
    { kind: "dash" as const, color: dv.other, label: "Warranty 70% at yr 8 · 62% at yr 10" },
  ];
  const sohPills = (
        <Pills<"10y" | "zoom">
          options={DESK
            ? [{ value: "zoom", label: "First 3 months" }, { value: "10y", label: "10 years" }]
            : [{ value: "10y", label: "10 years" }, { value: "zoom", label: "First 3 months" }]}
          value={view}
          onChange={(v: "10y" | "zoom") => setView(v)}
        />
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: DESK ? 8 : 12, minWidth: 0, height: DESK ? "100%" : undefined, minHeight: DESK ? 0 : undefined }}>
      {DESK ? (
        <HeadRow title="Battery health vs warranty">{sohPills}</HeadRow>
      ) : (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", flex: "none" }}>
        {sohPills}
        <ChartLegend items={sohLegend} />
      </div>
      )}
      <div ref={ref} style={{ position: "relative", width: "100%", minWidth: 0, ...(DESK ? { flex: 1, minHeight: 0 } : { minHeight: H }) }}>
        {w > 0 && (!DESK || h > 0) && (
          <>
          <svg width={w} height={H} style={{ display: "block" }} role="img" aria-label="Battery health against the warranty line">
            <defs>
              <linearGradient id="sohRisk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={risk} stopOpacity={0.16} />
                <stop offset="100%" stopColor={risk} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="sohWarr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={dv.other} stopOpacity={0.14} />
                <stop offset="100%" stopColor={dv.other} stopOpacity={0} />
              </linearGradient>
            </defs>
            {!zoom && <rect x={L} y={y(62)} width={w - R - L} height={y(yMin) - y(62)} fill="url(#sohRisk)" />}
            {!zoom && <path d={`${wd} L${wx1},${y(62)} L${wx0},${y(62)} Z`} fill="url(#sohWarr)" />}
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} stroke={v === 62 ? risk : theme.border.subtle} strokeOpacity={v === 62 ? 0.5 : 1} strokeDasharray={v === 62 ? "2 4" : undefined} />
                <text x={L - 10} y={y(v) + 5} textAnchor="end" fontSize={FS} fill={v === 62 ? risk : theme.text.tertiary} fontWeight={v === 62 ? 700 : 400}>{`${v}%`}</text>
              </g>
            ))}
            {xTicks.map((k, i) => (
              <text key={k.label} x={x(k.t)} y={H - B + 26} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 && !zoom ? "end" : "middle"} fontSize={FS} fill={theme.text.tertiary}>{k.label}</text>
            ))}
            {zoom && <line x1={x(t0)} x2={x(t0)} y1={T} y2={T + ph} stroke={theme.border.default} strokeDasharray="2 4" />}
            <path d={wd} fill="none" stroke={dv.other} strokeWidth={2} strokeDasharray="7 6" strokeLinecap="round" />
            {w8 && <circle cx={w8.x} cy={w8.y} r={4} fill={dv.other} />}
            {w8 && <circle cx={wx1} cy={wy1} r={4} fill={dv.other} />}
            {w8 && <text x={w8.x - 10} y={w8.y + 16} textAnchor="end" fontSize={FS} fontWeight={600} fill={theme.text.secondary}>{narrow ? "70% by 2034" : "70% by Nov 2034"}</text>}
            {!zoom && <text x={w - R} y={y(62) + 22} textAnchor="end" fontSize={FS} fontWeight={600} fill={theme.text.secondary}>{narrow ? "62% by 2036" : "62% by Nov 2036"}</text>}
            {pts.length > 1 && <path d={smoothPath(pts)} fill="none" stroke={hc} strokeWidth={2.5} strokeLinecap="round" />}
            {pts.map((p, i) => (
              <g key={i} onPointerEnter={() => { if (DESK) setTip(i); }} onPointerLeave={() => { if (DESK) setTip(null); }} style={{ cursor: DESK ? "pointer" : undefined }}>
                <circle cx={p.x} cy={p.y} r={12} fill={hc} fillOpacity={0} />
                <circle cx={p.x} cy={p.y} r={tip === i ? 6 : 4.5} fill={hc} />
              </g>
            ))}
            {l && last && (() => {
              const chipH = 24;
              const chipY = Math.max(T + 2, Math.min(l.y - chipH / 2, T + ph - chipH - 2));
              const chipX = pillRight ? l.x + 14 : l.x - 14 - pillW;
              const tx = chipX + pillW / 2;
              const ty = chipY + 17;
              const subX = pillRight ? chipX + pillW + 8 : chipX - 8;
              return (
              <g>
                <rect x={chipX} y={chipY} width={pillW} height={chipH} rx={12} fill={hc} />
                <text x={tx} y={ty} textAnchor="middle" fontSize={14} fontWeight={700} fill="#FFFFFF">{pill}</text>
                {sub && <text x={subX} y={ty} textAnchor={pillRight ? "start" : "end"} fontSize={13} fill={theme.text.secondary}>{sub}</text>}
              </g>
              );
            })()}
          </svg>
          {DESK && tip !== null && (() => {
            const p = SOH[tip];
            const pt = pts[tip];
            if (!p || !pt) return null;
            const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(p.date.slice(5, 7)) - 1] ?? "";
            const lines = [Number(p.date.slice(8, 10)) + " " + mon, p.rel + "% · " + p.kwh + " kWh", p.pctNew + "% of new · " + p.lo + "–" + p.hi + "%"];
            return <HoverTip x={pt.x} y={pt.y} boxW={w} boxH={H} lines={lines} />;
          })()}
          </>
        )}
      </div>
    </div>
  );
}

const UNKNOWN = { bg: "#B8BEC4", ink: "#1F2933" };
const BINS = [
  { label: "0", bg: "#E8ECEF", ink: "#1F2933" },
  { label: "1–29", bg: "#2E9E4F", ink: "#FFFFFF" },
  { label: "30–59", bg: "#F2C94C", ink: "#1F2933" },
  { label: "60–89", bg: "#F2994A", ink: "#1F2933" },
  { label: "90–119", bg: "#E0453A", ink: "#FFFFFF" },
  { label: "120+", bg: "#8E44AD", ink: "#FFFFFF" },
];
function binOf(km: number): number {
  if (km <= 0) return 0;
  if (km < 30) return 1;
  if (km < 60) return 2;
  if (km < 90) return 3;
  if (km < 120) return 4;
  return 5;
}

function DistanceCalendar() {
  const theme = useGrokTheme();
  const { ref, w } = useWidth();
  const wide = DESK || w >= 900;
  const byDate = new Map<string, Day>();
  DAILY.forEach((d) => byDate.set(d.date, d));
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const months: { y: number; m: number }[] = [];
  let yy = Number(START_DATE.slice(0, 4)), mm = Number(START_DATE.slice(5, 7));
  const ey = Number(TODAY.slice(0, 4)), em = Number(TODAY.slice(5, 7));
  while (yy < ey || (yy === ey && mm <= em)) {
    months.push({ y: yy, m: mm });
    mm += 1;
    if (mm > 12) { mm = 1; yy += 1; }
  }
  // desktop: 2 months side by side (latest two; until a 2nd month exists, the next month shows as an empty grid)
  const pair = [...months];
  const lastM = pair[pair.length - 1];
  if (pair.length < 2 && lastM) pair.push(lastM.m === 12 ? { y: lastM.y + 1, m: 1 } : { y: lastM.y, m: lastM.m + 1 });
  const shown = wide ? pair.slice(-2) : [...months].reverse();
  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: DESK ? 8 : 14, minWidth: 0, height: DESK ? "100%" : undefined, minHeight: 0 }}>
      <div style={wide ? { display: "grid", gridTemplateColumns: DESK ? "repeat(2, minmax(0, 1fr))" : "repeat(2, minmax(0, 520px))", gap: DESK ? 20 : 48, minWidth: 0, flex: DESK ? 1 : undefined, minHeight: 0 } : { display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
        {shown.map(({ y, m }) => {
          const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
          const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
          return (
            <div key={`${y}-${m}`} style={{ minWidth: 0, width: "100%", maxWidth: wide ? undefined : 560, height: DESK ? "100%" : undefined, minHeight: 0, display: DESK ? "flex" : undefined, flexDirection: DESK ? "column" : undefined, overflow: DESK ? "hidden" : undefined }}>
              <div style={{ fontSize: DESK ? 14 : 15, fontWeight: 600, color: theme.text.primary, marginBottom: DESK ? 4 : 8, flex: "none" }}>{`${names[m - 1]} ${y}`}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gridTemplateRows: DESK ? "auto repeat(6, minmax(0, 1fr))" : undefined, gap: DESK ? 3 : 4, flex: DESK ? 1 : undefined, minHeight: 0 }}>
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <div key={`h${i}`} style={{ fontSize: 13, color: theme.text.tertiary, textAlign: "center", paddingBottom: DESK ? 0 : 2 }}>{d}</div>
                ))}
                {Array.from({ length: offset }, (_, i) => <div key={`b${i}`} />)}
                {Array.from({ length: dim }, (_, k) => {
                  const day = k + 1;
                  const key = `${y}-${pad(m)}-${pad(day)}`;
                  const outside = key < START_DATE || key > TODAY;
                  const d = byDate.get(key);
                  const km = d ? d.km : null;
                  const style = outside ? null : km === null ? UNKNOWN : BINS[binOf(km)];
                  return (
                    <div
                      key={key}
                      title={outside ? undefined : km === null ? `${day} ${names[m - 1]}: no data yet` : `${day} ${names[m - 1]}: ${Math.round(km)} km`}
                      style={{ aspectRatio: DESK ? undefined : "1 / 1", height: DESK ? "100%" : undefined, minHeight: 0, borderRadius: 8, background: style ? style.bg : "transparent", color: style ? style.ink : theme.text.tertiary, border: style ? "none" : `1px solid ${theme.border.subtle}`, display: "flex", flexDirection: DESK ? "row" : "column", justifyContent: "space-between", alignItems: DESK ? "flex-start" : undefined, padding: DESK ? "5px 6px" : "4px 5px", minWidth: 0, overflow: "hidden", boxSizing: "border-box" }}
                    >
                      <span style={{ fontSize: 13, lineHeight: "13px", fontWeight: DESK ? 500 : 500, opacity: DESK ? 0.62 : 1 }}>{day}</span>
                      <span style={{ fontSize: DESK ? 16 : 15, lineHeight: DESK ? "16px" : "16px", fontWeight: 800, textAlign: "right", letterSpacing: DESK ? "-0.03em" : undefined }}>{outside ? "" : km === null ? "?" : Math.round(km)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", alignItems: "center", fontSize: 13, color: theme.text.secondary, flex: "none" }}>
        {[{ label: "? no data", bg: UNKNOWN.bg }, ...BINS.map((b) => ({ label: b.label, bg: b.bg }))].map((b) => (
          <span key={b.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: b.label === "0" ? theme.bg.subtle : b.bg, display: "inline-block" }} />
            {b.label}
          </span>
        ))}
        <span style={{ color: theme.text.tertiary }}>km/day</span>
      </div>
    </div>
  );
}

const SOC_PTS = SOC_RAW.split(";").map((s) => {
  const p = s.split(",");
  return { m: Number(p[0]), v: Number(p[1]), st: p[2] ?? "p" };
});
const STATE_COLORS: Record<string, string> = { c: "#27AE60", d: "#2F80ED", p: "#9AA3AD" };

function SocChart() {
  const theme = useGrokTheme();
  const { ref, w, h } = useWidth();
  const narrow = w < 560;
  const H = DESK ? Math.max(90, h) : narrow ? 262 : 312;
  const L = 46, R = 10, T = DESK ? 8 : 12, B = 46;
  const pw = Math.max(10, w - L - R), ph = H - T - B;
  const span = SOC_DAYS * 1440;
  const x = (m: number) => L + (m / span) * pw;
  const y = (v: number) => T + ph - (v / 108) * ph;
  const dark = isDarkTheme(theme);
  const weInk = dark ? "#C9A7F5" : "#6C3FA0";
  const dayW = pw / SOC_DAYS;
  const every = dayW < 18 ? Math.ceil(18 / dayW) : 1;
  const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthLabel = MONS[Number(START_DATE.slice(5, 7)) - 1] ?? "";
  const socLegend = [
    { kind: "line" as const, color: STATE_COLORS.c, label: "Charging" },
    { kind: "line" as const, color: STATE_COLORS.d, label: "Driving" },
    { kind: "line" as const, color: STATE_COLORS.p, label: "Parked (awake)" },
    { kind: "dash" as const, color: STATE_COLORS.p + "80", label: "Asleep (no data)" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: DESK ? 8 : 12, minWidth: 0, height: DESK ? "100%" : undefined, minHeight: DESK ? 0 : undefined }}>
      {DESK ? (
        <HeadRow title="Battery charge over time">
          <ChartLegend items={socLegend} cols={2} align="end" />
        </HeadRow>
      ) : (
      <div style={{ flex: "none" }}>
      <ChartLegend items={socLegend} />
      </div>
      )}
      <div ref={ref} style={{ position: "relative", width: "100%", minWidth: 0, ...(DESK ? { flex: 1, minHeight: 0 } : { minHeight: H }) }}>
        {w > 0 && (!DESK || h > 0) && (
          <svg width={w} height={H} style={{ display: "block" }} role="img" aria-label="Battery charge over time">
            {[0, 25, 50, 75, 100].map((v) => (
              <g key={v}>
                <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} stroke={theme.border.subtle} />
                <text x={L - 8} y={y(v) + 5} textAnchor="end" fontSize={FS} fill={theme.text.tertiary}>{`${v}%`}</text>
              </g>
            ))}
            {Array.from({ length: SOC_DAYS }, (_, d) => {
              const dt = new Date(utc(START_DATE) + d * 86400000);
              const wd = dt.getUTCDay();
              const we = wd === 0 || wd === 6;
              const cxm = x(d * 1440 + 720);
              const dow = DOW3[wd] ?? "";
              const showLab = d % every === 0;
              return (
                <g key={`d${d}`}>
                  {we && <rect x={x(d * 1440)} y={T} width={x(1440) - x(0)} height={ph} fill="#9B51E0" fillOpacity={0.08} />}
                  <line x1={x(d * 1440)} x2={x(d * 1440)} y1={T} y2={T + ph + 8} stroke={theme.border.default} />
                  {showLab && <text x={cxm} y={T + ph + 20} textAnchor="middle" fontSize={13} fill={we ? weInk : theme.text.tertiary}>{dayW >= 30 ? dow : dow.slice(0, 1)}</text>}
                  {showLab && <text x={cxm} y={T + ph + 38} textAnchor="middle" fontSize={FS} fontWeight={700} fill={we ? weInk : theme.text.secondary}>{dt.getUTCDate()}</text>}
                </g>
              );
            })}
            <line x1={x(SOC_DAYS * 1440)} x2={x(SOC_DAYS * 1440)} y1={T} y2={T + ph + 8} stroke={theme.border.default} />
            <text x={L - 8} y={T + ph + 38} textAnchor="end" fontSize={13} fill={theme.text.tertiary}>{monthLabel}</text>
            {SOC_PTS.map((b, i) => {
              if (i === 0) return null;
              const a = SOC_PTS[i - 1];
              if (!a) return null;
              const asleep = b.m - a.m > 30;
              return (
                <line key={`s${i}`} x1={x(a.m)} y1={y(a.v)} x2={x(b.m)} y2={y(b.v)} stroke={STATE_COLORS[asleep ? "p" : b.st] ?? "#9AA3AD"} strokeOpacity={asleep ? 0.45 : 1} strokeWidth={asleep ? 1.5 : 3} strokeDasharray={asleep ? "2 5" : undefined} strokeLinecap={asleep ? "butt" : "round"} />
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

/** Neighbourhood tile only — no pin, no street. Keys match Charge.site from the receipt. */
const SITE_TILES: Record<string, { src: string; cx: string; cy: string }> = {
  Nuovo: {
    src: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/12/2032/3229",
    cx: "52%",
    cy: "28%",
  },
};

function SiteMap({ site }: { site?: string }) {
  const theme = useGrokTheme();
  const { ref, w, h } = useWidth();
  if (!site) return null;
  const tiles = SITE_TILES[site];
  const side = Math.max(w, h, 1);
  return (
    <div style={{ flex: DESK ? "0 0 220px" : undefined, width: DESK ? 220 : "100%", alignSelf: DESK ? "stretch" : undefined, minHeight: DESK ? 0 : undefined, display: "flex", flexDirection: "column", gap: DESK ? 2 : 4, pointerEvents: "none" }}>
      {tiles && (
        <div ref={ref} aria-hidden="true" style={{ position: "relative", flex: DESK ? 1 : undefined, height: DESK ? undefined : 132, minHeight: DESK ? 0 : undefined, borderRadius: 8, overflow: "hidden", border: `1px solid ${theme.border.subtle}`, background: theme.bg.subtle }}>
          {w > 0 && h > 0 && (
            <div style={{ position: "absolute", top: "50%", left: "50%", width: side, height: side, transform: "translate(-50%, -50%)" }}>
              <img src={tiles.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <div style={{ position: "absolute", left: tiles.cx, top: tiles.cy, width: "32%", aspectRatio: "1", transform: "translate(-50%,-50%)", borderRadius: "50%", background: "#27AE6033", border: "2px solid #27AE60", boxSizing: "border-box" }} />
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 700, color: theme.text.secondary, lineHeight: "18px", height: DESK ? 18 : undefined, flex: "none" }}>{site}<span style={{ fontWeight: 500, color: theme.text.tertiary }}>{` · map`}</span></div>
    </div>
  );
}

function ChargeCards({ swipe = false }: { swipe?: boolean } = {}) {
  const theme = useGrokTheme();
  const { ref, w } = useWidth();
  const N = CHARGES.length;
  const [idx, setIdx] = useState(N - 1);
  const [dx, setDx] = useState(0);
  const [anim, setAnim] = useState(false);
  const GAP = 8, MS = 250;
  // deck = phone layout, or desktop window 3: card ~82% wide so neighbours peek in as a swipe hint
  const deck = swipe || !DESK;
  const cardW = Math.max(1, Math.round(w * 0.82)), side = (w - cardW) / 2;
  const movedC = useRef(false);
  const ease = `transform ${MS}ms cubic-bezier(0.22, 0.8, 0.3, 1)`;
  const drag = useRef<{ id: number; x0: number; y0: number; t0: number; mode: "none" | "pending" | "drag" }>({ id: -1, x0: 0, y0: 0, t0: 0, mode: "none" });
  const go = (to: number) => {
    setAnim(true);
    setIdx(Math.min(N - 1, Math.max(0, to)));
    setDx(0);
    window.setTimeout(() => setAnim(false), MS);
  };
  const onDown = (e: { pointerId: number; clientX: number; clientY: number; pointerType: string; button: number }) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: Date.now(), mode: "pending" };
    movedC.current = false;
  };
  const onMove = (e: { pointerId: number; clientX: number; clientY: number; currentTarget: HTMLDivElement }) => {
    const s = drag.current;
    if (s.id !== e.pointerId || s.mode === "none") return;
    const ddx = e.clientX - s.x0, ddy = e.clientY - s.y0;
    if (s.mode === "pending") {
      if (Math.abs(ddx) > 8 && Math.abs(ddx) > Math.abs(ddy)) {
        s.mode = "drag";
        movedC.current = true;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      } else if (Math.abs(ddy) > 8) { s.mode = "none"; return; } else return;
    }
    const edge = (ddx > 0 && idx === 0) || (ddx < 0 && idx === N - 1);
    setAnim(false);
    setDx(edge ? ddx * 0.25 : ddx);
  };
  const onUp = (e: { pointerId: number; clientX: number }) => {
    const s = drag.current;
    if (s.id !== e.pointerId) return;
    const was = s.mode === "drag";
    drag.current = { ...s, id: -1, mode: "none" };
    if (!was) return;
    const ddx = e.clientX - s.x0;
    const fast = Math.abs(ddx) / Math.max(1, Date.now() - s.t0) > 0.5 && Math.abs(ddx) > 30;
    go(Math.abs(ddx) > cardW * 0.22 || fast ? idx + (ddx < 0 ? 1 : -1) : idx);
  };
  const arrow = (dir: -1 | 1) => {
    const dis = dir < 0 ? idx === 0 : idx === N - 1;
    return (
      <button type="button" aria-label={dir < 0 ? "Previous session" : "Next session"} disabled={dis} onClick={() => go(idx + dir)} style={{ width: 44, height: 36, borderRadius: 999, border: `1px solid ${theme.border.default}`, background: "transparent", color: theme.text.primary, opacity: dis ? 0.3 : 1, fontSize: 22, fontWeight: 700, lineHeight: "20px", cursor: dis ? "default" : "pointer", fontFamily: "inherit", padding: 0 }}>{dir < 0 ? "‹" : "›"}</button>
    );
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0, maxWidth: deck && !DESK ? 560 : "none", height: DESK ? "100%" : undefined, minHeight: DESK ? 0 : undefined }}>
      {deck && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flex: "none" }}>
        {arrow(-1)}
        <span style={{ fontSize: 14, fontWeight: 700, color: theme.text.secondary }}>{swipe ? `${idx + 1}/${N} · swipe` : `${idx + 1}/${N}`}</span>
        {arrow(1)}
      </div>}
      <div ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} style={{ overflow: "hidden", touchAction: DESK ? "pan-x" : "pan-y", userSelect: "none", WebkitUserSelect: "none", minWidth: 0, flex: DESK ? 1 : undefined, minHeight: 0 }}>
      {w > 0 && (
      <div style={deck ? { display: "flex", gap: GAP, alignItems: DESK ? "stretch" : "flex-start", height: DESK ? "100%" : undefined, transform: `translate3d(${side - idx * (cardW + GAP) + dx}px,0,0)`, transition: anim ? ease : "none", willChange: "transform" } : { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 12, alignItems: "start" }}>
      {CHARGES.map((ch, k) => {
        const max = 8;
        const cov = Math.min(1, Math.max(0.05, ch.coverage ?? 1));
        const pts = ch.profile.map((v, i) => `${(i / Math.max(1, ch.profile.length - 1)) * 100 * cov},${30 - (v / max) * 28}`).join(" ");
        const [tStart, tEnd] = ch.time.split("–");
        const hatch = `repeating-linear-gradient(135deg, rgba(130,140,150,0.4) 0 3px, transparent 3px 7px)`;
        const stats = ch.stats;
        return (
          <div key={ch.label} aria-hidden={deck && k !== idx ? true : undefined} onClick={() => { if (deck && k !== idx && !movedC.current) go(k); }} style={{ ...(deck ? { flex: `0 0 ${cardW}px`, width: cardW, height: DESK ? "100%" : undefined, opacity: k === idx ? 1 : 0.5, transition: `opacity ${MS}ms`, cursor: k === idx ? "default" : "pointer" } : { order: N - 1 - k }), borderRadius: 16, padding: deck ? 14 : 12, background: "#27AE60" + "14", border: "2px solid #27AE60", display: "flex", flexDirection: "column", gap: 10, minWidth: 0, minHeight: 0, boxSizing: "border-box" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: theme.text.primary }}>{`${ch.label} · ${ch.time}`}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {DESK && ch.site && <span style={{ fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 999, border: `1px solid ${theme.border.default}`, color: theme.text.primary }}>{ch.site}</span>}
                <span style={{ fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: ch.live ? "#F2994A" : "#2E9E4F", color: ch.live ? "#1F2933" : "#FFFFFF" }}>{ch.tag}</span>
              </span>
            </div>
            {!DESK && ch.site && <div style={{ fontSize: 13, fontWeight: 700, color: theme.text.secondary, lineHeight: "16px" }}>{ch.site}</div>}
            <div>
              <div style={{ position: "relative", height: 14, borderRadius: 7, background: theme.border.subtle, overflow: "hidden" }}>
                <div style={{ position: "absolute", left: `${ch.socFrom}%`, width: `${ch.socTo - ch.socFrom}%`, top: 0, bottom: 0, background: "#27AE60", borderRadius: 7 }} />
                {ch.finalPending && <div style={{ position: "absolute", left: `${ch.socTo}%`, right: 0, top: 0, bottom: 0, background: hatch }} />}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "4px 8px", fontSize: 14, fontWeight: 700, color: theme.text.primary, marginTop: 4 }}>
                <span>{`${ch.socFrom}%`}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {`→ ${ch.socTo}%${ch.socNote ? ` ${ch.socNote}` : ""}`}
                  {ch.finalPending && <span style={{ fontSize: 13, fontWeight: 600, padding: "1px 8px", borderRadius: 999, border: `1px dashed ${theme.border.strong}`, color: theme.text.secondary }}>final % · next export</span>}
                </span>
              </div>
            </div>
            <div style={{ flex: DESK ? "1 1 0" : undefined, minHeight: DESK ? 80 : undefined, display: "flex", gap: DESK ? 8 : 8, minWidth: 0, flexDirection: DESK ? "row" : "column" }}>
              <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <svg width="100%" height={DESK ? "100%" : 44} viewBox="0 0 100 30" preserveAspectRatio="none" aria-label="Charging power profile" role="img" style={{ display: "block", flex: DESK ? 1 : undefined, minHeight: DESK ? 80 : 44 }}>
                {cov < 1 && <rect x={cov * 100} y={0} width={100 - cov * 100} height={30} fill={theme.border.subtle} fillOpacity={0.6} />}
                {cov < 1 && <line x1={cov * 100} x2={100} y1={29} y2={29} stroke={theme.border.strong} strokeWidth={1.5} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
                <polyline points={`0,30 ${pts} ${cov * 100},30`} fill={"#27AE60" + "33"} stroke="none" />
                <polyline points={pts} fill="none" stroke="#27AE60" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              </svg>
              <div style={{ position: "relative", height: 18, fontSize: 13, color: theme.text.tertiary, marginTop: 2 }}>
                <span style={{ position: "absolute", left: 0 }}>{tStart}</span>
                {cov < 1 && cov > 0.15 && cov < 0.6 && <span style={{ position: "absolute", left: `${cov * 100}%`, paddingLeft: 4, whiteSpace: "nowrap", borderLeft: `1px dashed ${theme.border.strong}` }}>23:59 export end</span>}
                <span style={{ position: "absolute", right: 0 }}>{`${tEnd ?? ""}${cov < 1 ? " unplug" : ""}`}</span>
              </div>
              </div>
              {DESK && k === idx && (
                <div style={{ width: 28, flex: "none", display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-start", fontSize: 13, color: theme.text.tertiary, lineHeight: "13px" }}>
                    <span style={{ fontWeight: 600 }}>{`${max} kW`}</span>
                    <span>{max / 2}</span>
                    <span>0</span>
                  </div>
                  <div style={{ height: 20, flex: "none" }} />
                </div>
              )}
              {DESK && <SiteMap site={ch.site} />}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: DESK ? "6px 40px" : "6px 12px", width: DESK ? "min(100%, 480px)" : undefined, maxWidth: "100%", margin: DESK ? "0 auto" : undefined, boxSizing: "border-box" }}>
              {stats.map(([k, v]) => (
                <div key={k} style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: theme.text.tertiary }}>{k}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: theme.text.primary }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      </div>
      )}
      </div>
    </div>
  );
}

// xpeng.drives: one block per drive [date, start min of day SGT, end min, km, min, kWh/100 km (null if < 1 km)]
// Minutes mode: green / amber / red around the average drive length: amber = 0.67x–1.5x average
const DRIVE_AVG = DRIVES.length ? DRIVES.reduce((a, r) => a + r[4], 0) / DRIVES.length : 0;
const AMBER_FROM = Math.max(2, Math.round(DRIVE_AVG * 0.67));
const RED_FROM = Math.max(AMBER_FROM + 1, Math.round(DRIVE_AVG * 1.5));
const TOD_BINS = [
  { min: 0, label: `< ${AMBER_FROM} shorter`, bg: "#2E9E4F", ink: "#FFFFFF", bgD: "#2FA75A", inkD: "#FFFFFF" },
  { min: AMBER_FROM, label: `${AMBER_FROM}–${RED_FROM - 1} around avg (${DRIVE_AVG.toFixed(0)})`, bg: "#F2B33D", ink: "#3D2B00", bgD: "#F2B33D", inkD: "#3D2B00" },
  { min: RED_FROM, label: `${RED_FROM}+ longer`, bg: "#E0453A", ink: "#FFFFFF", bgD: "#E5534B", inkD: "#FFFFFF" },
];
function todStyle(v: number, dark = false) {
  let s: { bg: string; ink: string } | null = null;
  TOD_BINS.forEach((b) => {
    if (v >= b.min) s = dark ? { bg: b.bgD, ink: b.inkD } : { bg: b.bg, ink: b.ink };
  });
  return s as { bg: string; ink: string } | null;
}

// xpeng.eff_by_date / eff_bins: net pack kWh/100 km while driving per day (XPENG 1 Hz); drive blocks use the same bins
const EFF_LEVELS = [
  { label: `< ${EFF_BINS.greenBelow} better`, bg: "#2E9E4F", ink: "#FFFFFF", bgD: "#2FA75A", inkD: "#FFFFFF" },
  { label: `${EFF_BINS.greenBelow}–${(EFF_BINS.redFrom - 0.1).toFixed(1)} around avg (${EFF_BINS.avg})`, bg: "#F2B33D", ink: "#3D2B00", bgD: "#F2B33D", inkD: "#3D2B00" },
  { label: `${EFF_BINS.redFrom}+ higher`, bg: "#E0453A", ink: "#FFFFFF", bgD: "#E5534B", inkD: "#FFFFFF" },
];
function effStyle(v: number, dark = false): { bg: string; ink: string } {
  const b = EFF_LEVELS[v < EFF_BINS.greenBelow ? 0 : v < EFF_BINS.redFrom ? 1 : 2];
  if (!b) return { bg: "#B8BEC4", ink: "#1F2933" };
  return dark ? { bg: b.bgD, ink: b.inkD } : { bg: b.bg, ink: b.ink };
}

// Distance mode: single blue scale by drive km around the average drive (0.67x–1.5x average = middle shade)
const KM_AVG = DRIVES.length ? DRIVES.reduce((a, r) => a + r[3], 0) / DRIVES.length : 0;
const KM_MID = Math.max(1, Math.round(KM_AVG * 0.67)), KM_HI = Math.max(KM_MID + 1, Math.round(KM_AVG * 1.5));
const KM_LEVELS = [
  { label: `< ${KM_MID} km`, bg: "#8BC2FA", ink: "#06294F", bgD: "#2F6DB8", inkD: "#FFFFFF" },
  { label: `${KM_MID}–${KM_HI - 1} around avg (${KM_AVG.toFixed(1)})`, bg: "#2F80ED", ink: "#FFFFFF", bgD: "#4A9BFF", inkD: "#06294F" },
  { label: `${KM_HI}+ km`, bg: "#1450B5", ink: "#FFFFFF", bgD: "#9CCBFF", inkD: "#06294F" },
];
function kmStyle(v: number, dark = false): { bg: string; ink: string } {
  const b = KM_LEVELS[v < KM_MID ? 0 : v < KM_HI ? 1 : 2];
  if (!b) return { bg: "#B8BEC4", ink: "#1F2933" };
  return dark ? { bg: b.bgD, ink: b.inkD } : { bg: b.bg, ink: b.ink };
}

function DriveHeatmap() {
  const theme = useGrokTheme();
  const { ref, w, h: panelH } = useWidth();
  const gridBox = useWidth();
  const dark = isDarkTheme(theme);
  const labelW = 34;
  const all = Object.keys(DRIVE_MIN).sort();
  const DAY = 86400000;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const monday = (d: string) => utc(d) - ((new Date(utc(d)).getUTCDay() + 6) % 7) * DAY;
  const firstMon = monday(all[0] ?? START_DATE);
  const nWeeks = Math.round((monday(all[all.length - 1] ?? START_DATE) - firstMon) / (7 * DAY)) + 1;
  const [wk, setWk] = useState(nWeeks - 1);
  const [dx, setDx] = useState(0);
  const [anim, setAnim] = useState(false);
  const [mode, setMode] = useState<"eff" | "km" | "min">("eff");
  // only the data cells slide: one pane = data column width + grid gap
  const slideW = Math.max(1, w - labelW - 3) + 3;
  const wi = Math.min(Math.max(0, wk), nWeeks - 1);
  const datesFor = (i: number) => Array.from({ length: 7 }, (_, k) => iso(firstMon + i * 7 * DAY + k * DAY));
  let hMin = 23, hMax = 0;
  DRIVES.forEach((r) => { hMin = Math.min(hMin, Math.floor(r[1] / 60)); hMax = Math.max(hMax, Math.min(23, Math.ceil(r[2] / 60) - 1)); });
  const [sel, setSel] = useState<number | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const moved = useRef(false);
  if (hMax < hMin) { hMin = 6; hMax = 22; }
  const hours = Array.from({ length: hMax - hMin + 1 }, (_, i) => hMin + i);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const weekend = (d: string) => { const wd = new Date(utc(d)).getUTCDay(); return wd === 0 || wd === 6; };
  const tint = "#9B51E0";
  const hoursN = Math.max(1, hMax - hMin + 1);
  const DATE_H = DESK ? 22 : 26, TOT_H = DESK ? 20 : 24;
  const gridChrome = DATE_H + TOT_H + 38;
  const rowH = DESK && gridBox.h > 80 ? Math.max(14, Math.floor((gridBox.h - gridChrome + 3) / hoursN) - 3) : (w >= 760 ? 30 : 26);
  const head = { fontSize: 13, color: theme.text.tertiary, textAlign: "center" as const };
  const weekLabel = (i: number) => {
    const m0 = firstMon + i * 7 * DAY;
    const s0 = new Date(m0), s6 = new Date(m0 + 6 * DAY);
    return s0.getUTCMonth() === s6.getUTCMonth()
      ? `${s0.getUTCDate()}–${s6.getUTCDate()} ${mon[s6.getUTCMonth()]}`
      : `${s0.getUTCDate()} ${mon[s0.getUTCMonth()]} – ${s6.getUTCDate()} ${mon[s6.getUTCMonth()]}`;
  };
  // ---- swipe between weeks: the track follows the finger, commits past 22% (or a flick), else snaps back ----
  const SLIDE_MS = 250;
  const busy = useRef(false);
  const drag = useRef<{ id: number; x0: number; y0: number; t0: number; mode: "pending" | "drag" | "none" }>({ id: -1, x0: 0, y0: 0, t0: 0, mode: "none" });
  const go = (dir: -1 | 1) => {
    if (busy.current || w <= 0) return;
    if ((dir < 0 && wi === 0) || (dir > 0 && wi === nWeeks - 1)) { setAnim(true); setDx(0); window.setTimeout(() => setAnim(false), SLIDE_MS); return; }
    busy.current = true;
    setAnim(true);
    setDx(dir > 0 ? -slideW : slideW);
    window.setTimeout(() => {
      setAnim(false);
      setWk(wi + dir);
      setDx(0);
      busy.current = false;
    }, SLIDE_MS);
  };
  const onDown = (e: { pointerId: number; clientX: number; clientY: number; pointerType: string; button: number }) => {
    if (busy.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: Date.now(), mode: "pending" };
    moved.current = false;
  };
  const onMove = (e: { pointerId: number; clientX: number; clientY: number; currentTarget: HTMLDivElement }) => {
    const s = drag.current;
    if (s.id !== e.pointerId || s.mode === "none") return;
    const ddx = e.clientX - s.x0, ddy = e.clientY - s.y0;
    if (s.mode === "pending") {
      if (Math.abs(ddx) > 8 && Math.abs(ddx) > Math.abs(ddy)) {
        s.mode = "drag";
        moved.current = true;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      } else if (Math.abs(ddy) > 8) { s.mode = "none"; return; } else return;
    }
    const edge = (ddx > 0 && wi === 0) || (ddx < 0 && wi === nWeeks - 1);
    setAnim(false);
    setDx(edge ? ddx * 0.25 : ddx);
  };
  const onUp = (e: { pointerId: number; clientX: number }) => {
    const s = drag.current;
    if (s.id !== e.pointerId) return;
    const wasDrag = s.mode === "drag";
    drag.current = { ...s, id: -1, mode: "none" };
    if (!wasDrag) return;
    const ddx = e.clientX - s.x0;
    const fast = Math.abs(ddx) / Math.max(1, Date.now() - s.t0) > 0.5 && Math.abs(ddx) > 30;
    if (Math.abs(ddx) > w * 0.22 || fast) go(ddx < 0 ? 1 : -1);
    else { setAnim(true); setDx(0); window.setTimeout(() => setAnim(false), SLIDE_MS); }
  };
  // label shows the week that is more than half on screen
  const shown = dx < -slideW / 2 ? Math.min(nWeeks - 1, wi + 1) : dx > slideW / 2 ? Math.max(0, wi - 1) : wi;
  const ease = `transform ${SLIDE_MS}ms cubic-bezier(0.22, 0.8, 0.3, 1)`;
  const has = (d: string) => DRIVE_MIN[d] !== undefined;
  const shownDates = datesFor(shown);
  const arrow = (dir: -1 | 1) => {
    const dis = dir < 0 ? wi === 0 : wi === nWeeks - 1;
    return (
      <button type="button" aria-label={dir < 0 ? "Previous week" : "Next week"} disabled={dis} onClick={() => go(dir)} style={{ width: 44, height: 36, borderRadius: 999, border: `1px solid ${theme.border.default}`, background: "transparent", color: theme.text.primary, opacity: dis ? 0.3 : 1, fontSize: 22, fontWeight: 700, lineHeight: "20px", cursor: dis ? "default" : "pointer", fontFamily: "inherit", padding: 0 }}>{dir < 0 ? "‹" : "›"}</button>
    );
  };
  const grid7 = { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 3 } as const;
  const step = rowH + 3, colH = hours.length * step - 3, ppm = step / 60, MINH = 10;
  const hm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(Math.floor(m % 60))}`;
  const blockStyle = (r: (typeof DRIVES)[number]) => mode === "eff" ? (r[5] === null ? { bg: dark ? "#4A5058" : "#C9CED4", ink: theme.text.primary } : effStyle(r[5], dark)) : mode === "km" ? kmStyle(r[3], dark) : todStyle(r[4], dark) ?? { bg: theme.bg.subtle, ink: theme.text.primary };
  const inWeek = DRIVES.map((r, i) => (shownDates.includes(r[0]) ? i : -1)).filter((i) => i >= 0);
  const cur = sel !== null && inWeek.includes(sel) ? sel : inWeek[inWeek.length - 1] ?? null;
  const curR = cur === null ? undefined : DRIVES[cur];
  const curText = (r: (typeof DRIVES)[number]) => [`${DOW3[new Date(utc(r[0])).getUTCDay()] ?? ""} ${Number(r[0].slice(8, 10))} ${mon[Number(r[0].slice(5, 7)) - 1] ?? ""} · ${hm(r[1])}–${hm(r[2])}`, `${r[3]} km · ${r[4]} min · ${r[5] === null ? "< 1 km" : `${r[5].toFixed(1)} kWh/100 km`}`];
  const cells = (dates: string[]) => dates.map((d) => (
    <div key={d} style={{ position: "relative", height: colH, minWidth: 0 }}>
      {hours.map((h, k) => <div key={h} style={{ position: "absolute", left: 0, right: 0, top: k * step, height: rowH, borderRadius: 6, background: weekend(d) ? tint + "12" : theme.bg.subtle }} />)}
      {DRIVES.map((r, i) => {
        if (r[0] !== d) return null;
        const top = (r[1] - hMin * 60) * ppm, hgt = Math.max(MINH, (r[2] - r[1]) * ppm);
        const s = blockStyle(r), on = i === cur;
        const label = mode === "eff" ? (r[5] === null ? "" : r[5].toFixed(1)) : mode === "km" ? r[3].toFixed(1) : `${r[4]}`;
        return (
          <div key={i} role="button" aria-label={curText(r).join(" · ")} title={DESK ? undefined : curText(r).join(" · ")} onClick={() => { if (!moved.current) setSel(i); }}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") { setSel(i); if (DESK && ref.current) { const b = ref.current.getBoundingClientRect(); setTip({ x: e.clientX - b.left, y: e.clientY - b.top, lines: curText(r) }); } } }}
            onPointerMove={(e) => { if (DESK && e.pointerType === "mouse" && ref.current) { const b = ref.current.getBoundingClientRect(); setTip({ x: e.clientX - b.left, y: e.clientY - b.top, lines: curText(r) }); } }}
            onPointerLeave={() => { if (DESK) setTip(null); }}
            style={{ position: "absolute", left: 1, right: 1, top, height: hgt, borderRadius: 5, background: s.bg, color: s.ink, fontSize: 13, fontWeight: 700, lineHeight: "14px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", boxShadow: on ? `0 0 0 2px ${theme.text.primary}` : `0 0 0 1px ${theme.bg.base}`, zIndex: on ? 2 : 1, cursor: "pointer" }}>{!DESK && hgt >= 17 ? label : ""}</div>
        );
      })}
    </div>
  ));
  const total = (d: string) => {
    if (!has(d)) return "–";
    if (mode === "eff") { const e = EFF_DAY[d]; return e === null || e === undefined ? "–" : e.toFixed(1); }
    const ds = DRIVES.filter((r) => r[0] === d);
    return mode === "km" ? ds.reduce((a, r) => a + r[3], 0).toFixed(0) : `${ds.reduce((a, r) => a + r[4], 0)}`;
  };
  const sep = (x: number) => <div style={{ height: 2, borderRadius: 1, background: theme.bg.base, opacity: 0.7, margin: "3px 0", marginRight: x }} />;
  const heatPills = <Pills<"eff" | "km" | "min"> options={[{ value: "eff", label: "Efficiency" }, { value: "km", label: "Distance" }, { value: "min", label: "Minutes" }]} value={mode} onChange={(m: "eff" | "km" | "min") => setMode(m)} />;
  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: DESK ? 8 : 12, minWidth: 0, maxWidth: DESK ? "none" : 760, height: DESK ? "100%" : undefined, minHeight: 0, overflow: DESK ? "hidden" : undefined, position: "relative" }}>
      {DESK ? <HeadRow title="Driving Heatmap">{heatPills}</HeadRow> : <div style={{ flex: "none" }}>{heatPills}</div>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flex: "none" }}>
        {arrow(-1)}
        <span style={{ fontSize: 16, fontWeight: 700, color: theme.text.primary }}>{weekLabel(shown)}</span>
        {arrow(1)}
      </div>
      {!DESK && (
      <div aria-live="polite" style={{ minHeight: 40, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 10px", fontSize: 14, color: theme.text.secondary, flex: "none" }}>
        {curR && <span style={{ width: 14, height: 14, borderRadius: 4, background: blockStyle(curR).bg, display: "inline-block", flexShrink: 0 }} />}
        {curR && <span style={{ fontWeight: 800, color: theme.text.primary }}>{curText(curR)[0]}</span>}
        {curR && <span>{curText(curR)[1]}</span>}
      </div>
      )}
      <div ref={gridBox.ref} style={{ flex: DESK ? 1 : undefined, minHeight: DESK ? 0 : undefined, overflow: "hidden" }}>
      {w > 0 && (
        <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} style={{ display: "grid", gridTemplateColumns: `${labelW}px minmax(0, 1fr)`, columnGap: 3, rowGap: 3, touchAction: DESK ? "pan-x" : "pan-y", userSelect: "none", WebkitUserSelect: "none", width: w }}>
          <div />
          <div style={grid7}>{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={`w${i}`} style={{ ...head, fontWeight: 600 }}>{d}</div>)}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ height: DATE_H }} />
            <div style={{ ...head, height: TOT_H, lineHeight: `${TOT_H}px`, textAlign: "right", paddingRight: 4, fontWeight: 700, color: theme.text.secondary }}>{mode === "eff" ? "day" : mode}</div>
            {sep(-3)}
            <div style={{ position: "relative", height: colH }}>
              {hours.map((h, k) => <div key={`h${h}`} style={{ ...head, position: "absolute", right: 4, top: k * step, lineHeight: "14px" }}>{pad(h)}</div>)}
            </div>
          </div>
          <div style={{ position: "relative", overflow: "hidden", minWidth: 0 }}>
            <div style={{ position: "relative", transform: `translate3d(${dx}px,0,0)`, transition: anim ? ease : "none", willChange: "transform" }}>
              {[wi - 1, wi, wi + 1].filter((i) => i >= 0 && i < nWeeks).map((wkI) => {
                const ds = datesFor(wkI);
                return (
                  <div key={wkI} aria-hidden={wkI !== wi ? true : undefined} style={wkI === wi ? { display: "flex", flexDirection: "column", gap: 3 } : { position: "absolute", top: 0, left: wkI < wi ? -slideW : slideW, width: slideW - 3, display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={grid7}>
                      {ds.map((d) => (
                        <div key={`d${d}`} style={{ ...head, fontSize: 14, fontWeight: 800, color: weekend(d) ? "#FFFFFF" : theme.text.primary, background: weekend(d) ? "#6C3FA0" : theme.bg.base, opacity: has(d) ? 1 : 0.35, borderRadius: 6, height: DATE_H, lineHeight: `${DATE_H}px` }}>{Number(d.slice(8, 10))}</div>
                      ))}
                    </div>
                    <div style={grid7}>
                      {ds.map((d) => (
                        <div key={`t${d}`} style={{ ...head, fontWeight: 700, color: has(d) ? theme.text.primary : theme.text.tertiary, background: theme.bg.base, border: `1.5px ${has(d) ? "solid" : "dashed"} ${weekend(d) ? "#6C3FA0" : theme.border.strong}`, borderRadius: 999, height: TOT_H, lineHeight: `${TOT_H - 3}px`, boxSizing: "border-box", minWidth: 0 }}>{total(d)}</div>
                      ))}
                    </div>
                    {sep(0)}
                    <div style={grid7}>{cells(ds)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: DESK ? "4px 12px" : "8px 14px", alignItems: "center", fontSize: 13, color: theme.text.secondary, flex: "none" }}>
        {(mode === "eff" ? EFF_LEVELS : mode === "km" ? KM_LEVELS : TOD_BINS).map((b) => (
          <span key={b.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: dark ? b.bgD : b.bg, display: "inline-block" }} />
            {b.label}
          </span>
        ))}
        <span style={{ color: theme.text.tertiary }}>{mode === "eff" ? "kWh/100 km per drive · grey < 1 km · weekends tinted" : mode === "km" ? "km per drive · weekends tinted" : "min per drive · weekends tinted"}</span>
      </div>
      {DESK && tip && <HoverTip x={tip.x} y={tip.y} boxW={w} boxH={panelH || 400} lines={tip.lines} />}
    </div>
  );
}

function SpeedBands() {
  const theme = useGrokTheme();
  const max = Math.max(...SPEED.map((s) => s.eff ?? 0));
  if (DESK) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8, minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden" }}>
        {SPEED.map((s) => {
          const col = effColor(s.eff);
          const pct = s.eff === null ? 0 : (s.eff / max) * 100;
          return (
            <div key={s.band} style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 0", minHeight: 28, minWidth: 0 }}>
              <div style={{ flex: 1, minWidth: 0, height: "100%", maxHeight: 40, borderRadius: 8, background: theme.bg.subtle, position: "relative", overflow: "hidden" }}>
                {s.eff !== null && <div style={{ width: `${pct}%`, height: "100%", background: col.bg, borderRadius: 8 }} />}
                <span style={{ position: "absolute", left: 10, top: 0, bottom: 0, display: "flex", alignItems: "center", fontSize: 13, fontWeight: 700, color: s.eff === null ? theme.text.secondary : col.ink, pointerEvents: "none", whiteSpace: "nowrap" }}>{`${s.band.replace("-", "–")} km/h`}</span>
              </div>
              <span style={{ flex: "none", whiteSpace: "nowrap", display: "flex", alignItems: "baseline", gap: 5 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: theme.text.primary }}>{s.eff === null ? "–" : s.eff}</span>
                <span style={{ fontSize: 13, color: theme.text.tertiary }}>kWh/100 km</span>
              </span>
              <span style={{ minWidth: 132, fontSize: 13, color: theme.text.tertiary, flex: "none", whiteSpace: "nowrap" }}>{`${s.km}% km · ${s.time}% min`}</span>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      {SPEED.map((s) => {
        const col = effColor(s.eff);
        return (
          <div key={s.band} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: 14 }}>
              <span style={{ fontWeight: 700, color: theme.text.primary }}>{`${s.band.replace("-", "–")} km/h`}</span>
              <span style={{ color: theme.text.tertiary, fontSize: 13 }}>{`${s.km}% of km · ${s.time}% of time`}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 22, borderRadius: 6, background: theme.bg.subtle, overflow: "hidden", minWidth: 0 }}>
                {s.eff !== null && <div style={{ width: `${(s.eff / max) * 100}%`, height: "100%", background: col.bg, borderRadius: 6 }} />}
              </div>
              <span style={{ width: 52, textAlign: "right", fontSize: 15, fontWeight: 700, color: theme.text.primary, flexShrink: 0 }}>{s.eff === null ? "–" : s.eff}</span>
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 13, color: theme.text.tertiary }}>kWh/100 km</div>
    </div>
  );
}

function TripList() {
  const theme = useGrokTheme();
  const [mode, setMode] = useState<"longest" | "recent">("longest");
  const trips = mode === "longest" ? TRIPS_LONGEST : TRIPS_RECENT;
  const pills = (
        <Pills<"longest" | "recent">
          options={[{ value: "longest", label: "Longest 10" }, { value: "recent", label: "Latest 10" }]}
          value={mode}
          onChange={(v: "longest" | "recent") => setMode(v)}
        />
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: DESK ? 8 : 12, minWidth: 0, height: DESK ? "100%" : undefined, minHeight: DESK ? 0 : undefined, overflow: DESK ? "hidden" : undefined }}>
      {DESK ? (
        <HeadRow title="Trips">{pills}</HeadRow>
      ) : (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, flex: "none" }}>
        {pills}
      </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", flex: DESK ? 1 : undefined, minHeight: 0, overflow: DESK ? "hidden" : undefined }}>
        {trips.map((t, i) => {
          const col = effColor(t.eff);
          return (
            <div key={`${t.when}${i}`} style={{ display: "flex", alignItems: "center", gap: DESK ? 8 : 12, padding: DESK ? "5px 0" : "10px 0", borderTop: i === 0 ? "none" : `1px solid ${theme.border.subtle}`, minWidth: 0, flex: DESK ? "1 1 0" : undefined, minHeight: DESK ? 0 : undefined }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.text.primary, lineHeight: DESK ? "18px" : undefined }}>{t.when}</div>
                <div style={{ fontSize: 13, color: theme.text.tertiary, marginTop: DESK ? 0 : 2, lineHeight: DESK ? "16px" : undefined }}>{`${Math.round(t.min)} min · avg ${Math.round(t.avg)} · max ${Math.round(t.max)} km/h`}</div>
              </div>
              <div style={{ fontSize: DESK ? 15 : 17, fontWeight: 700, color: theme.text.primary, flexShrink: 0 }}>{`${t.km} km`}</div>
              <div style={{ flexShrink: 0, minWidth: DESK ? 0 : 52, textAlign: "center", padding: DESK ? "2px 7px" : "4px 8px", borderRadius: 8, background: col.bg, color: col.ink, fontSize: 14, fontWeight: 700 }}>{t.eff}</div>
              {DESK && <span style={{ fontSize: 13, color: theme.text.tertiary, flexShrink: 0, whiteSpace: "nowrap" }}>kWh/100 km</span>}
            </div>
          );
        })}
      </div>
      {!DESK && <div style={{ fontSize: 13, color: theme.text.tertiary, flex: "none" }}>Coloured chip: kWh/100 km</div>}
    </div>
  );
}

function StatTiles() {
  const theme = useGrokTheme();
  return (
    <div style={{ display: "grid", gridTemplateColumns: DESK ? `repeat(${STATS.length}, minmax(0, 1fr))` : "repeat(auto-fill, minmax(min(100%, 160px), 1fr))", gap: DESK ? 8 : 10 }}>
      {STATS.map((s, i) => {
        const color = s.flag ? "#F2994A" : ACCENTS[i % ACCENTS.length] ?? "#2F80ED";
        return (
          <div key={s.label} style={{ borderRadius: 14, padding: DESK ? "8px 8px 9px" : "10px 12px", background: color + "14", border: `2px solid ${color}`, display: "flex", flexDirection: "column", gap: 3, minWidth: 0, boxSizing: "border-box" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: theme.text.secondary }}>{s.label}</span>
            <span style={{ fontSize: DESK ? 18 : 20, fontWeight: 700, color: theme.text.primary, lineHeight: DESK ? "22px" : "24px" }}>{s.value}</span>
            <span style={{ fontSize: 13, color: theme.text.tertiary, lineHeight: "17px" }}>{s.note}</span>
            {s.flag && <span style={{ alignSelf: "flex-start", marginTop: 4, fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#F2994A", color: "#1F2933" }}>{s.flag}</span>}
          </div>
        );
      })}
    </div>
  );
}

function InsightChips() {
  const theme = useGrokTheme();
  return (
    <div style={{ display: "grid", gridTemplateColumns: DESK ? "repeat(6, minmax(0, 1fr))" : "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: DESK ? 6 : 8, height: DESK ? "100%" : undefined, minHeight: 0, alignContent: DESK ? "stretch" : undefined }}>
      {INSIGHTS.map((t, i) => {
        const color = ACCENTS[i % ACCENTS.length] ?? "#2F80ED";
        return (
          <div key={i} style={{ display: "flex", gap: DESK ? 8 : 10, alignItems: "flex-start", padding: DESK ? "7px 8px" : "10px 12px", borderRadius: 12, background: color + "12", minWidth: 0, minHeight: 0 }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: color, flexShrink: 0, marginTop: 4 }} />
            <span style={{ fontSize: DESK ? 13 : 14, lineHeight: DESK ? "17px" : "20px", color: theme.text.primary }}>{t}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---- Added 22 Nov: from xpeng.rests / rest_summary / tyres_daily_bar / driving_style / weekday_weekend ----
// [MM-DD, start SGT, minutes, kWh (pack V x I), S$ at 0.58, avg kW]; rule: >= 10 min parked & awake, median draw >= 0.45 kW (likely aircon)
// xpeng.tyres_cold, bar: [moved off SGT, FL, FR, RL, RR]; cold = per tyre the first fresh TPMS value after moving off following >= 3 h asleep
// xpeng.tyres_hot_latest: p90 while driving on the latest day (warm)
// L03 manual / B-pillar placard: 260 kPa cold, front & rear (no to half load); green >= 2.6 cold (placard), amber 2.5–2.59, red < 2.5
const TYRE_PLACARD = 2.6, TYRE_OK = 2.6, TYRE_RED = 2.5;
// per trip >= 2 km: [accelerator p95 %, hardest braking p99 m/s², km, harsh events in the trip]
const HARSH_COLORS = ["", "#F2994A", "#E0453A"];
// per trip, same order as STYLE_TRIPS: [peak pedal % (1 Hz max while moving), start "MM-DD HH:MM" SGT]
const STYLE_T: [number, number, number, number, number, string][] = STYLE_TRIPS.map((t, i) => [t[0], t[1], t[2], t[3], STYLE_PEAK[i]?.[0] ?? 0, STYLE_PEAK[i]?.[1] ?? "01-01 00:00"]);
const tripR = (km: number) => 3.5 + Math.min(1, Math.max(0, (km - 2) / 33)) * 3;

function MetricTiles({ items, cols }: { items: { label: string; value: string; note?: string; color: string }[]; cols?: number }) {
  const theme = useGrokTheme();
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols ? `repeat(${cols}, minmax(0, 1fr))` : "repeat(auto-fill, minmax(min(100%, 150px), 1fr))", gap: DESK ? 8 : 10 }}>
      {items.map((t) => (
        <div key={t.label} style={{ borderRadius: 14, padding: DESK ? "6px 8px" : "10px 12px", background: t.color + "14", border: `2px solid ${t.color}`, display: "flex", flexDirection: "column", gap: 2, minWidth: 0, boxSizing: "border-box" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: theme.text.secondary }}>{t.label}</span>
          <span style={{ fontSize: DESK ? 17 : 22, fontWeight: 700, color: theme.text.primary, lineHeight: DESK ? "21px" : "26px" }}>{t.value}</span>
          {t.note && <span style={{ fontSize: 13, color: theme.text.tertiary, lineHeight: "16px" }}>{t.note}</span>}
        </div>
      ))}
    </div>
  );
}

const DOW3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function RestPanel() {
  const theme = useGrokTheme();
  const dark = isDarkTheme(theme);
  const [mode, setMode] = useState<"latest" | "longest" | "all">("latest");
  const rows = DESK
    ? (mode === "longest"
      ? [...RESTS].sort((a, b) => b[2] - a[2] || b[0].localeCompare(a[0])).slice(0, 10)
      : [...RESTS].reverse().slice(0, 10))
    : [...RESTS].reverse().slice(0, mode === "all" ? RESTS.length : 8);
  const maxMin = Math.max(...RESTS.map((r) => r[2]));
  const bar = dark ? "#4FC3F7" : "#0288D1";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: DESK ? 8 : 14, minWidth: 0, height: DESK ? "100%" : undefined, minHeight: DESK ? 0 : undefined, overflow: DESK ? "hidden" : undefined }}>
      <div style={{ flex: "none" }}>
        <MetricTiles cols={DESK ? 5 : undefined} items={[
          { label: "Rests", value: `${REST_SUM.rests}`, note: "≥ 10 min, likely aircon", color: "#00A3B4" },
          { label: "Time", value: `${REST_SUM.hours} h`, note: "parked & awake", color: "#2F80ED" },
          { label: "Energy", value: `${REST_SUM.kwh} kWh`, note: "from the pack", color: "#27AE60" },
          { label: "Cost", value: `S$${REST_SUM.sgd.toFixed(2)}`, note: "at S$0.58/kWh", color: "#EB5757" },
          { label: "Avg draw", value: `${REST_SUM.avgKw} kW`, note: "standby ≈ 0.2–0.3 kW", color: "#9B51E0" },
        ]} />
      </div>
      <div style={{ flex: "none" }}>
        {DESK
          ? <Pills<"latest" | "longest"> options={[{ value: "latest", label: "Latest 10" }, { value: "longest", label: "Longest 10" }]} value={mode === "longest" ? "longest" : "latest"} onChange={(v: "latest" | "longest") => setMode(v)} />
          : <Pills<"latest" | "all"> options={[{ value: "latest", label: "Latest 8" }, { value: "all", label: `All ${RESTS.length}` }]} value={mode === "all" ? "all" : "latest"} onChange={(v: "latest" | "all") => setMode(v)} />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: DESK ? 1 : undefined, minHeight: 0, overflow: DESK ? "hidden" : undefined }}>
        {rows.map((r, i) => {
          const dow = DOW3[new Date(utc(`2026-${r[0]}`)).getUTCDay()] ?? "";
          return (
            <div key={`${r[0]}${r[1]}`} style={{ display: "flex", flexDirection: "column", gap: DESK ? 2 : 4, padding: DESK ? "4px 0" : "9px 0", borderTop: i === 0 ? "none" : `1px solid ${theme.border.subtle}`, minWidth: 0, flex: DESK ? "1 1 0" : undefined, minHeight: DESK ? 0 : undefined, justifyContent: DESK ? "center" : undefined }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: DESK ? "nowrap" : "wrap" }}>
                <span style={{ fontSize: DESK ? 14 : 15, fontWeight: 700, color: theme.text.primary, whiteSpace: DESK ? "nowrap" : undefined }}>{`${dow} ${Number(r[0].slice(3))} Nov · ${r[1]}`}</span>
                <span style={{ fontSize: 13, color: theme.text.secondary, whiteSpace: DESK ? "nowrap" : undefined }}>{`${r[3].toFixed(2)} kWh · S$${r[4].toFixed(2)} · ${r[5]} kW`}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <div style={{ flex: 1, height: DESK ? 8 : 10, borderRadius: 5, background: theme.bg.subtle, minWidth: 0 }}>
                  <div style={{ width: `${(r[2] / maxMin) * 100}%`, height: "100%", borderRadius: 5, background: bar }} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: theme.text.primary, width: 56, textAlign: "right", flexShrink: 0 }}>{`${r[2]} min`}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function tyreState(v: number, dark: boolean): { warn: boolean; color: string } {
  if (v < TYRE_RED) return { warn: true, color: dark ? "#FF6B5E" : "#D93025" };
  if (v < TYRE_OK) return { warn: true, color: dark ? "#F5C542" : "#B7791F" };
  return { warn: false, color: dark ? "#4ADE80" : "#1E9E50" };
}
const TYRE_POS: { k: string; a: string; b: string; i: 1 | 2 | 3 | 4; left: boolean; row: 1 | 2; x: number; y: number }[] = [
  { k: "FL", a: "Front", b: "Left", i: 1, left: true, row: 1, x: 9, y: 50 },
  { k: "FR", a: "Front", b: "Right", i: 2, left: false, row: 1, x: 101, y: 50 },
  { k: "RL", a: "Rear", b: "Left", i: 3, left: true, row: 2, x: 9, y: 166 },
  { k: "RR", a: "Rear", b: "Right", i: 4, left: false, row: 2, x: 101, y: 166 },
];
function TyreSpark({ vals, color, start, end }: { vals: number[]; color: string; start: string; end: string }) {
  const theme = useGrokTheme();
  const W = 108, H = 46, L = 2, R = 2, T = 3, B = 16;
  const pw = W - L - R, ph = H - T - B;
  const vmin = Math.min(...vals, TYRE_RED);
  const vmax = Math.max(...vals, TYRE_OK);
  const pad = Math.max(0.06, (vmax - vmin) * 0.4);
  const lo = vmin - pad, hi = vmax + pad;
  const n = vals.length;
  const x = (i: number) => L + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw);
  const y = (v: number) => T + ph - ((v - lo) / Math.max(0.01, hi - lo)) * ph;
  const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const lab = (t: string) => `${Number(t.slice(8, 10))} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(t.slice(5, 7)) - 1] ?? ""}`;
  const yOk = y(TYRE_OK);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", flex: "none" }} aria-hidden>
      <line x1={L} x2={W - R} y1={yOk} y2={yOk} stroke={theme.border.default} strokeDasharray="3 3" />
      {d && <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />}
      {vals.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={1.8} fill={color} />)}
      <text x={L} y={H - 2} fontSize={13} fill={theme.text.tertiary}>{lab(start)}</text>
      <text x={W - R} y={H - 2} textAnchor="end" fontSize={13} fill={theme.text.tertiary}>{lab(end)}</text>
    </svg>
  );
}
function TyrePanel() {
  const theme = useGrokTheme();
  const dark = isDarkTheme(theme);
  const first = TYRE_COLD[0], last = TYRE_COLD[TYRE_COLD.length - 1];
  const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const when = (t: string) => `${Number(t.slice(8, 10))} ${MONS[Number(t.slice(5, 7)) - 1] ?? ""}`;
  const val = (r: typeof first, i: 1 | 2 | 3 | 4) => (r ? r[i] : 0);
  const ok = tyreState(9, dark).color, amber = tyreState(TYRE_OK - 0.05, dark).color, red = tyreState(0, dark).color;
  const { ref, w, h } = useWidth();
  // car image (870x1596, user's SVG rasterised 3x) at ~48% of the panel; wheel boxes in % of the image (SVG viewBox 290x532)
  const carWByW = DESK ? Math.min(220, Math.round((w || 480) * 0.30)) : Math.round((w || 360) * 0.48);
  const carHByW = Math.round(carWByW * 1596 / 870);
  const carHMax = DESK && h > 100 ? Math.max(180, h - 80) : carHByW;
  const carH = Math.min(carHByW, carHMax);
  const carW = Math.round(carH * 870 / 1596);
  const side = ((w || 360) - carW - 8) / 2;
  const numFs = Math.max(22, Math.min(34, Math.floor(side / 3.1)));
  const WHEEL: Record<string, { l: number; t: number }> = { FL: { l: 16.2, t: 15.8 }, FR: { l: 71.7, t: 15.8 }, RL: { l: 16.9, t: 67.7 }, RR: { l: 71.0, t: 67.7 } };
  const legend = (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", alignItems: "center", justifyContent: "center", fontSize: 13, color: theme.text.secondary, flex: "none" }}>
        {[{ c: ok, l: `≥ ${TYRE_OK} OK` }, { c: amber, l: `${TYRE_RED}–${(TYRE_OK - 0.01).toFixed(2)} top up` }, { c: red, l: `< ${TYRE_RED} low` }].map((x) => (
          <span key={x.l} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: x.c, display: "inline-block" }} />
            {x.l}
          </span>
        ))}
        {!DESK && <span style={{ color: theme.text.tertiary }}>{`placard ${TYRE_PLACARD} cold · warm ${TYRE_HOT.lo}–${TYRE_HOT.hi} (${when(TYRE_HOT.date)})`}</span>}
      </div>
  );
  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0, maxWidth: DESK ? "none" : 480, height: DESK ? "100%" : undefined, minHeight: DESK ? 0 : undefined, overflow: DESK ? "hidden" : undefined }}>
      <span style={{ fontSize: 13, color: theme.text.tertiary, flex: "none" }}>{last && first ? `Cold · ${when(last[0])} ${last[0].slice(11)} · change since ${when(first[0])}` : ""}</span>
      <div style={{ display: "grid", gridTemplateColumns: `minmax(0, 1fr) ${carW}px minmax(0, 1fr)`, gridTemplateRows: DESK ? "minmax(0, 1fr) minmax(0, 1fr) auto" : "1fr 1fr", columnGap: 4, alignItems: "stretch", flex: DESK ? 1 : undefined, minHeight: 0 }}>
        {TYRE_POS.map((t) => {
          const v = val(last, t.i), d = v - val(first, t.i);
          const st = tyreState(v, dark);
          const ink = st.warn ? st.color : theme.text.primary;
          return (
            <div key={t.k} style={{ gridColumn: t.left ? 1 : 3, gridRow: t.row, alignSelf: t.row === 1 ? "start" : "end", display: "flex", flexDirection: t.left ? "row-reverse" : "row", alignItems: "center", justifyContent: "flex-start", gap: DESK ? 8 : 0, textAlign: t.left ? "right" : "left", minWidth: 0, paddingTop: t.row === 1 ? Math.round(carH * 0.13) : 0, paddingBottom: t.row === 2 ? Math.round(carH * 0.17) : 0 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: t.left ? "flex-end" : "flex-start", minWidth: 0 }}>
              <span style={{ fontSize: 13, lineHeight: "16px", color: st.warn ? st.color : theme.text.secondary }}>{st.warn ? `⚠ ${t.a}` : t.a}<br />{t.b}</span>
              <span style={{ marginTop: 4, color: ink, whiteSpace: "nowrap" }}>
                <span style={{ fontSize: numFs, fontWeight: 700, lineHeight: `${numFs + 4}px`, fontVariantNumeric: "tabular-nums" }}>{v.toFixed(2)}</span>
                <span style={{ fontSize: 14, marginLeft: 3, color: st.warn ? st.color : theme.text.secondary }}>bar</span>
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, color: st.warn ? st.color : theme.text.secondary, fontVariantNumeric: "tabular-nums" }}>{`${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}`}</span>
              </div>
              {DESK && first && last && <TyreSpark vals={TYRE_COLD.map((r) => r[t.i])} color={st.color} start={first[0]} end={last[0]} />}
            </div>
          );
        })}
        <div style={{ gridColumn: 2, gridRow: "1 / span 2", position: "relative", width: carW, height: carH, alignSelf: "center", lineHeight: 0 }}>
          <Image src={carPng} alt="Car from above, nose at the top, wheels coloured by cold tyre pressure" ratio="870/1596" width="100%" />
          {TYRE_POS.map((t) => {
            const c = tyreState(val(last, t.i), dark).color, p = WHEEL[t.k] ?? { l: 0, t: 0 };
            return <div key={t.k} aria-hidden style={{ position: "absolute", left: `${p.l}%`, top: `${p.t}%`, width: "12.1%", height: "14.7%", borderRadius: "27% / 12%", background: c, pointerEvents: "none" }} />;
          })}
        </div>
        {DESK && <div style={{ gridColumn: 2, gridRow: 3, display: "flex", justifyContent: "center", paddingTop: 8 }}>{legend}</div>}
      </div>
      {!DESK && legend}
    </div>
  );
}

function StylePanel() {
  const theme = useGrokTheme();
  const dark = isDarkTheme(theme);
  const { ref, w, h } = useWidth();
  const narrow = w < 560;
  const H = DESK ? Math.max(80, h) : narrow ? 240 : 280;
  const L = DESK ? 40 : 46, R = DESK ? 10 : 14, T = DESK ? 18 : 14, B = DESK ? 28 : 30;
  const pw = Math.max(10, w - L - R), ph = H - T - B;
  const x0 = 30, x1 = 56, y0 = 0.8, y1 = 2.4;
  const x = (v: number) => L + ((v - x0) / (x1 - x0)) * pw;
  const y = (v: number) => T + ph - ((v - y0) / (y1 - y0)) * ph;
  const dot = dark ? "#7FB2FF" : "#2F6FE0";
  const [sel, setSel] = useState(STYLE_TRIPS.length - 1);
  const [hover, setHover] = useState<number | null>(null);
  const st = STYLE_T[sel];
  const hv = hover !== null ? STYLE_T[hover] : undefined;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const tripDay = (s: string) => `${DOW3[new Date(utc(`2026-${s.slice(0, 5)}`)).getUTCDay()] ?? ""} ${Number(s.slice(3, 5))} ${MON[Number(s.slice(0, 2)) - 1] ?? ""} ${s.slice(6)}`;
  const PEAK_MARK = 90;
  const tiles = DESK ? [
        { label: "Heavy accel", value: `${STYLE.heavyPct}%`, note: `p95 ${STYLE.pedalP95}%`, color: "#F2994A" },
        { label: "Harsh", value: `${STYLE.harshPer100}`, note: `${STYLE.harshAcc} acc · ${STYLE.harshBrk} brk`, color: "#EB5757" },
        { label: "Cornering", value: `${STYLE.latG} g`, note: `max ${STYLE.latGMax} g`, color: "#9B51E0" },
        { label: "Braking", value: `${STYLE.brakePct}%`, note: `p99 ${STYLE.brakeP99} m/s²`, color: "#2F80ED" },
  ] : [
        { label: "Heavy accelerator", value: `${STYLE.heavyPct}%`, note: `pedal > 50% · p95 ${STYLE.pedalP95}%`, color: "#F2994A" },
        { label: "Harsh events", value: `${STYLE.harshPer100}`, note: `per 100 km · ${STYLE.harshAcc} accel / ${STYLE.harshBrk} brake`, color: "#EB5757" },
        { label: "Cornering", value: `${STYLE.latG} g`, note: `p98, est. from steering · max ${STYLE.latGMax} g`, color: "#9B51E0" },
        { label: "Braking", value: `${STYLE.brakePct}%`, note: `of moving time · p99 ${STYLE.brakeP99} m/s²`, color: "#2F80ED" },
  ];
  const pillEl = (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, padding: "2px 10px", borderRadius: 999, border: `1.5px solid ${theme.border.strong}`, color: theme.text.primary }}>One driving style</span>
        <span style={{ fontSize: 13, color: theme.text.tertiary }}>{`2-style split not distinct · silhouette ${STYLE.silhouette}`}</span>
      </div>
  );
  const legendEl = (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", alignItems: "center", fontSize: 13, color: theme.text.secondary }}>
        {[{ c: dot, l: `no harsh event · ${STYLE_TRIPS.filter((t) => t[3] === 0).length}` }, { c: HARSH_COLORS[1] ?? dot, l: `1 harsh · ${STYLE_TRIPS.filter((t) => t[3] === 1).length}` }, { c: HARSH_COLORS[2] ?? dot, l: `2+ harsh · ${STYLE_TRIPS.filter((t) => t[3] >= 2).length}` }].map((it) => (
          <span key={it.l} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: it.c, display: "inline-block" }} />
            {it.l}
          </span>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: theme.text.tertiary }}>
          <svg width={30} height={14} style={{ display: "block" }}><circle cx={5} cy={7} r={tripR(2)} fill={theme.text.tertiary} /><circle cx={21} cy={7} r={tripR(35)} fill={theme.text.tertiary} /></svg>
          size = trip km (2–35)
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: theme.text.tertiary }}>
          <svg width={12} height={10} style={{ display: "block" }}><path d="M1 9 L11 9 L6 1 Z" fill={theme.text.secondary} /></svg>
          {`peak pedal ≥ ${PEAK_MARK}% · ${STYLE_T.filter((t) => t[4] >= PEAK_MARK).length}`}
        </span>
      </div>
  );
  const detailEl = st && (
        <div aria-live="polite" style={{ minHeight: DESK ? 20 : 40, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 10px", fontSize: 14, color: theme.text.secondary }}>
          <span style={{ fontWeight: 800, color: theme.text.primary }}>{`${tripDay(st[5])} · ${st[2]} km`}</span>
          <span>{`pedal ${st[0]}% (top 5%) · peak ${st[4]}% · braking ${st[1]} m/s²${st[3] ? ` · ${st[3]} harsh` : ""}`}</span>
        </div>
      );
  const chartEl = (
      <div ref={ref} style={{ position: "relative", width: "100%", minWidth: 0, ...(DESK ? { flex: 1, minHeight: 0 } : { minHeight: H }) }}>
        {w > 0 && (!DESK || h > 0) && (
          <svg width={w} height={H} style={{ display: "block" }} role="img" aria-label="Each trip: accelerator use against hardest braking" onPointerLeave={() => { if (DESK) setHover(null); }}>
            {DESK && <text x={L - 8} y={12} textAnchor="end" fontSize={13} fill={theme.text.tertiary}>m/s²</text>}
            {[1.0, 1.5, 2.0].map((v) => (
              <g key={v}>
                <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} stroke={theme.border.subtle} />
                <text x={L - 8} y={y(v) + 5} textAnchor="end" fontSize={FS} fill={theme.text.tertiary}>{v.toFixed(1)}</text>
              </g>
            ))}
            {(DESK ? [30, 40, 50, 55] : [30, 35, 40, 45, 50, 55]).map((v) => (
              <g key={v}>
                <line x1={x(v)} x2={x(v)} y1={T} y2={T + ph} stroke={theme.border.subtle} />
                <text x={x(v)} y={T + ph + 18} textAnchor="middle" fontSize={FS} fill={theme.text.tertiary}>{`${v}%`}</text>
              </g>
            ))}
            {STYLE_T.map((t, i) => ({ t, i })).sort((a, b) => a.t[3] - b.t[3]).map(({ t, i }) => {
              const cx = x(t[0]), cy = y(t[1]), r = tripR(t[2]), col = t[3] > 0 ? HARSH_COLORS[Math.min(2, t[3])] ?? dot : dot;
              return (
                <g key={i} onClick={() => setSel(i)} onPointerEnter={(e: { pointerType: string }) => { if (e.pointerType === "mouse") { setSel(i); if (DESK) setHover(i); } }} style={{ cursor: "pointer" }}>
                  {(i === sel || i === hover) && <circle cx={cx} cy={cy} r={r + 6} fill={col} fillOpacity={0.25} />}
                  <circle cx={cx} cy={cy} r={r} fill={col} fillOpacity={0.9} />
                  {t[4] >= PEAK_MARK && <path d={`M${cx - 4} ${cy - r - 3} L${cx + 4} ${cy - r - 3} L${cx} ${cy - r - 10} Z`} fill={theme.text.secondary} />}
                  <circle cx={cx} cy={cy} r={Math.max(12, r + 4)} fill={col} fillOpacity={0} />
                </g>
              );
            })}
          </svg>
        )}
        {DESK && hv && (
          <HoverTip
            x={x(hv[0])}
            y={y(hv[1])}
            boxW={w}
            boxH={H}
            lines={[
              `${tripDay(hv[5])} · ${hv[2]} km`,
              `pedal ${hv[0]}% · peak ${hv[4]}%`,
              `brake ${hv[1]} m/s²${hv[3] ? ` · ${hv[3]} harsh` : ""}`,
            ]}
          />
        )}
      </div>
  );
  if (DESK) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0, height: "100%", minHeight: 0, flex: 1 }}>
        <HeadRow title="Driving style" />
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "row", gap: 16, padding: "0 4px 4px 0", alignItems: "stretch" }}>
          <div style={{ flex: "6 1 0", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>{chartEl}</div>
          <div style={{ flex: "4 1 0", alignSelf: "stretch", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)", alignItems: "stretch", justifyItems: "stretch", gap: 12, minWidth: 0, minHeight: 0, padding: "8px 8px 8px 4px", boxSizing: "border-box" }}>
            {tiles.map((t) => (
              <div key={t.label} style={{ borderRadius: 12, padding: "8px 10px", background: t.color + "14", border: `2px solid ${t.color}`, display: "flex", flexDirection: "column", justifyContent: "center", gap: 2, minWidth: 0, minHeight: 0, overflow: "hidden", boxSizing: "border-box" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: theme.text.secondary, lineHeight: "16px" }}>{t.label}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: theme.text.primary, lineHeight: "22px" }}>{t.value}</span>
                <span style={{ fontSize: 13, color: theme.text.tertiary, lineHeight: "16px" }}>{t.note}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
      <MetricTiles items={tiles} />
      {pillEl}
      {legendEl}
      {detailEl}
      <span style={{ fontSize: 13, fontWeight: 600, color: theme.text.secondary }}>↑ Hardest braking (m/s², top 1% of trip)</span>
      {chartEl}
      <span style={{ fontSize: 13, fontWeight: 600, color: theme.text.secondary, textAlign: "right" }}>Accelerator pressed (% of pedal, top 5% of trip) →</span>
    </div>
  );
}

const BOXPAD = 14;
function DeskWin({ stamp, children }: { stamp?: boolean; children?: ReactNode }) {
  const theme = useGrokTheme();
  return (
    <div className="rk-win">
      <div className="rk-bar" style={{ color: theme.text.tertiary }}>{stamp ? `Updated as of ${UPDATED} · XPENG data to ${READINGS_TO}` : ""}</div>
      <div className="rk-body">{children}</div>
    </div>
  );
}
export default function Dashboard() {
  const theme = useGrokTheme();
  const vw = useViewportW();
  DESK = vw >= 1024;
  const S = {
    combo: <Section heading="Distance, energy and cost"><ComboPanel /></Section>,
    heat: <Section heading="Driving Heatmap"><DriveHeatmap /></Section>,
    soc: <Section heading="Battery charge over time"><SocChart /></Section>,
    charges: <Section heading="Charging sessions"><ChargeCards /></Section>,
    soh: <Section heading="Battery health vs warranty"><SohPanel /></Section>,
    cal: <Section heading="Daily distance"><DistanceCalendar /></Section>,
    rest: <Section heading="Resting with aircon"><RestPanel /></Section>,
    tyre: <Section heading="Tyre pressure"><TyrePanel /></Section>,
    style: <Section heading="Driving style"><StylePanel /></Section>,
    speed: <Section heading="Efficiency by speed"><SpeedBands /></Section>,
    trips: <Section heading="Trips"><TripList /></Section>,
    stats: <Section heading="Driving and car stats"><StatTiles /></Section>,
    insights: <Section heading="Insights"><InsightChips /></Section>,
  };
  if (!DESK) {
    return (
      <Page title="Rocky · L03 Dashboard" width="wide">
        <Tiles />
        {S.combo}
        {S.heat}
        {S.soc}
        {S.charges}
        {S.soh}
        {S.cal}
        {S.rest}
        {S.tyre}
        {S.style}
        {S.speed}
        {S.trips}
        {S.stats}
        {S.insights}
      </Page>
    );
  }
  const cell = { display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, height: "100%", overflow: "hidden" } as const;
  const framed = { ...cell, border: `1px solid ${theme.border.default}`, borderRadius: 14, padding: `${BOXPAD}px ${BOXPAD + 4}px`, boxSizing: "border-box" as const };
  const fill = (heading: string, body: ReactNode) => <Section heading={heading} fill>{body}</Section>;
  return (
    <Page title="Rocky · L03 Dashboard" width="full">
      <div className="rkd" style={{ width: "100%", minWidth: 0 }}>
        <DeskWin stamp>
          <Tiles />
          <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridTemplateRows: "repeat(2, minmax(0, 1fr))", gap: 16, marginTop: 12 }}>
            <div style={framed}><Section fill><ComboPanel /></Section></div>
            <div style={framed}><Section fill><SocChart /></Section></div>
            <div style={framed}><Section fill><SohPanel /></Section></div>
            <div style={framed}><Section fill><StylePanel /></Section></div>
          </div>
        </DeskWin>
        <DeskWin>
          <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 3fr)", gap: 16 }}>
            <div style={framed}><Section fill><DriveHeatmap /></Section></div>
            <div style={{ minWidth: 0, minHeight: 0, display: "grid", gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
              <div style={framed}>{fill("Daily distance", <DistanceCalendar />)}</div>
              <div style={framed}>{fill("Efficiency by speed", <SpeedBands />)}</div>
            </div>
          </div>
        </DeskWin>
        <DeskWin>
          <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
            <div style={framed}>{fill("Charging sessions", <ChargeCards swipe />)}</div>
            <div style={framed}>{fill("Tyre pressure", <TyrePanel />)}</div>
          </div>
        </DeskWin>
        <DeskWin>
          <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
            <div style={framed}>{fill("Resting with aircon", <RestPanel />)}</div>
            <div style={framed}><Section fill><TripList /></Section></div>
          </div>
        </DeskWin>
        <DeskWin>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ ...framed, height: "auto", flex: "none" }}><Section heading="Other Highlights"><StatTiles /></Section></div>
            <div style={framed}>{fill("Insights", <InsightChips />)}</div>
          </div>
        </DeskWin>
      </div>
    </Page>
  );
}
