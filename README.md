# Rocky · L03 Dashboard

Personal dashboard for an XPENG L03 (Singapore, RWD Long Range Plus, 71.2 kWh LFP): distance, energy and cost,
driving heatmap, battery charge and health vs warranty, charging sessions, tyres, driving style, trips.
Static Vite + React + TypeScript site; all numbers come from one generated JSON file.

**Live:** https://ncheewee.github.io/rocky-dashboard/ (GitHub Pages, redeployed on every push to `main`).

This repo is **public**: never commit secrets, credentials or raw personal data (see Privacy).

AI agents: read [AGENTS.md](AGENTS.md) first. UI rules: [docs/DESIGN.md](docs/DESIGN.md).

## Run locally

```bash
npm ci
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run preview    # serve dist/ at http://localhost:4173/rocky-dashboard/
```

Light/dark follows the system setting; the round button at the bottom-right toggles it (remembered in this browser).

## Refresh data

The UI only reads `src/data/dashboard.json`. It is generated from private raw files kept in `data-raw/`
(gitignored, see [data-raw/README.md](data-raw/README.md)) or any folder set in `ROCKY_DATA_DIR`.

```bash
pip install -r scripts/requirements.txt
# 1. new XPENG Data Act export: drop the zip into data-raw/exports/, then
python3 scripts/parse_xpeng_export.py
# 2. new charging receipts: add them to data-raw/sessions.json (one object per session; dedupe on operator + session_id)
# 3. derive chart data
python3 scripts/build_dashboard_data.py
# 4. write the UI JSON (Monday refresh: --today = the Sunday before)
python3 scripts/build_ui_data.py --today 2026-11-29 --updated "30 Nov 2026"
npm run check:data && npm run build
```

`build_ui_data.py --check` shows which keys would change without writing.

The Grok Bot "Mechanic" agent does this every Monday 08:00 SGT (data through the Sunday before) and checks for new
charging receipts daily. Each refresh is a data-only commit of `src/data/dashboard.json` to `main`, which redeploys
the live site. See AGENTS.md for how its commits are kept separate from UI work.

## Hosting

GitHub Pages, via `.github/workflows/pages.yml` (build → `actions/upload-pages-artifact` → `actions/deploy-pages`)
on every push to `main` (or run it by hand: Actions → Deploy to GitHub Pages → Run workflow).
Vite `base` is `/rocky-dashboard/`; assets (car PNG, data JSON) are imported from `src/`, so they follow the base.
If the site ever moves to a custom domain or another host at the root, change `base` in `vite.config.ts`.
`.github/workflows/ci.yml` typechecks and builds every PR.

This GitHub Pages site is the only copy of the dashboard; all UI work happens in this repo.
The page sets `noindex`.

## Privacy

The repo and the site are public. Raw exports, the merged 1 Hz log, receipts, emails, credentials and tokens never enter git. Only processed aggregates
(daily km, kWh, cost, per-trip summaries, no GPS, no VIN) are in `src/data/dashboard.json`.
