# Design spec

This repo and https://ncheewee.github.io/rocky-dashboard/ are the reference for the look. Keep changes consistent with what is there.

## Hard rules

1. **Mobile-first at 412 px** (CSS px). Phones/tablets (< 1024 px) = single column. Desktop = ≥ 1024 px.
2. **Type:** nothing under 13 px. Chart axis labels 14 px. Section headings 24/30 px, weight 600, letter-spacing −0.25 px.
   Body 13 px, line-height 1.385. System font stack.
3. **No prose.** Labels, numbers, short chips and legends only. No explanatory paragraphs, no in-page title.
4. **Light + dark, both high-contrast.** Colours come from `useGrokTheme()` tokens (`theme.text.*`, `theme.bg.*`,
   `theme.border.*`, `theme.dataviz.*`). Hard-coded hex is fine only for the semantic palettes below.
5. **No inner vertical scroll.** Desktop windows clip to the viewport (`overflow: hidden`); nothing inside a window
   scrolls up/down. Charging sessions may swipe left/right. Pill rows `flex-wrap`. Grids use `minmax(0, 1fr)`.
   Check `scrollWidth` equals the viewport (desktop shows 1910 at 1920 because of the stable scrollbar gutter).
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

**Desktop (≥ 1024 px):** five full-viewport windows that snap (`scroll-snap-type: y mandatory`, `scroll-snap-stop: always`). The reader cannot rest between windows. Phone layout is unchanged. Every segment uses the same 1 px framed card as the window-1 charts.
- Window 1: “Updated as of” top left, light/dark toggle top right; 8 tiles in one row; four equal framed charts filling the rest (Distance/energy/cost · Battery charge | Battery health · Driving style). Chart SVG height is the leftover flex space so x-axes stay visible. Filter chips sit top-right of the heading, above the legend. Daily cost labels stay horizontal above the dot. Hovering a distance/cost, battery-health, or driving-style point shows a short detail chip. Battery-charge legend is a 2-column block on the heading row (not over the line). Battery health has no in-panel legend (view chips only); desktop defaults to First 3 months, with that chip to the left of 10 years; the current-health chip stays fully inside the plot. Driving style: scatter left 60% with short axis labels only (m/s² and % ticks); four figures in a 2×2 on the right 40%, inset from the card edges, short labels so all three lines stay visible.
- Window 2: heatmap left 40% (fits the pane, no up/down scroll, week swipe is left/right); Efficiency / Distance / Minutes chips sit on the heading row so the hour axis can grow. Hovering a drive block shows a short detail chip. Right 60% split into Daily distance (top) and Efficiency by speed (bottom). Daily-distance day number is muted; km is larger and heavier, same row at the top of the cell. Speed bands (desktop): one row per range — label inside the bar, kWh/100 km on each row, then % of km / % of min to the right.
- Window 3: charging sessions 50% left (swipe cards stretch to the pane height, neighbours peek; kW axis on the right of the profile; stats block centred with equal inset) · tyre pressure 50% right (legend centred under the car; no placard line; per-corner cold-bar sparkline outside the numbers, with a date x-axis). No mini-map of charge location — sessions have no GPS (hard rule 8).
- Window 4: Resting with aircon | Trips, equal columns, no inner scroll. Resting filters: Latest 10 / Longest 10; the five rest numbers stay on one row. Trips: Longest 10 / Latest 10 on the heading row; kWh/100 km sits after each row’s efficiency number (no heading colour legend).
- Window 5: “Other Highlights” (the driving/car stats) in one row, then Insights filling the rest of the window.

## Charts and semantics

- **Battery charge over time:** Y 0–108%. Legend Charging / Driving / Parked (awake) / Asleep (no data, faint dotted).
  Weekends tinted purple (`#6C3FA0` light ink / `#C9A7F5` dark). Desktop: 2-column legend on the heading row, not over the plot.
- **Battery health:** measured capacity ÷ rated 71.2 kWh = 100%. Uncertainty ribbon from whole-% SOC (±1 pt).
  Warranty: 70% at 8 yr / 160,000 km, 62% at 10 yr / 200,000 km (extended); red zone below 62%. Views: 10 years / First 3 months.
  Desktop: First 3 months chip left of 10 years and selected by default; no in-panel legend. The current-health chip stays fully inside the plot. Hover a reading for date, kWh, % of new and the ±1 pt band.
- **Distance, energy and cost:** Daily / Weekly / Monthly pills top-right of the heading, above the km / kWh / S$ legend (desktop); km + kWh bars (dashed = pending estimate); S$ smooth
  monotone curve with per-point labels (daily labels horizontal above the dot). Desktop hover on a day/week/month shows km, kWh and S$. Pan/pinch/zoom gestures; never scrolls the page sideways.
- **Driving Heatmap:** one Mon–Sun week, swipe or ‹ ›; drives as blocks at exact times; Efficiency / Distance / Minutes. Desktop hover on a block shows time, km, minutes and kWh/100 km.
- **Tyres (cold, bar):** green ≥ 2.6 · amber 2.5–2.59 · red < 2.5. Desktop: colour legend centred under the car, no placard line; sparkline of cold-bar history outside each corner’s numbers, with a date x-axis. Phone still shows placard 2.6 cold. Keep `src/assets/car-topdown-3x.png`.
- **Charging sessions:** power profile 0–8 kW. Desktop: kW ticks on the right of the profile; two-column stats centred with equal inset. No location map (no GPS in the data).
- **Trips chips:** coloured efficiency number; desktop writes kWh/100 km after each number. Phone still has the “Coloured chip” footnote.
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
no horizontal scroll, min font ≥ 13 px, five snap windows on desktop (wheel/trackpad lands on a window, not between them), phone still a single scrolling column.
