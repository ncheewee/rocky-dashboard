#!/usr/bin/env python3
"""Parse XPENG Data Act exports (GDPR "driving_*" CSVs, 1 Hz while the car is awake) for Rocky (XPENG L03).

Usage:
  python3 parse_xpeng_export.py [ZIP_OR_DIR ...]      # merge new export(s), then derive
  python3 parse_xpeng_export.py                        # re-derive from the existing merged store

Idempotent: every export is merged into xpeng-export/merged_1hz.csv.gz keyed by `timer` (epoch seconds,
UTC); duplicate timestamps keep the newest export's row. Outputs:
  xpeng_derived.json   chart-ready series (daily, trips, charges, soc_series, heatmaps, insights, kpis)
  car_readings.json    merged (never overwritten) with odometer_sod/odometer_eod per day and xp_charge_start/end
The merged store and raw CSVs stay on the box: do NOT send them to anyone (privacy). The current export
format has no GPS columns; if a future export adds lat/lon, they are dropped here on purpose.
"""
import os, sys, json, glob, zipfile, tempfile, datetime as dt
from pathlib import Path
import numpy as np, pandas as pd

# Working data dir (raw + intermediate files; gitignored, never committed): $ROCKY_DATA_DIR or ./data-raw
D = Path(os.environ.get("ROCKY_DATA_DIR") or Path(__file__).resolve().parent.parent / "data-raw")
STORE = D / "xpeng-export" / "merged_1hz.csv.gz"
OUT = D / "xpeng_derived.json"
READINGS = D / "car_readings.json"
TZ = "Asia/Singapore"
START = pd.Timestamp("2026-11-11", tz=TZ)      # dashboard start date
PACK_KWH, WLTP_KM, PRICE = 71.2, 520.0, 0.58   # S$/kWh at home charger (MNL, incl GST)
GEAR = {1: "D", 2: "N", 3: "R", 4: "P"}         # inferred: 1 moving fwd, 3 negative motor rpm, 4 parked
DROP = {"vin", "vmodel", "ds"}
GPS_HINTS = ("lat", "lon", "lng", "gps", "position", "location")

# ---------------------------------------------------------------- ingest
def read_export(path):
    path = Path(path); tmp = None
    if path.suffix == ".zip":
        tmp = tempfile.mkdtemp(); zipfile.ZipFile(path).extractall(tmp); path = Path(tmp)
    df = None
    for f in sorted(path.glob("*.csv")):
        x = pd.read_csv(f)
        x = x[[c for c in x.columns if c not in DROP and not any(h in c.lower() for h in GPS_HINTS)]]
        x = x.drop_duplicates("timer", keep="last")   # exports repeat a few identical rows; dedupe before the outer merge
        df = x if df is None else df.merge(x, on="timer", how="outer")
    return df

def load_store(new_paths):
    parts = [pd.read_csv(STORE)] if STORE.exists() else []
    parts += [read_export(p) for p in new_paths]
    df = pd.concat(parts, ignore_index=True)
    df = df.drop_duplicates("timer", keep="last").sort_values("timer").reset_index(drop=True)
    df = df.dropna(axis=1, how="all")
    STORE.parent.mkdir(exist_ok=True); df.to_csv(STORE, index=False, compression="gzip")
    return df

# ---------------------------------------------------------------- clean
def clean(df):
    d = df.copy()
    d["t"] = pd.to_datetime(d.timer, unit="s", utc=True).dt.tz_convert(TZ)
    def bad(col, lo, hi):
        if col in d: d.loc[~d[col].between(lo, hi), col] = np.nan
    bad("esp_vehspd", 0, 250); bad("ldcu_bms_soc_disp", 0, 100); bad("ldcu_chrgpwr", 0, 400)
    bad("bms_battvolt", 250, 520); bad("bms_battcurr", -700, 700); bad("ldcu_dstbatdisp_dynamic", 0, 900)
    for c in ["bms_batttempmax_gb", "bms_batttempmin_gb"]: bad(c, -30, 80)
    for c in ["ldcu_tpmsprfl", "ldcu_tpmsprfr", "ldcu_tpmsprrl", "ldcu_tpmsprrr"]: bad(c, 100, 450)
    bad("esp_vehlongaccel", -2, 2); bad("ipur_actrotspd", -20000, 20000); bad("ipur_acttorq", -400, 400)
    bad("ipur_rotoracttemp", 1, 200)
    o = d.cdcu_totalodometer.where(d.cdcu_totalodometer > 0)
    d["odo"] = o.ffill()
    d["soc"] = d.ldcu_bms_soc_disp.ffill()
    d["dt"] = d.timer.diff().shift(-1).clip(upper=5).fillna(1)   # seconds this row represents
    d["gap_before"] = d.timer.diff().fillna(1e9)
    d["p_kw"] = d.bms_battvolt * d.bms_battcurr / 1000             # + = out of pack, - = into pack
    d["e_kwh"] = (d.p_kw * d.dt / 3600).fillna(0)
    d["spd"] = d.esp_vehspd.fillna(0)
    d["km"] = d.spd * d.dt / 3600
    d["gear"] = d.ldcu_currentgearlev.map(GEAR)
    d["charging"] = d.ldcu_chrgpwr.fillna(0) > 0.3
    return d

def runs(mask, t, max_break=300):
    """Group True rows into runs, bridging breaks (False rows or data gaps) shorter than max_break s."""
    idx = np.flatnonzero(mask.values); out = []
    if not len(idx): return out
    tv = t.values; s = p = idx[0]
    for i in idx[1:]:
        if tv[i] - tv[p] > max_break: out.append((s, p)); s = i
        p = i
    out.append((s, p)); return out

def _np(o):
    if isinstance(o, np.integer): return int(o)
    if isinstance(o, np.floating): return None if np.isnan(o) else float(o)
    if isinstance(o, np.bool_): return bool(o)
    raise TypeError(type(o))

iso = lambda ts: ts.strftime("%Y-%m-%dT%H:%M:%S+08:00")
r1 = lambda x, n=1: None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), n)

# ---------------------------------------------------------------- derive
def derive(d):
    t = d.timer
    # charges
    charges = []
    for s, e in runs(d.charging, t, 900):
        x = d.iloc[s:e + 1]; c = x[x.charging]
        ac_kwh = float((c.ldcu_chrgpwr * c.dt).sum() / 3600)
        batt_kwh = float(-x.e_kwh.sum())
        s0 = d.soc.iloc[max(s - 1, 0)] if s > 0 and d.timer.iloc[s] - d.timer.iloc[s - 1] < 900 else x.soc.iloc[0]
        s0 = min(s0, x.soc.min()); s1 = x.soc.max()
        peak = float(c.ldcu_chrgpwr.max()); dur = (x.t.iloc[-1] - x.t.iloc[0]).total_seconds() / 3600
        prof = c.set_index("t").ldcu_chrgpwr.resample("15min").mean().dropna()
        dsoc = s1 - s0
        cap = batt_kwh / dsoc * 100 if dsoc >= 25 else None
        charges.append({
            "start": iso(x.t.iloc[0]), "end": iso(x.t.iloc[-1]), "duration_h": r1(dur, 2),
            "type": "DC" if peak > 11.5 else "AC", "soc_start": int(s0), "soc_end": int(s1),
            "range_start_km": r1(x.ldcu_dstbatdisp_dynamic.dropna().iloc[0] if x.ldcu_dstbatdisp_dynamic.notna().any() else None, 0),
            "range_end_km": r1(x.ldcu_dstbatdisp_dynamic.max(), 0), "odometer_km": r1(x.odo.iloc[0], 0),
            "kwh_ac_input": r1(ac_kwh, 2), "kwh_into_pack": r1(batt_kwh, 2),
            "efficiency_pct": r1(batt_kwh / ac_kwh * 100, 1) if ac_kwh > 1 else None,
            "peak_kw": r1(peak, 1), "avg_kw": r1(c.ldcu_chrgpwr.mean(), 2),
            "pack_temp_max_c": r1(x.bms_batttempmax_gb.max(), 0),
            "implied_capacity_kwh": r1(cap, 1), "soh_pct": r1(cap / PACK_KWH * 100, 1) if cap else None,
            "ongoing_at_export_end": bool(e == len(d) - 1),
            "profile_15min_kw": [[p.strftime("%H:%M"), round(v, 2)] for p, v in prof.items()],
        })
    chg_rows = np.zeros(len(d), bool)
    for s, e in runs(d.charging, t, 900): chg_rows[s:e + 1] = True
    d["in_charge"] = chg_rows

    # trips
    moving = ((d.spd > 0) | d.gear.isin(["D", "R"])) & ~d.in_charge
    trips = []; trip_id = np.full(len(d), -1)
    for s, e in runs(moving, t, 300):
        x = d.iloc[s:e + 1]; km = float(x.km.sum())
        if km < 0.2: continue
        trip_id[s:e + 1] = len(trips)
        dur = (x.t.iloc[-1] - x.t.iloc[0]).total_seconds() / 3600
        mv = x[x.spd > 0]
        e_out = float(x.e_kwh.clip(lower=0).sum()); e_reg = float(-x.e_kwh.clip(upper=0).sum()); e_net = e_out - e_reg
        trips.append({
            "start": iso(x.t.iloc[0]), "end": iso(x.t.iloc[-1]), "date": x.t.iloc[0].strftime("%Y-%m-%d"),
            "km": r1(km, 1), "odo_start": r1(x.odo.iloc[0], 0), "odo_end": r1(x.odo.iloc[-1], 0),
            "duration_min": r1(dur * 60, 0), "avg_kmh": r1(km / dur if dur else None, 1),
            "moving_avg_kmh": r1(mv.km.sum() / (mv.dt.sum() / 3600) if len(mv) else None, 1),
            "max_kmh": r1(x.spd.max(), 0), "kwh": r1(e_net, 2), "regen_kwh": r1(e_reg, 2),
            "kwh_per_100km": r1(e_net / km * 100, 1), "soc_start": r1(x.soc.iloc[0], 0), "soc_end": r1(x.soc.iloc[-1], 0),
            "stopped_pct": r1((x.spd == 0).mean() * 100, 0),
        })
    d["trip"] = trip_id
    d["state"] = np.where(d.in_charge, "charging", np.where(d.trip >= 0, "driving", "parked_awake"))

    # accel from speed (1 s steps), harsh events
    dv = d.spd.diff() / 3.6; ok = d.timer.diff() == 1
    a = (dv.where(ok)).rolling(2, min_periods=2).mean()
    d["acc"] = a
    def events(mask):
        idx = np.flatnonzero(mask.fillna(False).values); n = 0; last = -99
        ev = []
        for i in idx:
            if i - last > 3: ev.append(i); n += 1
            last = i
        return ev
    harsh_acc = events((d.acc > 3.0) & (d.trip >= 0)); harsh_brk = events((d.acc < -3.5) & (d.trip >= 0))

    # daily
    days = pd.date_range(d.t.min().normalize(), d.t.max().normalize(), freq="D")
    daily = []; prev_eod = None
    for day in days:
        x = d[(d.t >= day) & (d.t < day + pd.Timedelta(days=1))]
        tr = [r for r in trips if r["date"] == day.strftime("%Y-%m-%d")]
        drv = x[x.state == "driving"]; prk = x[x.state == "parked_awake"]; ch = [c for c in charges if c["start"][:10] == day.strftime("%Y-%m-%d")]
        odo_eod = float(x.odo.dropna().iloc[-1]) if x.odo.notna().any() else prev_eod
        odo_sod = prev_eod if prev_eod is not None else (float(x.odo.dropna().iloc[0]) if x.odo.notna().any() else None)
        km_odo = (odo_eod - odo_sod) if odo_eod is not None and odo_sod is not None else None
        e_drv = float(drv.e_kwh.sum()); e_prk = float(prk.e_kwh.sum())
        daily.append({
            "date": day.strftime("%Y-%m-%d"), "dow": day.strftime("%a"), "has_data": bool(len(x)),
            "km": r1(km_odo, 0), "km_speed_integrated": r1(drv.km.sum(), 1), "odo_eod": r1(odo_eod, 0),
            "trips": len(tr), "drive_min": r1(drv.dt.sum() / 60, 0),
            "kwh_driving": r1(e_drv, 2), "kwh_parked_awake": r1(e_prk, 2),
            "kwh_per_100km": r1(e_drv / drv.km.sum() * 100, 1) if drv.km.sum() > 2 else None,
            "regen_kwh": r1(-drv.e_kwh.clip(upper=0).sum(), 2),
            "kwh_charged_ac": r1(sum(c["kwh_ac_input"] or 0 for c in ch), 2),
            "cost_used_est_sgd": None,  # filled below once charger efficiency is known
            "soc_min": r1(x.soc.min(), 0), "soc_max": r1(x.soc.max(), 0), "soc_eod": r1(x.soc.iloc[-1], 0) if len(x) else None,
            "max_kmh": r1(drv.spd.max(), 0) if len(drv) else None,
            "pack_temp_max_c": r1(x.bms_batttempmax_gb.max(), 0), "pack_temp_min_c": r1(x.bms_batttempmin_gb.min(), 0),
            "tyre_kpa": {k: r1(drv[c].median(), 0) if len(drv) else None for k, c in
                         [("fl", "ldcu_tpmsprfl"), ("fr", "ldcu_tpmsprfr"), ("rl", "ldcu_tpmsprrl"), ("rr", "ldcu_tpmsprrr")]},
            "harsh_accel": sum(1 for i in harsh_acc if d.t.iloc[i].normalize() == day),
            "harsh_brake": sum(1 for i in harsh_brk if d.t.iloc[i].normalize() == day),
            "awake_h": r1(x.dt.sum() / 3600, 1),
        })
        prev_eod = odo_eod

    return d, charges, trips, daily, harsh_acc, harsh_brk

def summarise(d, charges, trips, daily, harsh_acc, harsh_brk):
    w = d[d.t >= START]; tw = [r for r in trips if r["start"] >= iso(START)]
    dw = [r for r in daily if r["date"] >= START.strftime("%Y-%m-%d")]
    cw = [c for c in charges if c["start"] >= iso(START)]
    drv = w[w.state == "driving"]; prk = w[w.state == "parked_awake"]
    km_odo = sum(r["km"] or 0 for r in dw); km_int = float(drv.km.sum())
    e_out = float(drv.e_kwh.clip(lower=0).sum()); e_reg = float(-drv.e_kwh.clip(upper=0).sum()); e_net = e_out - e_reg
    e_prk = float(prk.e_kwh.sum())
    effs = [c["efficiency_pct"] for c in cw if c["type"] == "AC" and c["efficiency_pct"] and (c["kwh_ac_input"] or 0) > 5]
    ac_eff = float(np.mean(effs)) / 100 if effs else 0.88
    for r in daily:
        r["cost_used_est_sgd"] = r1(((r["kwh_driving"] or 0) + max(r["kwh_parked_awake"] or 0, 0)) / ac_eff * PRICE, 2)
    caps = [c for c in cw if c["implied_capacity_kwh"]]
    # SOC-based discharge capacity: net energy out between charges / SOC used
    # per-trip SOC drop vs net energy (integer SOC, so only meaningful summed over many trips)
    tsoc = [(r["soc_start"] - r["soc_end"], r["kwh"]) for r in tw if r["soc_start"] is not None and r["soc_end"] is not None]
    soc_drop = sum(a for a, _ in tsoc); soc_e = sum(b for _, b in tsoc)
    cap_drive = soc_e / soc_drop * 100 if soc_drop >= 20 else None
    real_range = km_int / soc_drop * 100 * (km_odo / km_int if km_int else 1) if soc_drop >= 20 else None

    # speed bins
    mv = drv[drv.spd > 0]
    bins = [0, 20, 40, 60, 80, 100, 250]; labs = ["0-20", "20-40", "40-60", "60-80", "80-100", "100+"]
    mv = mv.assign(bin=pd.cut(mv.spd, bins, labels=labs, include_lowest=True))
    sp = []
    for b in labs:
        g = mv[mv.bin == b]; km = g.km.sum()
        sp.append({"bin_kmh": b, "time_pct": r1(g.dt.sum() / mv.dt.sum() * 100, 1), "km_pct": r1(km / mv.km.sum() * 100, 1),
                   "kwh_per_100km": r1(g.e_kwh.sum() / km * 100, 1) if km > 3 else None})
    # time-of-day heatmap (minutes driving and km)
    hm = drv.assign(dow=drv.t.dt.dayofweek, hr=drv.t.dt.hour)
    tod = [[r1(hm[(hm.dow == i) & (hm.hr == h)].dt.sum() / 60, 0) for h in range(24)] for i in range(7)]
    km_by_date_hour = {day: [r1(g[g.t.dt.hour == h].km.sum(), 1) for h in range(24)]
                       for day, g in drv.groupby(drv.t.dt.strftime("%Y-%m-%d"))}
    # gear share (awake time)
    gear = {k: r1(v / w.dt.sum() * 100, 1) for k, v in w.groupby("gear").dt.sum().items()}
    # doors (0->1 transitions)
    doors = {}
    for k, c in [("driver", "ldcu_driverdoorajarst"), ("front_passenger", "rdcu_psngrdoorajarst"), ("rear_left", "ldcu_rldoorajarst"), ("rear_right", "rdcu_rrdoorajarst")]:
        if c in w: doors[k] = int(((w[c] == 1) & (w[c].shift() == 0)).sum())
    # phantom drain while asleep (data gaps > 30 min, not charging, SOC known both sides)
    gaps = w[(w.gap_before > 1800)]
    sleep_h = 0.0; sleep_soc = 0.0
    for i in gaps.index:
        j = d.index.get_loc(i)
        if j == 0: continue
        a, b = d.iloc[j - 1], d.iloc[j]
        if a.in_charge or b.in_charge or np.isnan(a.soc) or np.isnan(b.soc): continue
        sleep_h += b.gap_before / 3600; sleep_soc += a.soc - b.soc
    wakes = [(s, e) for s, e in runs(pd.Series(True, index=w.index), w.timer, 60)]
    short_wakes = sum(1 for s, e in wakes if w.timer.iloc[e] - w.timer.iloc[s] <= 130 and not w.iloc[s:e + 1].in_charge.any() and (w.iloc[s:e + 1].trip < 0).all())
    night_wakes = sum(1 for s, e in wakes if w.t.iloc[s].hour < 6 and not w.iloc[s:e + 1].in_charge.any() and (w.iloc[s:e + 1].trip < 0).all())
    # 0-50 best
    best050 = None
    for s, e in runs(drv.spd > 0, drv.timer, 2):
        g = drv.iloc[s:e + 1]
        if g.spd.iloc[0] > 3: continue
        hit = g[g.spd >= 50]
        if len(hit):
            tt = hit.timer.iloc[0] - g.timer.iloc[0]
            if 2 < tt < 20 and (best050 is None or tt < best050[0]): best050 = (tt, iso(g.t.iloc[0]))
    top = drv.loc[drv.spd.idxmax()] if len(drv) else None
    pmax = drv.p_kw.max(); pmin = drv.p_kw.min()
    gom = w[(w.soc > 20) & w.ldcu_dstbatdisp_dynamic.notna()]
    gom_full = float((gom.ldcu_dstbatdisp_dynamic / gom.soc * 100).median())
    tyres = d[d.state == "driving"][["ldcu_tpmsprfl", "ldcu_tpmsprfr", "ldcu_tpmsprrl", "ldcu_tpmsprrr"]]
    tyre_first = d[["ldcu_tpmsprfl", "ldcu_tpmsprfr", "ldcu_tpmsprrl", "ldcu_tpmsprrr"]].dropna().iloc[0].mean()
    tyre_now = tyres.dropna().tail(3600).mean().mean()
    pre = d[d.t < START]
    heavy_pedal = float((drv.ldcu_accpedalsig >= 80).sum() / max((drv.ldcu_accpedalsig > 0).sum(), 1) * 100)
    brake_pct = float(drv[drv.spd > 0].ldcu_brkpedalst.mean() * 100)
    hottest = d.bms_celltempmaxnum_gb.mode().iloc[0] if d.bms_celltempmaxnum_gb.notna().any() else None
    longest = max(tw, key=lambda r: r["km"]) if tw else None
    best_eff = min([r for r in tw if r["km"] >= 10], key=lambda r: r["kwh_per_100km"], default=None)
    worst_eff = max([r for r in tw if r["km"] >= 10], key=lambda r: r["kwh_per_100km"], default=None)
    busiest = max(dw, key=lambda r: r["km"] or 0) if dw else None
    zero_days = [r["date"] for r in dw if (r["km"] or 0) == 0]
    n_days = len(dw)
    kwh100 = e_net / km_int * 100 if km_int else None
    kwh100_all = (e_net + max(e_prk, 0)) / km_int * 100 if km_int else None
    cost100 = kwh100_all / ac_eff * PRICE if kwh100_all else None
    soh = float(np.mean([c["soh_pct"] for c in caps])) if caps else None
    hours_tod = np.array([[v or 0 for v in row] for row in tod]); pk = np.unravel_index(hours_tod.argmax(), hours_tod.shape)
    hour_tot = hours_tod.sum(0); peak_hr = int(hour_tot.argmax())
    wkday_km = np.mean([r["km"] or 0 for r in dw if r["dow"] not in ("Sat", "Sun")]) if dw else 0
    wkend_km = np.mean([r["km"] or 0 for r in dw if r["dow"] in ("Sat", "Sun")] or [0])
    ac_kw = [c["peak_kw"] for c in cw if c["type"] == "AC"]

    kpis = {
        "data_from": iso(d.t.min()), "data_to": iso(d.t.max()), "analysis_from": START.strftime("%Y-%m-%d"),
        "odometer_km": r1(d.odo.dropna().iloc[-1], 0), "km_since_start": r1(km_odo, 0), "days": n_days,
        "km_per_day": r1(km_odo / n_days, 1) if n_days else None, "trips": len(tw),
        "avg_trip_km": r1(km_int / len(tw), 1) if tw else None, "drive_hours": r1(drv.dt.sum() / 3600, 1),
        "avg_moving_kmh": r1(mv.km.sum() / (mv.dt.sum() / 3600), 1) if len(mv) else None,
        "kwh_per_100km_driving": r1(kwh100, 1), "kwh_per_100km_incl_parked_awake": r1(kwh100_all, 1),
        "sgd_per_100km_est": r1(cost100, 2), "kwh_driving": r1(e_net, 1), "kwh_parked_awake": r1(e_prk, 1),
        "regen_share_pct": r1(e_reg / e_out * 100, 1) if e_out else None, "regen_kwh": r1(e_reg, 1),
        "real_full_range_km": r1(real_range, 0), "gom_full_range_km": r1(gom_full, 0),
        "soh_pct_charge_est": r1(soh, 1), "capacity_kwh_charge_est": r1(np.mean([c["implied_capacity_kwh"] for c in caps]), 1) if caps else None,
        "capacity_kwh_drive_est": r1(cap_drive, 1), "ac_charge_efficiency_pct": r1(ac_eff * 100, 1),
        "ac_peak_kw": r1(max(ac_kw), 1) if ac_kw else None, "charges": len(cw),
        "kwh_charged_ac": r1(sum(c["kwh_ac_input"] or 0 for c in cw), 1),
        "top_speed_kmh": r1(top.spd, 0) if top is not None else None, "top_speed_at": iso(top.t) if top is not None else None,
        "max_drive_kw": r1(pmax, 0), "max_regen_kw": r1(-pmin, 0),
        "max_motor_torque_nm": r1(drv.ipur_acttorq.max(), 0), "max_rotor_temp_c": r1(w.ipur_rotoracttemp.max(), 0),
        "best_0_50_s": best050[0] if best050 else None,
        "harsh_accel": sum(1 for i in harsh_acc if d.t.iloc[i] >= START), "harsh_brake": sum(1 for i in harsh_brk if d.t.iloc[i] >= START),
        "heavy_pedal_pct": r1(heavy_pedal, 1), "brake_while_moving_pct": r1(brake_pct, 1),
        "pack_temp_max_c": r1(w.bms_batttempmax_gb.max(), 0), "pack_temp_min_c": r1(w.bms_batttempmin_gb.min(), 0),
        "pack_temp_spread_max_c": r1((w.bms_batttempmax_gb - w.bms_batttempmin_gb).max(), 0), "hottest_probe": r1(hottest, 0),
        "tyre_kpa_delivery": r1(tyre_first, 0), "tyre_kpa_now": r1(tyre_now, 0),
        "phantom_soc_pct_per_day": r1(sleep_soc / sleep_h * 24, 2) if sleep_h > 24 else None, "asleep_hours": r1(sleep_h, 0),
        "short_wakes": short_wakes, "night_wakes_00_06": night_wakes, "doors_opened": doors, "gear_time_pct": gear,
        "zero_km_days": zero_days, "weekday_km_avg": r1(wkday_km, 0), "weekend_km_avg": r1(wkend_km, 0),
        "peak_hour": peak_hr,
        "pre_start_data": {"from": iso(pre.t.min()) if len(pre) else None, "odo_from": r1(pre.odo.dropna().min(), 0) if len(pre) else None,
                           "odo_at_start": r1(pre.odo.dropna().iloc[-1], 0) if len(pre) else None,
                           "charges": [c for c in charges if c["start"] < iso(START)] and
                                      [{k: c[k] for k in ("start", "type", "soc_start", "soc_end", "kwh_ac_input", "peak_kw", "odometer_km")} for c in charges if c["start"] < iso(START)]},
    }
    f = lambda x, n=0: f"{x:,.{n}f}" if x is not None else "?"
    ins = [
        f"{f(km_odo)} km in {n_days} days since 11 Nov: {f(km_odo / n_days, 1)} km/day, odometer now {f(kpis['odometer_km'])} km.",
        f"Real consumption {f(kwh100, 1)} kWh/100 km on the move ({f(kwh100_all, 1)} incl. aircon while parked), about S${f(cost100, 2)} per 100 km at S$0.58/kWh.",
        f"Real full-charge range at this pace ≈ {f(real_range)} km vs WLTP 520 km; the car's own estimate implies {f(gom_full)} km.",
        f"Battery health ≈ {f(soh, 1)}% from {len(caps)} big charge(s) (pack took {', '.join(f(c['implied_capacity_kwh'], 1) for c in caps)} kWh per 100% SOC vs 71.2 kWh rated).",
        f"Home AC charging peaks at {f(max(ac_kw) if ac_kw else None, 1)} kW and {f(ac_eff * 100)}% of the kWh you pay for reaches the pack.",
        f"Regen recovered {f(e_reg, 1)} kWh = {f(e_reg / e_out * 100 if e_out else None)}% of the energy used to drive.",
        f"{len(tw)} trips, {f(drv.dt.sum() / 3600, 1)} h behind the wheel, average trip {f(km_int / len(tw) if tw else None, 1)} km at {kpis['avg_moving_kmh']} km/h moving.",
        f"Top speed {f(kpis['top_speed_kmh'])} km/h ({top.t.strftime('%a %d %b %H:%M') if top is not None else '?'}); peak {f(pmax)} kW drawn, {f(-pmin)} kW regen.",
        f"Most efficient band: {min([s for s in sp if s['kwh_per_100km']], key=lambda s: s['kwh_per_100km'])['bin_kmh']} km/h; crawling under 20 km/h costs {sp[0]['kwh_per_100km']} kWh/100 km.",
        (f"Busiest day {busiest['date']} ({busiest['dow']}) with {f(busiest['km'])} km; " + (f"{len(zero_days)} day(s) parked all day." if zero_days else "Rocky moved every single day.")) if busiest else "",
        f"Weekdays average {f(wkday_km)} km, weekends {f(wkend_km)} km; most driving starts around {peak_hr:02d}:00.",
        f"Longest trip {f(longest['km'], 1)} km on {longest['date']} at {longest['kwh_per_100km']} kWh/100 km." if longest else "",
        f"Best ≥10 km trip {best_eff['kwh_per_100km']} kWh/100 km ({best_eff['date']}), worst {worst_eff['kwh_per_100km']} ({worst_eff['date']})." if best_eff else "",
        f"Parked with the car awake (aircon/screen) used {f(e_prk, 1)} kWh over {f(prk.dt.sum() / 3600, 1)} h.",
        f"Asleep it barely sips: about {f(kpis['phantom_soc_pct_per_day'], 1)}% SOC per day over {f(sleep_h)} h parked." if kpis["phantom_soc_pct_per_day"] is not None else "",
        f"Smooth driver: {kpis['harsh_accel']} harsh accelerations (>3 m/s²) and {kpis['harsh_brake']} harsh stops (>3.5 m/s²) in {f(km_int)} km; " + (f"accelerator past 80% only {f(heavy_pedal, 1)}% of the time." if heavy_pedal >= 0.05 else f"accelerator 99% of the time under {int(drv[drv.spd > 0].ldcu_accpedalsig.quantile(.99))}%."),
        f"Best 0–50 km/h: {best050[0]} s." if best050 else "",
        f"Pack stayed {f(kpis['pack_temp_min_c'])}–{f(kpis['pack_temp_max_c'])} °C, max cell spread {f(kpis['pack_temp_spread_max_c'])} °C: no heat stress.",
        f"Tyres went from {f(tyre_first)} kPa ({f(tyre_first / 6.895)} psi) at handover to {f(tyre_now)} kPa ({f(tyre_now / 6.895)} psi) now.",
        *[f"Charge {c['start'][8:10]}/{c['start'][5:7]}: {c['soc_start']}→{c['soc_end']}% in {c['duration_h']} h, {c['kwh_ac_input']} kWh from the wall, peak {c['peak_kw']} kW" + (" (still charging when the export ended)." if c['ongoing_at_export_end'] else ".") for c in cw],
        *[f"Before handover: a {c['type']} fast charge on {c['start'][8:10]}/{c['start'][5:7]} hit {c['peak_kw']} kW ({c['soc_start']}→{c['soc_end']}% in {round(c['duration_h'] * 60)} min) at {f(c['odometer_km'])} km on the odometer." for c in charges if c['start'] < iso(START) and c['type'] == 'DC'],
        f"{night_wakes} short night-time wake-ups (00:00–06:00), likely app checks or OTA.",
    ]
    return kpis, [i for i in ins if i], sp, tod, km_by_date_hour

# ---------------------------------------------------------------- extras (added 22 Nov 2026)
REST_MIN, AIRCON_KW = 10, 0.45   # rest = parked-awake run >= 10 min (owner, 22 Nov); median pack draw >= 0.45 kW => likely aircon
COLD_GAP_H, TYRE_PLACARD_BAR = 3, 2.6   # cold = first refreshed TPMS reading after >= 3 h asleep; manual: 260 kPa cold (18", no/half load)
EFF_MIN_KM = 1.0                 # efficiency heatmap: hour cells with < 1 km driven are left empty
WHEELBASE_M, STEER_RATIO = 2.88, 14.5  # for the cornering-g estimate (no lateral-accel column in the store)

def extras(d, trips, daily, harsh_acc, harsh_brk):
    w = d[d.t >= START].reset_index(drop=True)
    s0 = START.strftime("%Y-%m-%d")
    # 1. rests: parked & awake (not driving, not charging), breaks < 60 s bridged, >= REST_MIN minutes
    rests, standby = [], {"n": 0, "min": 0.0, "kwh": 0.0}
    for s, e in runs(w.state == "parked_awake", w.timer, 60):
        x = w.iloc[s:e + 1]; x = x[x.state == "parked_awake"]
        mins = float(x.dt.sum() / 60)
        if mins < REST_MIN: continue
        kwh = float(x.e_kwh.clip(lower=0).sum()); med = float(x.p_kw.median())
        if med >= AIRCON_KW:
            rests.append({"date": x.t.iloc[0].strftime("%Y-%m-%d"), "start": x.t.iloc[0].strftime("%H:%M"), "min": r1(mins, 0),
                          "kwh": r1(kwh, 3), "sgd": r1(kwh * PRICE, 2), "avg_kw": r1(kwh / (mins / 60), 2), "median_kw": r1(med, 2),
                          "likely_aircon": True})
        else:  # car electronics staying awake (~0.2-0.3 kW), mostly the ~6 min after locking: not a rest
            standby["n"] += 1; standby["min"] += mins; standby["kwh"] += kwh
    tot_min = sum(r["min"] for r in rests); tot_kwh = sum(r["kwh"] for r in rests)
    rest_summary = {"rests": len(rests), "hours": r1(tot_min / 60, 1), "kwh": r1(tot_kwh, 2), "sgd": r1(tot_kwh * PRICE, 2),
                    "avg_kw": r1(tot_kwh / (tot_min / 60), 2) if tot_min else None, "rule": f">= {REST_MIN} min parked & awake, median pack draw >= {AIRCON_KW} kW",
                    "standby_excluded": {"n": standby["n"], "hours": r1(standby["min"] / 60, 1), "kwh": r1(standby["kwh"], 2)}}
    # 1b. efficiency heatmap: net pack kWh / km per date x hour while driving (hours with < EFF_MIN_KM km -> None)
    dv = w[w.state == "driving"]
    eff_dh, eff_day = {}, {}
    for day, x in dv.groupby(dv.t.dt.strftime("%Y-%m-%d")):
        hrs = []
        for h in range(24):
            g = x[x.t.dt.hour == h]; km = float(g.km.sum())
            hrs.append(r1(float(g.e_kwh.sum()) / km * 100, 1) if km >= EFF_MIN_KM else None)
        eff_dh[day] = hrs
        km = float(x.km.sum()); eff_day[day] = r1(float(x.e_kwh.sum()) / km * 100, 1) if km >= EFF_MIN_KM else None
    eff_avg = r1(float(dv.e_kwh.sum()) / float(dv.km.sum()) * 100, 1) if float(dv.km.sum()) > 0 else None
    # 2b. cold tyre readings (22 Nov): after >= COLD_GAP_H parked (no rows = asleep) the TPMS keeps showing the stale
    # pre-sleep (warm) value; each sensor sends a fresh value only once the wheels roll (rears ~10 s, fronts ~60 s after
    # moving off). Cold = per tyre, the first fresh value after moving off (701.25 kPa = invalid sentinel, ignored); if
    # the value never changes within 180 s, the value at +180 s (stale and fresh were equal).
    cold = []
    tcols = ["ldcu_tpmsprfl", "ldcu_tpmsprfr", "ldcu_tpmsprrl", "ldcu_tpmsprrr"]
    gapv = d.timer.diff()
    for s_ in d.index[(gapv >= COLD_GAP_H * 3600) & (d.t >= START)]:
        seg = d.loc[s_:s_ + 1800]
        brk = seg.index[gapv.loc[seg.index] > 600]; brk = brk[brk > s_]
        if len(brk): seg = seg.loc[:brk[0] - 1]          # stay within this wake (no driving -> skip)
        mv = seg.index[seg.spd > 0]
        if not len(mv): continue
        m0 = mv[0]
        vals, okk = {}, True
        for k, c in zip(["fl", "fr", "rl", "rr"], tcols):
            x = d.loc[s_:m0 + 180, c]; x = x[x.notna() & (x < 500)]
            if not len(x): okk = False; break
            stale = x.iloc[0]; after = x.loc[m0:]
            fresh = after[after != stale]
            vals[k] = r1(float(fresh.iloc[0] if len(fresh) else (after.iloc[-1] if len(after) else stale)) / 100, 2)
        if okk:
            cold.append({"t": d.t[m0].strftime("%Y-%m-%d %H:%M"), "parked_h": r1(gapv[s_] / 3600, 1), **vals})
    hot = d[(d.state == "driving") & (d.t >= START) & (d.ldcu_tpmsprfl < 500)]
    hot_latest = None
    if len(hot):
        last_day = hot.t.dt.strftime("%Y-%m-%d").iloc[-1]; hx = hot[hot.t.dt.strftime("%Y-%m-%d") == last_day]
        hot_latest = {"date": last_day, **{k: r1(float(hx[c].quantile(.9)) / 100, 2) for k, c in zip(["fl", "fr", "rl", "rr"], tcols)}}
    # 2. tyres: daily median while driving, bar
    tc = [("fl", "ldcu_tpmsprfl"), ("fr", "ldcu_tpmsprfr"), ("rl", "ldcu_tpmsprrl"), ("rr", "ldcu_tpmsprrr")]
    drv = w[w.state == "driving"]
    tyres = []
    for day, x in drv.groupby(drv.t.dt.strftime("%Y-%m-%d")):
        tyres.append({"date": day, **{k: r1(x[c].median() / 100, 2) for k, c in tc}})
    # 3. driving style: per-trip features + 2-cluster check (k-means, silhouette); page shows a split only if silhouette >= 0.5
    v = d.spd / 3.6
    latg = (v ** 2 * np.tan(np.deg2rad(d.eps_steeringangle.fillna(0) / STEER_RATIO)) / WHEELBASE_M / 9.81).abs().where(d.spd > 10)
    feats = []
    from collections import Counter
    harsh_by_trip = Counter(int(d.trip.iloc[j]) for j in list(harsh_acc) + list(harsh_brk) if d.trip.iloc[j] >= 0)
    for i, tr in enumerate(trips):
        if tr["date"] < s0 or tr["km"] < 2: continue
        x = d[d.trip == i]; mv = x[x.spd > 0]
        feats.append({"start": tr["start"], "km": tr["km"], "pedal_p95": r1(mv.ldcu_accpedalsig.quantile(.95), 0), "pedal_max": r1(mv.ldcu_accpedalsig[mv.ldcu_accpedalsig <= 100].max(), 0),
                      "pedal_s_ge90": int((mv.ldcu_accpedalsig[mv.ldcu_accpedalsig <= 100] >= 90).sum()),
                      "heavy_pct": r1((mv.ldcu_accpedalsig > 50).mean() * 100, 1), "accel_p99": r1(x.acc.quantile(.99), 2),
                      "brake_p99": r1(-x.acc.quantile(.01), 2), "max_kmh": tr["max_kmh"], "moving_kmh": tr["moving_avg_kmh"],
                      "lat_g_p98": r1(latg[x.index].quantile(.98), 2), "brake_pct": r1((mv.ldcu_brkpedalst > 0).mean() * 100, 0),
                      "harsh": int(harsh_by_trip.get(i, 0))})
    cols = ["pedal_p95", "heavy_pct", "accel_p99", "brake_p99", "moving_kmh", "lat_g_p98", "brake_pct"]
    cl = {"k": 2, "silhouette": None, "sizes": None, "distinct": False}
    if len(feats) >= 10:
        F = pd.DataFrame(feats)[cols].astype(float); X = ((F - F.mean()) / F.std()).fillna(0).values
        rng = np.random.default_rng(0); best = None
        for _ in range(50):
            c = X[rng.choice(len(X), 2, replace=False)]
            for _ in range(100):
                lab = ((X[:, None, :] - c[None]) ** 2).sum(2).argmin(1)
                c = np.array([X[lab == k].mean(0) if (lab == k).any() else c[k] for k in range(2)])
            inert = float(((X - c[lab]) ** 2).sum())
            if best is None or inert < best[0]: best = (inert, lab)
        lab = best[1]; D_ = np.sqrt(((X[:, None] - X[None]) ** 2).sum(2)); sil = []
        for i in range(len(X)):
            same = lab == lab[i]; a = D_[i, same].sum() / max(1, same.sum() - 1); b = D_[i, ~same].mean() if (~same).any() else 0
            sil.append((b - a) / max(a, b) if max(a, b) else 0)
        cl = {"k": 2, "silhouette": r1(np.mean(sil), 2), "sizes": [int((lab == 0).sum()), int((lab == 1).sum())],
              "distinct": bool(np.mean(sil) >= 0.5 and min((lab == 0).sum(), (lab == 1).sum()) >= 0.2 * len(lab)),
              "means": [{c_: r1(pd.DataFrame(feats)[c_][lab == k].mean(), 2) for c_ in cols} for k in range(2)]}
        for f_, l_ in zip(feats, lab): f_["cluster"] = int(l_)
    dm = drv[drv.spd > 0]; km = float(drv.km.sum())
    nha = sum(1 for i in harsh_acc if d.t.iloc[i] >= START); nhb = sum(1 for i in harsh_brk if d.t.iloc[i] >= START)
    style = {"heavy_pedal_pct": r1((dm.ldcu_accpedalsig > 50).mean() * 100, 1), "pedal_p95": r1(dm.ldcu_accpedalsig.quantile(.95), 0),
             "harsh_per_100km": r1((nha + nhb) / km * 100, 1), "harsh_accel": nha, "harsh_brake": nhb,
             "lat_g_p98_est": r1(latg[drv.index].quantile(.98), 2), "lat_g_max_est": r1(latg[drv.index].quantile(.999), 2),
             "brake_pct_moving": r1((dm.ldcu_brkpedalst > 0).mean() * 100, 0),
             "brake_p99_ms2": r1(-drv.acc.quantile(.01), 2), "accel_p99_ms2": r1(drv.acc.quantile(.99), 2),
             "cluster_check": cl, "trips": feats}
    # 4. weekday vs weekend (days from START with data)
    dd = [r for r in daily if r["date"] >= s0 and r["has_data"]]
    tw = [t_ for t_ in trips if t_["date"] >= s0]
    hours = {}
    for x_ in [drv]:
        x_ = x_.assign(we=x_.t.dt.dayofweek >= 5, h=x_.t.dt.hour)
        for (we, h), g in x_.groupby(["we", "h"]): hours[(bool(we), int(h))] = float(g.dt.sum() / 60)
    part = {}
    for name, we in [("weekday", False), ("weekend", True)]:
        days_ = [r for r in dd if (pd.Timestamp(r["date"]).dayofweek >= 5) == we]; n = len(days_)
        if not n: continue
        trs = [t_ for t_ in tw if (pd.Timestamp(t_["date"]).dayofweek >= 5) == we]
        mv_km = sum(t_["km"] for t_ in trs); mv_h = sum(t_["km"] / t_["moving_avg_kmh"] for t_ in trs if t_["moving_avg_kmh"])
        e_ = sum(r["kwh_driving"] or 0 for r in days_); kmi = sum(r["km_speed_integrated"] or 0 for r in days_)
        prof = [r1(hours.get((we, h), 0) / n, 1) for h in range(24)]
        top = sorted(range(24), key=lambda h: -prof[h])[:2]
        part[name] = {"days": n, "km_per_day": r1(sum(r["km"] or 0 for r in days_) / n, 1), "trips_per_day": r1(len(trs) / n, 1),
                      "min_per_day": r1(sum(r["drive_min"] or 0 for r in days_) / n, 0), "moving_kmh": r1(mv_km / mv_h if mv_h else None, 1),
                      "kwh_per_100km": r1(e_ / kmi * 100 if kmi else None, 1), "peak_hours": sorted(top), "min_by_hour_per_day": prof}
    effs = [v for hrs in eff_dh.values() for v in hrs if v is not None]
    return {"rests": rests, "rest_summary": rest_summary, "tyres_daily_bar": tyres, "driving_style": style, "weekday_weekend": part,
            "tyres_cold": cold, "tyres_hot_latest": hot_latest, "tyre_placard_bar": TYRE_PLACARD_BAR,
            "eff_by_date_hour": eff_dh, "eff_by_date": eff_day,
            # soft scale centred on the overall driving average: green < 0.9 x avg <= amber < 1.15 x avg <= red
            "eff_bins": {"avg": eff_avg, "green_below": r1(eff_avg * 0.9, 1) if eff_avg else None, "red_from": r1(eff_avg * 1.15, 1) if eff_avg else None,
                         "min_km": EFF_MIN_KM, "cells": len(effs)}}

def soc_series(d):
    w = d[d.t >= START].set_index("t")
    r = w[["soc", "ldcu_dstbatdisp_dynamic", "ldcu_chrgpwr", "spd"]].resample("5min").agg(
        {"soc": "last", "ldcu_dstbatdisp_dynamic": "last", "ldcu_chrgpwr": "mean", "spd": "max"}).dropna(subset=["soc"])
    return [[ts.strftime("%m-%dT%H:%M"), int(v.soc), r1(v.ldcu_dstbatdisp_dynamic, 0),
             "c" if (v.ldcu_chrgpwr or 0) > 0.3 else ("d" if v.spd > 0 else "p")] for ts, v in r.iterrows()]

def update_readings(d, charges):
    rs = json.load(open(READINGS)) if READINGS.exists() else []
    key = lambda r: (r.get("source"), r.get("event"), r.get("time"))
    have = {key(r) for r in rs}
    days = pd.date_range(d.t.min().normalize(), d.t.max().normalize(), freq="D"); prev = None; new = []
    for day in days:
        x = d[(d.t >= day) & (d.t < day + pd.Timedelta(days=1))]
        eod = float(x.odo.dropna().iloc[-1]) if x.odo.notna().any() else prev
        sod = prev if prev is not None else (float(x.odo.dropna().iloc[0]) if x.odo.notna().any() else None)
        socl = x.soc.dropna(); rl = x.ldcu_dstbatdisp_dynamic.dropna()
        for ev, ts, odo, soc, rng in [("odometer_sod", day, sod, (socl.iloc[0] if len(socl) else None), None),
                                      ("odometer_eod", min(day + pd.Timedelta(hours=23, minutes=59, seconds=59), d.t.max()), eod,
                                       (socl.iloc[-1] if len(socl) else None), (rl.iloc[-1] if len(rl) else None))]:
            if odo is None: continue
            r = {"source": "XPENG Data Act export", "event": ev, "time": iso(ts), "odometer_km": int(odo)}
            if soc is not None: r["soc_pct"] = int(soc)
            if rng is not None: r["range_km_display"] = int(rng)
            if not len(x): r["note"] = "no data this day (car asleep); odometer carried forward"
            new.append(r)
        prev = eod
    for c in charges:
        for ev, ts, soc in [("xp_charge_start", c["start"], c["soc_start"]), ("xp_charge_end", c["end"], c["soc_end"])]:
            new.append({"source": "XPENG Data Act export", "event": ev, "time": ts, "soc_pct": soc, "type": c["type"],
                        "odometer_km": int(c["odometer_km"]) if c["odometer_km"] is not None else None})
    # replace previous export-derived rows with same key (values may change if a later export fills gaps)
    newkeys = {key(r) for r in new}
    rs = [r for r in rs if key(r) not in newkeys] + new
    rs.sort(key=lambda r: r["time"])
    json.dump(rs, open(READINGS, "w"), indent=1, ensure_ascii=False, default=_np)
    return len(new)

def main(paths):
    df = load_store(paths)
    d = clean(df)
    d, charges, trips, daily, ha, hb = derive(d)
    kpis, insights, speed, tod, kmdh = summarise(d, charges, trips, daily, ha, hb)
    s = START.strftime("%Y-%m-%d")
    out = {
        "generated": dt.datetime.now().astimezone().isoformat(timespec="minutes"),
        "source": "XPENG Data Act export (1 Hz while awake), merged store xpeng-export/merged_1hz.csv.gz; no GPS in export",
        "timezone": "Asia/Singapore (+08:00)", "kpis": kpis, "insights": insights,
        "daily": [r for r in daily if r["date"] >= s], "trips": [r for r in trips if r["date"] >= s],
        "charges": [c for c in charges if c["start"] >= s], "charges_before_start": [c for c in charges if c["start"] < s],
        "speed_bins": speed, "tod_heatmap": {"rows": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], "cols": "hour 0-23", "unit": "driving minutes", "data": tod},
        "km_by_date_hour": kmdh,
        **extras(d, trips, daily, ha, hb),
        "soc_series": {"cols": ["MM-DDTHH:MM (SGT)", "soc_pct", "range_km_display", "state c=charging d=driving p=parked awake"],
                       "step": "5 min, awake periods only (car asleep = no rows)", "data": soc_series(d)},
    }
    json.dump(out, open(OUT, "w"), separators=(",", ":"), ensure_ascii=False, default=_np)
    n = update_readings(d, charges)
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB); car_readings +{n} export rows (upserted)")
    print(json.dumps({"kpis": kpis, "insights": insights}, indent=1, ensure_ascii=False, default=_np))

if __name__ == "__main__":
    main(sys.argv[1:])
