# Design spec

This repo and https://ncheewee.github.io/rocky-dashboard/ are the reference for the look. Keep changes consistent with what is there.

## Hard rules

1. **Mobile-first at 412 px** (CSS px). Phones/tablets (< 1024 px) = single column. Desktop = ≥ 1024 px.
2. **Type:** nothing under 13 px. Chart axis labels 14 px. Section headings 24/30 px, weight 600, letter-spacing −0.25 px.
   Body 13 px, line-height 1.385. System font stack.
3. **No prose.** Labels, numbers, short chips and legends only. No explanatory paragraphs, no in-page title.
4. **Light + dark, both high-contrast.** Colours come from `useGrokTheme()` tokens (`theme.text.*`, `theme.bg.*`,
   `theme.border.*`, `theme.dataviz.*`). Hard-coded hex is fine only for the semantic palettes below.
5. **No horizontal scroll, no scroll frames.** Pill rows `flex-wrap`. Grids use `minmax(0, 1fr)`. Check `scrollWidth`
   equals the viewport (desktop shows 1910 at 1920 because of the stable scrollbar gutter; that is expected).
6. **Tiles / cards:** 2 px border in the accent colour on all four sides + accent `14` (8%) tint. No left-edge-only accents.
7. **Never invent data.** Estimates are labelled (`est.`, `≈`, dashed bars). Missing data shows `–` or a dashed pill.
8. **No GPS/location.**
9. Data starts 11 Nov 2026 (`START_DATE`). Monday refresh shows data through the Sunday before (`TODAY`).

## Layout

Frame: body padding 16 px (< 600 px) or 24 px 32 px; `#root` max 72rem centred (desktop overrides to full width).
Sections are 64 px apart (mobile), heading → body 16 px.

**Mobile order:** tiles (2 per row) · Distance, energy and cost · Driving Heatmap · Battery charge over time ·
Charging sessions (swipe cards) · Battery health vs warranty · Daily distance · Resting with aircon · Tyre pressure ·
Driving style · Efficiency by speed · Trips · Driving and car stats · Insights.

**Desktop (≥ 1024 px):**
- Tiles in one 8×1 row.
- 2×2 framed grid (1 px `border.default`, radius 14): Distance/energy/cost · Battery charge | Battery health · Driving style.
  Tiles + the 2×2 must fit the first window at 1920×950 (chart heights are computed from the window height).
- Below, rows of two equal columns: Heatmap | (Daily distance + Efficiency by speed) · Charging sessions (grid) ·
  Resting | Trips · Tyres | Stats · Insights.

## Charts and semantics

- **Battery charge over time:** Y 0–108%. Legend Charging / Driving / Parked (awake) / Asleep (no data, faint dotted).
  Weekends tinted purple (`#6C3FA0` light ink / `#C9A7F5` dark).
- **Battery health:** measured capacity ÷ rated 71.2 kWh = 100%. Uncertainty ribbon from whole-% SOC (±1 pt).
  Warranty: 70% at 8 yr / 160,000 km, 62% at 10 yr / 200,000 km (extended); red zone below 62%. Views: 10 years / First 3 months.
- **Distance, energy and cost:** Daily / Weekly / Monthly pills; km + kWh bars (dashed = pending estimate); S$ smooth
  monotone curve with per-point labels. Pan/pinch/zoom gestures; never scrolls the page sideways.
- **Driving Heatmap:** one Mon–Sun week, swipe or ‹ ›; drives as blocks at exact times; Efficiency / Distance / Minutes.
- **Tyres (cold, bar):** green ≥ 2.6 · amber 2.5–2.59 · red < 2.5. Placard 2.6 cold. Keep `src/assets/car-topdown-3x.png`.
- **Efficiency colours (kWh/100 km):** green better than average, amber around average, red higher; grey < 1 km.

## Theme tokens

Defined in `src/kit.tsx` (`grokPaletteLight` / `grokPaletteDark`), the source of truth for colours:
light bg `#fcfcfc`, text `#141414`; dark bg `#070707`, text `#fcfcfc`; secondary/tertiary text = primary at 60%/40%. Read the file; don't copy values elsewhere.

### Deliberate colour choices

These look like oversights but are intentional:
active pill = page background + primary text + default border (not a filled dark pill); heatmap weekday date chips =
page background with primary text (weekends stay `#6C3FA0`); the heatmap separator under the totals is invisible;
the "0" calendar legend swatch uses `bg.subtle`. Change these deliberately, not by accident.

## Verify before a UI PR

`npm run build && npm run preview` (http://localhost:4173/rocky-dashboard/), then check at 412×915 (light + dark, full page) and 1920×950 (light + dark):
no horizontal scroll, min font ≥ 13 px, the four framed charts fully visible in the first window at 1920×950.
