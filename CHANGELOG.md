# Changelog

Newest first. One line per change: `- [agent] what changed (PR #/commit)`. Agents: `mechanic`, `grok`, `human`.

## 2026-11-24
- [mechanic] Docs: the GitHub Pages site is the single dashboard (canvas Page retired); Monday refresh updates only this repo.
- [mechanic] Repo made public; GitHub Pages deploy workflow (`pages.yml`), Vite base `/rocky-dashboard/`.
  Live at https://ncheewee.github.io/rocky-dashboard/. Docs: public-repo rules, Monday refresh updates repo + canvas Page.

## 2026-11-23
- [mechanic] Initial port of the Grok Bot Page "Rocky · L03 Dashboard" to a standalone Vite + React + TS app.
  Data moved to `src/data/dashboard.json` (schema 1, data through 22 Nov 2026), pipeline in `scripts/`,
  system/toggle light-dark theme, CI (typecheck, build, data check), AGENTS.md / DESIGN.md.
