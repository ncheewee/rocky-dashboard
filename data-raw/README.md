# data-raw/ (local only, gitignored)

Working directory for the data pipeline. Nothing here except this README is committed.
Point the scripts at another folder with `ROCKY_DATA_DIR=/path/to/dir`.

Expected files (all private, never commit or upload):

| File | What | Written by |
|---|---|---|
| `exports/DA*.zip` | XPENG Data Act export (driving_* CSVs, 1 Hz) | downloaded by hand / Mechanic |
| `xpeng-export/merged_1hz.csv.gz` | merged 1 Hz store of all exports | `parse_xpeng_export.py` |
| `xpeng_derived.json` | trips, charges, SOC series, KPIs | `parse_xpeng_export.py` |
| `car_readings.json` | XPENG app readings (range, SOC, odometer) | `parse_xpeng_export.py` + manual |
| `sessions.json` | charging sessions from MNL receipts (`location` = development name only, never street/unit) | Mechanic (receipt check) |
| `car_settings.json` | settings confirmed by the owner (charge limit) | manual |
| `receipts/*.pdf` | MNL receipt PDFs (`parse_mnl_receipt.py` copies the Location's development name into `sessions.json` `site`) | Mechanic |
| `dashboard_data.json` | intermediate chart data | `build_dashboard_data.py` |
