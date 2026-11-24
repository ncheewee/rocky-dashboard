#!/usr/bin/env python3
"""Derive chart data for the L03 Charging Dashboard from sessions.json + car_readings.json.
Writes $ROCKY_DATA_DIR/dashboard_data.json (intermediate). Then run scripts/build_ui_data.py,
which turns it into the UI contract src/data/dashboard.json. Nothing here is measured distance:
distance = displayed range used between the end of one charge and the start of the next."""
import os, json, datetime as dt
from collections import defaultdict
from pathlib import Path

# Working data dir (raw + intermediate files; gitignored, never committed): $ROCKY_DATA_DIR or ./data-raw
D = Path(os.environ.get("ROCKY_DATA_DIR") or Path(__file__).resolve().parent.parent / "data-raw")
WLTP_KM = 520.0
PACK_KWH = 71.2
AC_EFF = 0.90          # assumed AC charging efficiency (charger -> battery); band 0.85-0.95
AC_EFF_LO, AC_EFF_HI = 0.85, 0.95
DELIVERY = dt.date(2026, 11, 10)
MIN_SOH_RANGE_KM = 150
# only use charges that add >=150 km of range for SoH (small deltas are noise)
START_DATE = dt.date(2026, 11, 11)  # dashboard starts here; raw files keep earlier data, filtered out below
SOH_BASELINE_N = 2  # XPENG SoH: mean implied capacity of the first N big charges = 100% baseline

sessions = json.load(open(D / "sessions.json"))
readings = json.load(open(D / "car_readings.json"))
sessions = [x for x in sessions if dt.datetime.fromisoformat(x["start"]).date() >= START_DATE]
readings = [x for x in readings if dt.datetime.fromisoformat(x["time"]).date() >= START_DATE]
settings = json.load(open(D / "car_settings.json")) if (D / "car_settings.json").exists() else {}

def t(s):
    return dt.datetime.fromisoformat(s)

# --- distance: range used between consecutive charging events (XPENG app readings) ---
ev = sorted([r for r in readings if r.get("range_km") is not None and r.get("event") in ("start", "end")], key=lambda r: t(r["time"]))
gaps = []
for a, b in zip(ev, ev[1:]):
    if a["event"] == "end" and b["event"] == "start":
        used = a["range_km"] - b["range_km"]
        if used > 0:
            gaps.append({"from": a["time"], "to": b["time"], "range_used_km": used})

daily_km = defaultdict(float)   # estimate: spread evenly over calendar days in the gap
for g in gaps:
    d0, d1 = t(g["from"]).date(), t(g["to"]).date()
    days = [d0 + dt.timedelta(n) for n in range((d1 - d0).days + 1)]
    for d in days:
        daily_km[d.isoformat()] += g["range_used_km"] / len(days)

# odometer overrides (future): readings with "odometer_km" give measured daily distance
odo = sorted([r for r in readings if r.get("odometer_km") is not None], key=lambda r: t(r["time"]))
measured = {}
for a, b in zip(odo, odo[1:]):
    if t(a["time"]).date() == t(b["time"]).date() - dt.timedelta(1) or t(a["time"]).date() == t(b["time"]).date():
        measured[t(b["time"]).date().isoformat()] = measured.get(t(b["time"]).date().isoformat(), 0) + b["odometer_km"] - a["odometer_km"]

# --- energy and cost per day (by session start date) ---
daily_kwh, daily_kwh_est, daily_cost, daily_cost_est = defaultdict(float), defaultdict(float), defaultdict(float), defaultdict(float)
pending_days = set()
for s in sessions:
    d = t(s["start"]).date().isoformat()
    if s.get("kwh") is not None:
        daily_kwh[d] += s["kwh"]
    elif s.get("kwh_estimate") is not None:
        daily_kwh_est[d] += s["kwh_estimate"]
    if s.get("amount_sgd") is not None:
        daily_cost[d] += s["amount_sgd"]
    elif s.get("amount_estimate_sgd") is not None:
        daily_cost_est[d] += s["amount_estimate_sgd"]
    if s.get("pending"):
        pending_days.add(d)

known_through = max(t(r["time"]) for r in readings).date()
all_days = sorted(set(daily_km) | set(daily_kwh) | set(daily_kwh_est) | set(daily_cost) | set(measured))
start = START_DATE
daily = []
d = start
while d <= known_through:
    k = d.isoformat()
    km = measured.get(k)
    src = "odometer" if km is not None else ("range_estimate" if k in daily_km else "unknown")
    if km is None:
        km = round(daily_km[k], 1) if k in daily_km else None
    daily.append({"date": k, "km": km, "km_source": src,
                  "kwh": round(daily_kwh[k], 2), "kwh_est": round(daily_kwh_est[k], 2),
                  "cost": round(daily_cost[k], 2), "cost_est": round(daily_cost_est[k], 2), "pending": k in pending_days})
    d += dt.timedelta(1)

# --- weekly (Mon-Sun) ---
wk = {}
for r in daily:
    dd = dt.date.fromisoformat(r["date"]); mon = dd - dt.timedelta(dd.weekday())
    w = wk.setdefault(mon, {"km": 0.0, "km_unknown_days": 0, "kwh": 0.0, "kwh_est": 0.0, "cost": 0.0, "cost_est": 0.0, "pending": False})
    if r["km"] is None: w["km_unknown_days"] += 1
    else: w["km"] += r["km"]
    w["kwh"] += r["kwh"]; w["kwh_est"] += r["kwh_est"]; w["cost"] += r["cost"]; w["cost_est"] += r["cost_est"]; w["pending"] = w["pending"] or r["pending"]
weekly = []
for mon in sorted(wk):
    w = wk[mon]; sun = mon + dt.timedelta(6)
    lab = f"{mon.day}–{sun.day} {sun.strftime('%b')}" if mon.month == sun.month else f"{mon.day} {mon.strftime('%b')}–{sun.day} {sun.strftime('%b')}"
    weekly.append({"week": lab, "monday": mon.isoformat(), "km": round(w["km"], 1),
                   "kwh": round(w["kwh"], 2), "kwh_est": round(w["kwh_est"], 2), "cost": round(w["cost"], 2),
                   "cost_est": round(w["cost_est"], 2), "pending": w["pending"]})

# --- monthly (calendar month) ---
mo = {}
for r in daily:
    key = r["date"][:7]
    m_ = mo.setdefault(key, {"km": 0.0, "km_unknown_days": 0, "kwh": 0.0, "kwh_est": 0.0, "cost": 0.0, "cost_est": 0.0, "pending": False})
    if r["km"] is None: m_["km_unknown_days"] += 1
    else: m_["km"] += r["km"]
    m_["kwh"] += r["kwh"]; m_["kwh_est"] += r["kwh_est"]; m_["cost"] += r["cost"]; m_["cost_est"] += r["cost_est"]; m_["pending"] = m_["pending"] or r["pending"]
monthly = []
for key in sorted(mo):
    m_ = mo[key]; d0 = dt.date.fromisoformat(key + "-01")
    monthly.append({"month": d0.strftime("%b %Y"), "short": d0.strftime("%b"), "km": round(m_["km"], 1),
                    "kwh": round(m_["kwh"], 2), "kwh_est": round(m_["kwh_est"], 2), "cost": round(m_["cost"], 2),
                    "cost_est": round(m_["cost_est"], 2), "pending": m_["pending"]})

# --- SoH estimates from kWh at charger vs range fraction added ---
soh = []
def add_soh(date, kwh, km, label):
    frac = km / WLTP_KM
    cap_charger = kwh / frac
    soh.append({"date": date, "label": label, "kwh": round(kwh, 2), "range_added_km": km,
                "implied_kwh_at_charger": round(cap_charger, 1),
                "soh_pct": round(cap_charger * AC_EFF / PACK_KWH * 100, 1),
                "soh_lo": round(cap_charger * AC_EFF_LO / PACK_KWH * 100, 1),
                "soh_hi": round(cap_charger * AC_EFF_HI / PACK_KWH * 100, 1)})
# merge back-to-back sessions (gap < 15 min) into one charge
ss = sorted([s for s in sessions if s.get("kwh") and s.get("range_gained_km")], key=lambda s: t(s["start"]))
groups = []
for s in ss:
    if groups and (t(s["start"]) - t(groups[-1][-1]["end"])).total_seconds() < 900:
        groups[-1].append(s)
    else:
        groups.append([s])
for g in groups:
    km = sum(s["range_gained_km"] for s in g); kwh = sum(s["kwh"] for s in g)
    if km >= MIN_SOH_RANGE_KM:
        end = g[-1].get("charge_end") or g[-1]["end"]
        add_soh(t(end).date().isoformat(), kwh, km, f"{g[0]['range_start_km']}→{g[-1]['range_end_km']} km, {kwh:.2f} kWh")

# --- KPIs ---
rec = [s for s in sessions if s.get("kwh") and s.get("range_gained_km") and s.get("amount_sgd") is not None]
rk = sum(s["range_gained_km"] for s in rec); re_ = sum(s["kwh"] for s in rec); rc = sum(s["amount_sgd"] for s in rec)
month = known_through.strftime("%Y-%m")
km_month = sum(r["km"] for r in daily if r["date"].startswith(month) and r["km"] is not None)
out = {
    "generated": dt.datetime.now().isoformat(timespec="minutes"),
    "readings_through": known_through.isoformat(),
    "assumptions": {"wltp_km_as_100pct": WLTP_KM, "pack_kwh": PACK_KWH, "ac_efficiency": AC_EFF,
                    "ac_efficiency_band": [AC_EFF_LO, AC_EFF_HI], "delivery": DELIVERY.isoformat(), "start_date": START_DATE.isoformat(),
                    "warranty": "XPENG SG manual: SOH >= 70% at 8 yr / 160,000 km; >= 62% at 10 yr / 200,000 km (extended 2-yr battery warranty); drawn 100% -> 70% (yr 8) -> 62% (yr 10), basis 71.2 kWh rated = 100%"},
    "settings": settings,
    "gaps": gaps, "daily": daily, "weekly": weekly, "monthly": monthly, "soh": soh,
    "kpi": {"km_month_est": round(km_month), "month": month,
            "sgd_per_100km": round(rc / rk * 100, 2), "kwh_per_100km": round(re_ / rk * 100, 1),
            "basis_range_km": rk, "basis_kwh": round(re_, 2), "basis_sgd": round(rc, 2),
            "soh_latest": soh[-1] if soh else None},
}
# --- XPENG Data Act export (xpeng_derived.json from parse_xpeng_export.py) ---
xp_path = D / "xpeng_derived.json"
if xp_path.exists():
    xp = json.load(open(xp_path))
    k = xp["kpis"]
    caps = [ch for ch in xp["charges"] if ch.get("implied_capacity_kwh")]
    base = sum(ch["implied_capacity_kwh"] for ch in caps[:SOH_BASELINE_N]) / max(1, min(SOH_BASELINE_N, len(caps))) if caps else None
    out["soh_xpeng"] = {"baseline_kwh_per_100pct": round(base, 1) if base else None, "rated_kwh": PACK_KWH,
        "points": [{"date": t(ch["end"]).date().isoformat(), "kwh_per_100pct": ch["implied_capacity_kwh"],
                    "soh_rel_pct": round(ch["implied_capacity_kwh"] / base * 100, 1), "soh_abs_pct": ch["soh_pct"],
                    # health basis (from 23 Nov 2026): rated PACK_KWH = 100%; soh_rel_pct kept as "% of new" (first measured)
                    "soh_rated_pct": ch["soh_pct"],  # unrounded capacity / PACK_KWH (parse_xpeng_export)
                    "soh_rated_lo": round(ch["soh_pct"] * (1 - 1 / (ch["soc_end"] - ch["soc_start"])), 1),
                    "soh_rated_hi": round(ch["soh_pct"] * (1 + 1 / (ch["soc_end"] - ch["soc_start"])), 1),
                    # uncertainty: displayed SOC is whole %, so +-0.5 pt at each end => +-1 pt on the SOC gained
                    "soh_lo": round(ch["implied_capacity_kwh"] / base * 100 * (1 - 1 / (ch["soc_end"] - ch["soc_start"])), 1),
                    "soh_hi": round(ch["implied_capacity_kwh"] / base * 100 * (1 + 1 / (ch["soc_end"] - ch["soc_start"])), 1),
                    "soc": f'{ch["soc_start"]}→{ch["soc_end"]}%'} for ch in caps]}
    out["kpi"].update({"km_since_start": k["km_since_start"], "odometer_km": k["odometer_km"],
        "kwh_per_100km_driving": k["kwh_per_100km_driving"], "kwh_per_100km_incl_parked": k["kwh_per_100km_incl_parked_awake"],
        "real_full_range_km": k["real_full_range_km"], "sgd_per_100km_est": k["sgd_per_100km_est"], "regen_share_pct": k["regen_share_pct"],
        "soh_abs_pct": k["soh_pct_charge_est"]})
    start = START_DATE.isoformat()
    # minutes moving per date x hour from the merged 1 Hz store (speed > 0 or gear D/R), SGT
    dmin = {}
    store = D / "xpeng-export" / "merged_1hz.csv.gz"
    if store.exists():
        import gzip, csv
        sgt = dt.timezone(dt.timedelta(hours=8))
        for row in csv.DictReader(gzip.open(store, "rt")):
            try: spd = float(row["esp_vehspd"] or 0)
            except ValueError: spd = 0
            if spd == 255: spd = 0
            if spd > 0 or row["ldcu_currentgearlev"] in ("1", "3", "1.0", "3.0"):
                tt = dt.datetime.fromtimestamp(int(float(row["timer"])), sgt)
                if tt.date() >= START_DATE:
                    dmin.setdefault(tt.date().isoformat(), [0.0] * 24)[tt.hour] += 1 / 60
    out["xpeng"] = {
        "drive_min_by_date_hour": {d: [round(v) for v in hrs] for d, hrs in sorted(dmin.items())},
        # heatmap bins (the Page recomputes these from DRIVE_MIN): green < amber_from <= amber < red_from <= red
        "drive_min_bins": (lambda c: (lambda avg: {"avg": round(avg, 1), "amber_from": max(2, round(avg * 0.67)),
            "red_from": max(max(2, round(avg * 0.67)) + 1, round(avg * 1.5))})(sum(c) / len(c) if c else 0))(
            [m for hrs in dmin.values() for m in (round(v) for v in hrs) if m > 0]),
        "kpis": k,
        "insights": [s for s in xp["insights"] if "Before handover" not in s],  # nothing before START_DATE
        "charges": [{kk: vv for kk, vv in ch.items()} for ch in xp["charges"] if ch["start"][:10] >= start],
        # charges cut off by the export end: receipt unplug time + share of the plugged window the export covers
        # (Page CHARGES: coverage, finalPending, "Unplugged" stat, time = plug-in–unplug from the receipt)
        "charge_receipt_overlay": [
            {"start": ch["start"], "export_end": ch["end"], "unplug": rs["end"], "kwh_billed": rs.get("kwh"), "sgd": rs.get("amount_sgd"),
             "coverage": round((t(ch["end"]) - t(ch["start"])).total_seconds() / max(1, (t(rs["end"]) - t(ch["start"])).total_seconds()), 3),
             "final_soc_pending": True}
            for ch in xp["charges"] if ch["start"][:10] >= start and ch.get("ongoing_at_export_end")
            for rs in sessions if rs.get("end") and not rs.get("pending") and abs((t(rs["start"]) - t(ch["start"])).total_seconds()) < 1800],
        "speed_bins": xp["speed_bins"], "tod_heatmap": xp["tod_heatmap"],
        # added 22 Nov: resting with aircon, tyre trend, driving style (+ 2-cluster check), weekday vs weekend
        "rests": xp.get("rests", []), "rest_summary": xp.get("rest_summary"),
        "tyres_daily_bar": [r for r in xp.get("tyres_daily_bar", []) if r["date"] >= start],
        "driving_style": xp.get("driving_style"),
        # 22 Nov round F: efficiency heatmap (weekday_weekend dropped from the Page)
        "eff_by_date_hour": {k: v for k, v in sorted(xp.get("eff_by_date_hour", {}).items()) if k >= start},
        # 22 Nov round G: per-drive heatmap blocks [date, start min, end min, km, min, kWh/100 km] and cold tyre readings
        "drives": [[tr["date"], round(t(tr["start"]).hour * 60 + t(tr["start"]).minute + t(tr["start"]).second / 60, 1),
                    round(t(tr["end"]).hour * 60 + t(tr["end"]).minute + t(tr["end"]).second / 60, 1), tr["km"], tr["duration_min"],
                    tr["kwh_per_100km"] if tr["km"] >= 1 else None] for tr in xp["trips"] if tr["date"] >= start],
        "tyres_cold": [r for r in xp.get("tyres_cold", []) if r["t"][:10] >= start], "tyres_hot_latest": xp.get("tyres_hot_latest"),
        "tyre_placard_bar": xp.get("tyre_placard_bar"),
        "eff_by_date": {k: v for k, v in sorted(xp.get("eff_by_date", {}).items()) if k >= start}, "eff_bins": xp.get("eff_bins"),
        "trips_longest": sorted([tr for tr in xp["trips"] if tr["date"] >= start], key=lambda tr: -tr["km"])[:10],
        "trips_recent": sorted([tr for tr in xp["trips"] if tr["date"] >= start], key=lambda tr: tr["start"])[-10:][::-1],
        # soc series compacted: [minutes since START_DATE 00:00, soc %, state c/d/p]
        "soc_series": [[int((dt.datetime(START_DATE.year, int(r[0][:2]), int(r[0][3:5]), int(r[0][6:8]), int(r[0][9:11])) - dt.datetime.combine(START_DATE, dt.time())).total_seconds() // 60), r[1], r[3]]
                       for r in xp["soc_series"]["data"] if f"{START_DATE.year}-{r[0][:5]}" >= start and r[1] is not None],
    }
json.dump(out, open(D / "dashboard_data.json", "w"), indent=1, ensure_ascii=False)
print(f"wrote {D / 'dashboard_data.json'}: {len(out['daily'])} days, readings through {out['readings_through']}")
