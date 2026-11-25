#!/usr/bin/env python3
"""Extract the charging site (development name only) from EV Charge By MNL receipt PDFs into sessions.json.

The receipt's "Location" line reads e.g. "Singapore, Nuovo (Restricted)". We keep only the development name
("Nuovo"): drop the "Singapore," prefix and any (...) access tag. Anything that still looks like an address
(digits, street words, "#" unit, postal code) is rejected and left unset - never guess.
Never store street, unit, postal code, GPS, VIN or receipt numbers. Do not take locations from Charge+ /
Mapletree portals or from XPENG exports; only the MNL receipt's Location field.

Usage (inputs in $ROCKY_DATA_DIR, default ./data-raw; private, never committed):
  python3 scripts/parse_mnl_receipt.py                  # dry run over receipts/*.pdf
  python3 scripts/parse_mnl_receipt.py --apply          # write site + location into sessions.json
  python3 scripts/parse_mnl_receipt.py PDF... --apply   # specific receipts
Matches receipts to sessions by the receipt's Session ID (= sessions.json session_id, operator MNL).
Needs pdftotext (poppler-utils).
"""
import json, os, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = Path(os.environ.get("ROCKY_DATA_DIR") or ROOT / "data-raw")
STREET = re.compile(r"\b(road|rd|street|st|avenue|ave|drive|dr|lane|ln|jalan|lorong|lor|crescent|cres|walk|way|close|place|pl|link|terrace|blk|block|unit|level|carpark)\b", re.I)


def clean_site(raw):
    """'Singapore, Nuovo (Restricted)' -> 'Nuovo'. Returns None if it is not a plain development name."""
    if not raw: return None
    s = re.sub(r"\([^)]*\)", "", raw)                       # access tags like (Restricted)
    parts = [p.strip() for p in s.split(",") if p.strip()]
    parts = [p for p in parts if p.lower() not in ("singapore", "sg")]
    if len(parts) != 1: return None                        # more than one part = address-like
    s = re.sub(r"\s+", " ", parts[0]).strip()
    if not s or len(s) > 40 or re.search(r"\d|#", s) or STREET.search(s): return None
    return s


def read_receipt(pdf):
    txt = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    loc = re.search(r"^\s*Location\s{2,}(.+?)\s*$", txt, re.M)
    sid = re.search(r"^\s*Session ID\s{2,}(\d+)\s*$", txt, re.M)
    return (sid.group(1) if sid else None), clean_site(loc.group(1) if loc else None)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    apply = "--apply" in sys.argv
    pdfs = [Path(a) for a in args] or sorted((D / "receipts").glob("*.pdf"))
    sp = D / "sessions.json"
    sessions = json.load(open(sp))
    by_sid = {str(s.get("session_id")): s for s in sessions if "MNL" in (s.get("operator") or "")}
    changed = 0
    for pdf in pdfs:
        sid, site = read_receipt(pdf)
        s = by_sid.get(str(sid))
        if not s:
            print(f"{pdf.name}: session not in sessions.json (add the session first)"); continue
        if not site:
            print(f"{s['id']}: Location missing or not a plain development name - left unset"); continue
        if s.get("site") != site or s.get("location") != site:
            changed += 1
        print(f"{s['id']}: site = {site}")
        if apply: s["site"] = site; s["location"] = site
    if apply and changed:
        json.dump(sessions, open(sp, "w"), indent=2, ensure_ascii=False); open(sp, "a").write("\n")
    print(f"{'wrote' if apply and changed else 'would update' if changed else 'no change'}: {changed} session(s)")


if __name__ == "__main__":
    main()
