# AGENTS.md — rules for AI agents (Grok Build, Mechanic) and humans

Rocky is Chee Wee's XPENG L03 (SG, RWD Long Range Plus, 71.2 kWh LFP). This repo is a static,
single-page dashboard of its driving, charging, battery health and tyres, data from 11 Nov 2026.
It is a Vite + React + TypeScript app with no backend; all data is one JSON file built by the pipeline.

- **Live site:** https://ncheewee.github.io/rocky-dashboard/ — GitHub Pages, deployed by `.github/workflows/pages.yml`
  on every push to `main` (so a merged PR or a Mechanic data commit goes live in ~1 min).
- **Single source:** this repo is the only dashboard; all UI work happens here (no other copy to keep in sync).
- **This repo is PUBLIC.** Never commit secrets, tokens, credentials, emails, raw exports, receipts or any personal
  raw data — not even temporarily (git history is public too).

Two agents work here. **Read the Ownership section before you change anything.**

## Run / build

```bash
npm ci               # Node 22+ (CI uses 22)
npm run dev          # http://localhost:5173
npm run typecheck    # tsc, no emit
npm run build        # -> dist/ (static, relative paths; open from any sub-path)
npm run preview      # serve dist/ on http://localhost:4173/rocky-dashboard/
npm run check:data   # sanity check src/data/dashboard.json against the contract
```

Data refresh (Mechanic only, needs the private raw files in `data-raw/`, see `data-raw/README.md`):

```bash
pip install -r scripts/requirements.txt
python3 scripts/parse_xpeng_export.py          # new XPENG export zip(s) -> merged 1 Hz store + xpeng_derived.json
python3 scripts/build_dashboard_data.py        # sessions + readings + derived -> dashboard_data.json
python3 scripts/build_ui_data.py --today 2026-11-29 --updated "30 Nov 2026"   # -> src/data/dashboard.json
```

## File map

| Path | What | Owner |
|---|---|---|
| `src/Dashboard.tsx` | the whole UI: tiles, 13 sections, mobile + desktop layouts | shared, via PR |
| `src/kit.tsx` | theme tokens (light/dark), Page, Section, Image | shared, via PR |
| `src/main.tsx` | entry, theme state (system + toggle, localStorage `rocky-theme`) | shared, via PR |
| `src/index.css` | frame CSS (padding, 72rem root, toggle button) | shared, via PR |
| `src/data/types.ts` | **data contract** (TypeScript types of the JSON) | shared, via PR |
| `src/data/dashboard.json` | generated data, the only data the UI reads | **Mechanic** |
| `src/assets/car-topdown-3x.png` | tyre panel car image (keep) | shared |
| `scripts/*.py` | data pipeline | **Mechanic** |
| `scripts/check_data.mjs` | contract sanity check run in CI | shared |
| `data-raw/` | private raw inputs, gitignored (only its README is tracked) | Mechanic, local only |
| `docs/DESIGN.md` | UI rules and layout spec — read before UI work | shared |
| `CHANGELOG.md` | one entry per change | everyone |
| `.github/workflows/ci.yml` | typecheck + build + data check on PRs and pushes | shared |
| `.github/workflows/pages.yml` | build + deploy to GitHub Pages on push to `main` | shared |
| `vite.config.ts` | `base: "/rocky-dashboard/"` (Pages sub-path) — don't change without updating hosting | shared |

## Ownership and collaboration (avoid conflicts)

- **Mechanic** = the Grok Bot agent that runs the weekly refresh (Mondays 08:00 SGT, data through the
  Sunday before) and the daily MNL charging-receipt check. It owns `src/data/dashboard.json` and `scripts/`.
  - The Monday refresh regenerates `src/data/dashboard.json` and pushes a data commit, which redeploys the site.
    This repo / site is the single source; there is no other copy of the dashboard.
  - It may push **data-only commits straight to `main`** (only `src/data/dashboard.json`, plus `CHANGELOG.md`),
    message `data: refresh through YYYY-MM-DD`.
  - Pipeline changes (`scripts/`) go through a PR like any other code change.
- **Grok Build** (and any other agent or human) works on the UI. Do **not** hand-edit `src/data/dashboard.json`
  or `scripts/`; ask for the change in the PR description or an issue instead.
- **All UI / code changes go through a feature branch + PR**, never directly on `main`:
  `grok/<topic>` for Grok Build, `mechanic/<topic>` for Mechanic. CI must pass before merge.
- **Never force-push `main`.** No history rewrites on shared branches.
- **Pull / rebase before you start** (`git pull --rebase origin main`) and again before you push.
- Small, focused commits. **Don't reformat or reorder files you didn't otherwise change** (no repo-wide prettier runs);
  `src/Dashboard.tsx` is long and dense on purpose, keep diffs minimal.
- **Schema changes:** keep `dashboard.json` backward compatible (add keys; don't rename or remove). If a breaking
  change is unavoidable, bump `schemaVersion` and update `scripts/build_ui_data.py`, `src/data/types.ts`,
  `scripts/check_data.mjs` and the UI **in the same PR**.
- Add a line to `CHANGELOG.md` (top, under the date) for every change, data refreshes included.
- If both agents need the same file, the one that lands second rebases and resolves; never overwrite the other's work.

## Design rules (summary — full spec in docs/DESIGN.md)

- Mobile-first, designed at 412 px wide. Desktop layout at ≥ 1024 px.
- Text ≥ 13 px everywhere; chart axis labels 14 px. No prose paragraphs: labels, numbers, short chips.
- Light and dark must both be high-contrast; use theme tokens from `useGrokTheme()`, not one-off greys.
- No horizontal scrolling and no inner scroll frames; pill rows wrap.
- Tiles have a border on all four sides. Desktop (≥ 1024 px): five full-viewport snap windows (see docs/DESIGN.md).
  Phone layout stays a single column. Do not change the mobile view when editing desktop windows.
- No page title inside the page.
- Battery chart Y max 108%. Battery health = measured capacity ÷ rated 71.2 kWh (100%).
  Warranty markers: 70% at 8 yr / 160,000 km, 62% at 10 yr / 200,000 km (extended).
- Tyre colours (cold): green ≥ 2.6 bar, amber 2.5–2.59, red < 2.5. Keep the car PNG.
- **Never invent data.** Anything estimated must be labelled as an estimate in the UI (`est.`).
- No GPS / location data anywhere.

## Data contract

- File: `src/data/dashboard.json`, typed by `src/data/types.ts` (`DashboardData`), `schemaVersion: 1`.
- Keys are UPPER_CASE (historical naming): `UPDATED`, `TODAY`, `DAILY`, `WEEKLY`, `MONTHLY`,
  `SOH`, `CHARGES`, `TILES`, `STATS`, `DRIVES`, … — see `types.ts` for all of them and their shapes.
- `TODAY` = last day shown (Monday refresh → the Sunday before). `DAILY` never contains days after `TODAY`.
- Estimated values carry an explicit flag/label (`kwhEst`, `costEst`, `est.` in strings). Keep that.
- The UI imports the JSON at build time, so a data refresh means a rebuild/redeploy (automatic on push to `main`).

## Privacy (hard rules — the repo is public)

- Never commit or upload raw personal data: XPENG export zips/CSVs, `merged_1hz.csv.gz`, receipt PDFs,
  `sessions.json` / `car_readings.json` / `xpeng_derived.json` / `dashboard_data.json`, emails, credentials, tokens.
  `.gitignore` covers them; check `git status` and `git diff --cached` before every commit.
- Commit as `Chee Wee Ng <269198623+ncheewee@users.noreply.github.com>` (no personal email in public history).
- No home address / charger site names, receipt numbers, card digits or account IDs in code, comments, data or commit messages.
- Only processed aggregates go into `src/data/dashboard.json`. No VIN, no GPS, no account details.
