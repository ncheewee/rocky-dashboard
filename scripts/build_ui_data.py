#!/usr/bin/env python3
"""Build the UI data contract src/data/dashboard.json from the pipeline output.

Inputs (in $ROCKY_DATA_DIR, default ./data-raw; never committed):
  dashboard_data.json  from scripts/build_dashboard_data.py
  sessions.json        charging sessions from MNL receipts (receipt handling: see README "Refresh data")
Output:
  src/data/dashboard.json   (committed; the only data the UI reads; schema = src/data/types.ts)

Usage:
  python3 scripts/build_ui_data.py [--today YYYY-MM-DD] [--updated "24 Nov 2026"] [--check]
--today   last data day shown (Monday refresh: the Sunday before). Default: the value already in the JSON.
--updated the "updated" stamp. Default: today's date (SGT) when the data changed, else unchanged.
--check   print which keys would change and exit without writing.

Ported from the Grok Bot canvas generator (page_constants.py): same values, emitted as JSON instead of TS.
"""
import json, sys, os, datetime as dt
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = Path(os.environ.get("ROCKY_DATA_DIR") or ROOT / "data-raw")
OUT = ROOT / "src" / "data" / "dashboard.json"
SCHEMA_VERSION = 1
START = "2026-11-11"          # dashboard start date (first day shown)
DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def g(x):  # 7.0 -> "7", 6.82 -> "6.82"
    return f"{x:g}" if isinstance(x, (int, float)) else str(x)


def day(iso):  # "Wed 11 Nov"
    d = dt.date.fromisoformat(iso[:10]); return f"{DOW[d.weekday()]} {d.day} {MON[d.month-1]}"


def hm(iso): return iso[11:16]


def thin_soc(ser, G=10):
    """5-min SOC series -> UI points: keep state changes, both sides of gaps > 10 min, and one point per 15 min."""
    out, lk = [], None
    for i, (m, s, st) in enumerate(ser):
        p = ser[i-1] if i else None; n = ser[i+1] if i + 1 < len(ser) else None
        if not p or not n or st != p[2] or st != n[2] or m - p[0] > G or n[0] - m > G or m - lk >= 15:
            out.append(f"{m},{s},{st}"); lk = m
    return out


def build(data, sessions, today, updated):
    x = data["xpeng"]; k = x["kpis"]; C = {}
    start = START
    dto = dt.date.fromisoformat(k["data_to"][:10])
    C["UPDATED"] = updated
    C["READINGS_TO"] = f"{dto.day} {MON[dto.month-1]}"
    C["TODAY"] = today
    C["START_DATE"] = START
    C["DELIVERY"] = data["assumptions"]["delivery"]
    C["WARRANTY_Y8"] = "2034-11-10"    # XPENG SG manual: SOH >= 70% at 8 yr / 160,000 km
    C["WARRANTY_END"] = "2036-11-10"   # SOH >= 62% at 10 yr / 200,000 km (extended 2-yr battery warranty)
    C["WEEKLY"] = [{"label": w["week"], "km": w["km"], "kwh": w["kwh"], "kwhEst": w["kwh_est"], "cost": w["cost"], "costEst": w["cost_est"], "pending": w["pending"]} for w in data["weekly"]]
    C["MONTHLY"] = [{"label": m["month"], "short": m["short"], "km": m["km"], "kwh": m["kwh"], "kwhEst": m["kwh_est"], "cost": m["cost"], "costEst": m["cost_est"], "pending": m["pending"]} for m in data["monthly"]]

    def dl(r):
        d = dt.date.fromisoformat(r["date"])
        return {"date": r["date"], "label": f"{DOW[d.weekday()]} {d.day}", "short": str(d.day), "km": r["km"], "src": r["km_source"], "kwh": r["kwh"], "kwhEst": r["kwh_est"], "cost": r["cost"], "costEst": r["cost_est"], "pending": r["pending"]}
    C["DAILY"] = [dl(r) for r in data["daily"] if r["date"] <= today]
    sx = data["soh_xpeng"]
    # health basis: rated pack (71.2 kWh) = 100%; pctNew = vs first measured capacity
    C["SOH_RATED_KWH"] = sx["rated_kwh"]
    C["SOH"] = [{"date": p["date"], "rel": p["soh_rated_pct"], "pctNew": p["soh_rel_pct"], "kwh": p["kwh_per_100pct"], "lo": p["soh_rated_lo"], "hi": p["soh_rated_hi"]} for p in sx["points"]]
    C["SOC_RAW"] = ";".join(thin_soc(x["soc_series"]))
    C["SOC_DAYS"] = k["days"]
    # charges: export charge + receipts (sessions starting from 2 h before to the charge end), newest last
    rows = []
    ov = {o["start"]: o for o in x.get("charge_receipt_overlay", [])}
    for c in x["charges"]:
        if c["start"][:10] < start: continue
        cs, ce = dt.datetime.fromisoformat(c["start"]), dt.datetime.fromisoformat(c["end"])
        ss = [s for s in sessions if s.get("kwh") and cs - dt.timedelta(hours=2) <= dt.datetime.fromisoformat(s["start"]) <= ce]
        kwh = round(sum(s["kwh"] for s in ss), 2); sgd = round(sum(s.get("amount_sgd") or 0 for s in ss), 2)
        prof = [p[1] for p in c["profile_15min_kw"]]
        o = ov.get(c["start"])
        row = {"label": day(c["start"]), "tag": c["type"], "live": False, "socFrom": c["soc_start"], "socTo": c["soc_end"]}
        if o and o.get("final_soc_pending"):
            unplug = o["unplug"]; plugged = round((dt.datetime.fromisoformat(unplug) - cs).total_seconds() / 3600, 1)
            st = [["Billed", f"{kwh:.2f} kWh"], ["Cost", f"S${sgd:.2f}"], ["Plugged in", f"{g(plugged)} h"], ["Unplugged", hm(unplug)], ["Peak / avg", f"{g(c['peak_kw'])} / {g(round(o['kwh_billed'] / ((dt.datetime.fromisoformat(unplug) - cs).total_seconds() / 3600), 2))} kW"], ["Pack max (to 23:59)", f"{g(c['pack_temp_max_c'])} °C"]]
            row.update({"time": f"{hm(c['start'])}–{hm(unplug)}", "socNote": f"at {hm(o['export_end'])}", "coverage": o["coverage"], "finalPending": True})
        else:
            st = [["Billed", f"{kwh:.2f} kWh"], ["Cost", f"S${sgd:.2f}"], ["Into pack", f"{g(c['kwh_into_pack'])} kWh"], ["Efficiency", f"{g(c['efficiency_pct'])}%"], ["Peak / avg", f"{g(c['peak_kw'])} / {g(c['avg_kw'])} kW"], ["Charging", f"{g(c['duration_h'])} h"], ["Pack max", f"{g(c['pack_temp_max_c'])} °C"], ["Per 100%", f"{g(c['implied_capacity_kwh'])} kWh"]]
            row.update({"time": f"{hm(c['start'])}–{hm(c['end'])}", "socNote": ""})
        row.update({"profile": prof, "stats": st})
        rows.append(row)
    C["CHARGES"] = rows
    C["SPEED"] = [{"band": b["bin_kmh"], "time": b["time_pct"], "km": b["km_pct"], "eff": b["kwh_per_100km"]} for b in x["speed_bins"]]
    C["DRIVE_MIN"] = {d: v for d, v in x["drive_min_by_date_hour"].items() if start <= d <= today}
    tr = lambda t: {"when": f"{day(t['start'])} · {hm(t['start'])}", "km": t["km"], "min": t["duration_min"], "eff": t["kwh_per_100km"], "max": t["max_kmh"], "avg": t["moving_avg_kmh"]}
    C["TRIPS_LONGEST"] = [tr(t) for t in x["trips_longest"]]
    C["TRIPS_RECENT"] = [tr(t) for t in x["trips_recent"]]
    ins = list(x["insights"])
    tc0 = x["tyres_cold"][-1]; tv0 = [tc0["fl"], tc0["fr"], tc0["rl"], tc0["rr"]]; h0 = x["tyres_hot_latest"]; hv0 = [h0["fl"], h0["fr"], h0["rl"], h0["rr"]]
    td0 = dt.date.fromisoformat(tc0["t"][:10])
    cold0 = f"{tv0[0]:.2f}" if len(set(tv0)) == 1 else f"{min(tv0):.2f}–{max(tv0):.2f}"
    ins = [f"Tyres {k['tyre_kpa_delivery'] / 100:.2f} bar at handover; now {cold0} bar cold ({td0.day} {MON[td0.month-1]}) vs the {g(x['tyre_placard_bar'])} bar cold placard, {min(hv0):.2f}–{max(hv0):.2f} when warm."
           if t.startswith("Tyres went from") else t for t in ins]
    C["INSIGHTS"] = ins
    # KPI tiles
    pts = sx["points"]; last = pts[-1]
    rec = [s for s in sessions if s.get("amount_sgd") and s["start"][:10] >= start]
    pend = [s for s in sessions if s.get("pending") and s["start"][:10] >= start]
    spent = sum(s["amount_sgd"] for s in rec) + sum(s.get("amount_estimate_sgd") or 0 for s in pend)
    kwh_all = sum(s["kwh"] for s in rec)
    spent_note = f"{kwh_all:.2f} kWh · {len(rec)} receipts" if not pend else f"S${sum(s['amount_sgd'] for s in rec):.2f} + S${sum(s.get('amount_estimate_sgd') or 0 for s in pend):.2f} pending"
    T = [
        ("route", "#2F80ED", f'{g(k["km_since_start"])} km', None, "Driven since 11 Nov", f'odometer · {round(k["km_per_day"])} km a day'),
        ("bolt", "#00A3B4", f'{g(k["kwh_per_100km_driving"])}', "kWh/100 km", "Efficiency", f'measured · {g(k["kwh_per_100km_incl_parked_awake"])} incl. parked'),
        ("range", "#27AE60", f'{g(k["real_full_range_km"])} km', None, "Real full range", "vs 520 km WLTP"),
        ("coin", "#F2994A", f'S${k["sgd_per_100km_est"]:.2f}', None, "Per 100 km", "est. at S$0.58 per kWh"),
        ("gauge", "#6C5CE7", f'{g(k["odometer_km"])} km', None, "Odometer", f'at {C["READINGS_TO"]}'),
        ("regen", "#16A085", f'{round(k["regen_share_pct"])}%', None, "Regen share", f'{g(k["regen_kwh"])} kWh recovered'),
        ("battery", "#9B51E0", f'{g(last["soh_rated_pct"])}%', None, "Battery health", f'{g(last["kwh_per_100pct"])} kWh · {g(last["soh_rel_pct"])}% of new'),
        ("plug", "#EB5757", f"S${spent:.2f}", None, "Spent charging", spent_note),
    ]
    C["TILES"] = [dict({"icon": i, "color": c, "value": v}, **({"unit": u} if u else {}), label=l, note=n) for i, c, v, u, l, n in T]
    tc = x["tyres_cold"][-1]; tv = [tc["fl"], tc["fr"], tc["rl"], tc["rr"]]
    tval = f"{tv[0]:.2f} bar" if len(set(tv)) == 1 else f"{min(tv):.2f}–{max(tv):.2f} bar"
    td = dt.date.fromisoformat(tc["t"][:10]); gt = k["gear_time_pct"]; dr = k["doors_opened"]
    S = [("Top speed", f'{g(k["top_speed_kmh"])} km/h', f'{day(k["top_speed_at"])} {hm(k["top_speed_at"])}'),
         ("Peak power", f'{g(k["max_drive_kw"])} kW', f'{g(k["max_regen_kw"])} kW regen · {g(k["max_motor_torque_nm"])} Nm'),
         ("0–50 km/h", f'{k["best_0_50_s"]} s', "best run"),
         ("Harsh events", f'{k["harsh_accel"]} / {k["harsh_brake"]}', f'accel / brake in {g(k["km_since_start"])} km'),
         ("Tyres", tval, f"cold {td.day} {MON[td.month-1]} · placard {g(x['tyre_placard_bar'])} cold"),
         ("Battery temp", f'{g(k["pack_temp_min_c"])}–{g(k["pack_temp_max_c"])} °C', f'cell spread {g(k["pack_temp_spread_max_c"])} °C'),
         ("Sleep drain", f'{k["phantom_soc_pct_per_day"]:.2f}%', f'SOC a day · {g(k["asleep_hours"])} h asleep'),
         ("Charge efficiency", f'{round(k["ac_charge_efficiency_pct"])}%', "wall to pack"),
         ("Trips", f'{k["trips"]}', f'{g(k["drive_hours"])} h · {g(k["avg_trip_km"])} km avg'),
         ("Gear time", f'D {g(gt["D"])}%', f'P {g(gt["P"])}% · R {g(gt["R"])}%'),
         ("Night wake-ups", f'{k["night_wakes_00_06"]}', f'00:00–06:00 · {k["short_wakes"]} short wakes'),
         ("Doors opened", f'{dr["driver"]}', f'driver · passenger {dr["front_passenger"]} · rear {dr["rear_left"]} / {dr["rear_right"]}')]
    C["STATS"] = [{"label": a, "value": b, "note": c} for a, b, c in S]
    C["DRIVES"] = x["drives"]
    C["EFF_DAY"] = x["eff_by_date"]
    eb = x["eff_bins"]; C["EFF_BINS"] = {"avg": eb["avg"], "greenBelow": eb["green_below"], "redFrom": eb["red_from"]}
    C["RESTS"] = [[r["date"][5:], r["start"], int(r["min"]), r["kwh"], r["sgd"], r["avg_kw"]] for r in x["rests"]]
    rs = x["rest_summary"]; C["REST_SUM"] = {"rests": rs["rests"], "hours": rs["hours"], "kwh": rs["kwh"], "sgd": rs["sgd"], "avgKw": rs["avg_kw"]}
    C["TYRE_COLD"] = [[t["t"], t["fl"], t["fr"], t["rl"], t["rr"]] for t in x["tyres_cold"]]
    h = x["tyres_hot_latest"]; hv = [h["fl"], h["fr"], h["rl"], h["rr"]]
    C["TYRE_HOT"] = {"date": h["date"], "lo": min(hv), "hi": max(hv)}
    ds = x["driving_style"]; trips = ds["trips"]
    C["STYLE_TRIPS"] = [[int(t["pedal_p95"]), t["brake_p99"], (int(t["km"]) if float(t["km"]).is_integer() else t["km"]), t["harsh"]] for t in trips]
    C["STYLE_PEAK"] = [[int(t["pedal_max"]), t["start"][5:16].replace("T", " ")] for t in trips]
    cc = ds["cluster_check"]
    C["STYLE"] = {"heavyPct": ds["heavy_pedal_pct"], "pedalP95": ds["pedal_p95"], "harshPer100": ds["harsh_per_100km"], "harshAcc": ds["harsh_accel"], "harshBrk": ds["harsh_brake"], "latG": ds["lat_g_p98_est"], "latGMax": ds["lat_g_max_est"], "brakePct": ds["brake_pct_moving"], "brakeP99": ds["brake_p99_ms2"], "silhouette": cc["silhouette"], "distinct": bool(cc["distinct"])}
    return C


def main():
    a = sys.argv[1:]
    opt = lambda key, d=None: a[a.index(key) + 1] if key in a else d
    old = json.load(open(OUT)) if OUT.exists() else {}
    today = opt("--today", old.get("TODAY"))
    if not today: sys.exit("--today YYYY-MM-DD is required on the first run")
    data = json.load(open(D / "dashboard_data.json")); sessions = json.load(open(D / "sessions.json"))
    C = build(data, sessions, today, old.get("UPDATED", ""))
    changed = [key for key in C if key != "UPDATED" and C[key] != old.get(key)]
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    C["UPDATED"] = opt("--updated") or (f"{now.day} {MON[now.month-1]} {now.year}" if changed or not old else old["UPDATED"])
    out = {"schemaVersion": SCHEMA_VERSION, **C}
    for key in out:
        print(f"{key}: {'CHANGED' if out[key] != old.get(key) else 'same'}")
    if "--check" in a: return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
