# Changelog

Newest first. One line per change: `- [agent] what changed (PR #/commit)`. Agents: `mechanic`, `grok`, `human`.

## 2026-11-24
- [grok] Desktop fit: x-axes visible on the four window-1 charts; heatmap/calendar/rest/trips/insights clip to the window (no inner up/down scroll); all segments framed; charging cards stretch; tyre legend centred, placard line dropped; rest filters Latest 10 / Longest 10 with numbers on one row.
- [grok] Desktop only: five snap windows (header + 4 equal charts · heatmap/calendar/speed · charges+tyres · rest+trips · Other Highlights + insights). Phone layout unchanged.
- [mechanic] Docs: the GitHub Pages site is the single dashboard (canvas Page retired); Monday refresh updates only this repo.
- [mechanic] Repo made public; GitHub Pages deploy workflow (`pages.yml`), Vite base `/rocky-dashboard/`.
  Live at https://ncheewee.github.io/rocky-dashboard/. Docs: public-repo rules, Monday refresh updates repo + canvas Page.

## 2026-11-23
- [mechanic] Initial port of the Grok Bot Page "Rocky · L03 Dashboard" to a standalone Vite + React + TS app.
  Data moved to `src/data/dashboard.json` (schema 1, data through 22 Nov 2026), pipeline in `scripts/`,
  system/toggle light-dark theme, CI (typecheck, build, data check), AGENTS.md / DESIGN.md.
