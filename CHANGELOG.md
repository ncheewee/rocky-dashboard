# Changelog

Newest first. One line per change: `- [agent] what changed (PR #/commit)`. Agents: `mechanic`, `grok`, `human`.

## 2026-11-26
- [grok] Desktop charging cards: MNL receipt site name plus neighbourhood map (no pin). Phone unchanged.

## 2026-11-25
- [mechanic] Data: optional `CHARGES[].site` (charging development name only, e.g. "Nuovo") from MNL receipts via new `scripts/parse_mnl_receipt.py`; `check_data.mjs` rejects address-like values. Schema stays 1.
- [grok] Desktop: drop the distance/cost hover chip; heatmap has no selected-drive line under the week label and no numbers on the blocks (hover still shows the detail).
- [grok] Desktop: hover details on distance, battery-health, driving-style and heatmap points; health defaults to First 3 months; style tiles shortened; calendar km heavier than the date; kWh/100 km on each speed and trip row.
- [grok] Desktop: drop battery-health legend and keep the 104.9% chip inside the plot; driving style is 60% scatter / 40% 2×2 tiles with short axes only; efficiency-by-speed is one row per band (label in the bar, share figures right of kWh).
- [grok] Desktop legends: combo filters above the km/kWh/S$ legend; charge legend 2-col on the heading (off the line); health legend two lines, right-justified; driving-style tiles in a row under the scatter. Heatmap chips on the title row; calendar km at the top of each cell; speed-band label glued to its bar with space between bands.

## 2026-11-24
- [grok] Desktop chrome: window-1 chips on the title row, daily cost labels horizontal, charge/health legends stacked inside the plot, driving-style tiles overlay the scatter; calendar km inset; all six speed bands visible; charging kW axis + centred stats; tyre sparklines with date axis; trips colour/range legend. Phone unchanged.
- [grok] Desktop fit: x-axes visible on the four window-1 charts; heatmap/calendar/rest/trips/insights clip to the window (no inner up/down scroll); all segments framed; charging cards stretch; tyre legend centred, placard line dropped; rest filters Latest 10 / Longest 10 with numbers on one row.
- [grok] Desktop only: five snap windows (header + 4 equal charts · heatmap/calendar/speed · charges+tyres · rest+trips · Other Highlights + insights). Phone layout unchanged.
- [mechanic] Docs: the GitHub Pages site is the single dashboard (canvas Page retired); Monday refresh updates only this repo.
- [mechanic] Repo made public; GitHub Pages deploy workflow (`pages.yml`), Vite base `/rocky-dashboard/`.
  Live at https://ncheewee.github.io/rocky-dashboard/. Docs: public-repo rules, Monday refresh updates repo + canvas Page.

## 2026-11-23
- [mechanic] Initial port of the Grok Bot Page "Rocky · L03 Dashboard" to a standalone Vite + React + TS app.
  Data moved to `src/data/dashboard.json` (schema 1, data through 22 Nov 2026), pipeline in `scripts/`,
  system/toggle light-dark theme, CI (typecheck, build, data check), AGENTS.md / DESIGN.md.
