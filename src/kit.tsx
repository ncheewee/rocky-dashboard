// Local stand-in for the Grok Bot canvas kit ("grok/canvas") that the dashboard was first built on.
// Only what Dashboard.tsx uses: theme tokens (same values as the kit), Page, Section, Image, and the React hooks.
// Keep token values in sync with docs/DESIGN.md; change the look here, not with one-off colours in components.
import { createContext, useContext, type ReactNode, Children } from "react";
export { useState, useEffect, useRef, useMemo, useCallback } from "react";

export type ThemeKind = "light" | "dark";

const palettes = {
  light: {
    bg: { base: "#fcfcfc", subtle: "#f7f7f7", elevated: "#fcfcfc" },
    text: { primary: "#141414", secondary: "#14141499", tertiary: "#14141466", onColor: "#fcfcfc" },
    border: { subtle: "#1414140d", weak: "#1414141a", default: "#14141426", strong: "#1414144d", focus: "#14141466" },
    fill: { primary: "#070707", secondary: "#77777717", hover: "#1414140f" },
    dataviz: { categorical: ["#1084FE", "#FF9800", "#00BCA6"], other: "#777777", negative: "#FF263C", singleSeriesRest: "#80BEFE", areaAlpha: "29", bandAlpha: "40" },
  },
  dark: {
    bg: { base: "#070707", subtle: "#111111", elevated: "#181818" },
    text: { primary: "#fcfcfc", secondary: "#fcfcfc99", tertiary: "#fcfcfc66", onColor: "#fcfcfc" },
    border: { subtle: "#fcfcfc0d", weak: "#fcfcfc1a", default: "#fcfcfc26", strong: "#fcfcfc4d", focus: "#fcfcfc66" },
    fill: { primary: "#fafafa", secondary: "#7777772c", hover: "#fcfcfc14" },
    dataviz: { categorical: ["#1084FE", "#FF9800", "#00BCA6"], other: "#777777", negative: "#FF263C", singleSeriesRest: "#084382", areaAlpha: "3D", bandAlpha: "40" },
  },
} as const;

export const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", sans-serif';

export type GrokTheme = (typeof palettes)[ThemeKind] & { kind: ThemeKind; font: { family: string } };

export function themeFor(kind: ThemeKind): GrokTheme {
  return { ...palettes[kind], kind, font: { family: FONT_FAMILY } } as GrokTheme;
}

const ThemeContext = createContext<GrokTheme>(themeFor("light"));
export function ThemeProvider({ kind, children }: { kind: ThemeKind; children?: ReactNode }) {
  return <ThemeContext.Provider value={themeFor(kind)}>{children}</ThemeContext.Provider>;
}
export function useGrokTheme(): GrokTheme {
  return useContext(ThemeContext);
}

// Page: the kit's page column. "wide" = up to 1280 px centred, "full" = the whole frame.
// No visible title (removed by request, 24 Nov 2026); `title` only names the document.
// Top-level blocks are spaced like the kit: the first block flush, a Section 64 px under the block above.
export function Page({ title, width = "wide", children }: { title: string; width?: "wide" | "full"; children?: ReactNode }) {
  const theme = useGrokTheme();
  const blocks = Children.toArray(children);
  return (
    <div aria-label={title} style={{ ...(width === "full" ? { width: "100%" } : { maxWidth: 1280, margin: "0 auto" }), fontFamily: theme.font.family, color: theme.text.primary, overflowWrap: "anywhere" }}>
      {blocks.map((b, i) => <div key={i} style={{ marginTop: i === 0 ? 0 : 64 }}>{b}</div>)}
    </div>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Section: a 24/30 semibold heading, the body 16 px under it.
// `fill` (desktop windows only) stretches the section to its cell so a chart can use the leftover height.
export function Section({ heading, children, fill = false }: { heading?: string; children?: ReactNode; fill?: boolean }) {
  const theme = useGrokTheme();
  return (
    <section id={heading ? slug(heading) : undefined} style={fill ? { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 } : undefined}>
      {heading && <h2 dir="auto" style={{ margin: 0, flex: "none", fontFamily: theme.font.family, fontSize: 24, lineHeight: "30px", letterSpacing: "-0.25px", fontWeight: 600, color: theme.text.primary }}>{heading}</h2>}
      <div style={{ marginTop: heading ? 16 : 0, ...(fill ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" } : {}) }}>{children}</div>
    </section>
  );
}

// Image: a rounded figure that holds the picture's ratio before it loads.
export function Image({ src, alt, ratio, width = "100%" }: { src: string; alt: string; ratio?: string; width?: number | string; fit?: "contain" | "cover" }) {
  return (
    <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8, width, maxWidth: "100%" }}>
      <div style={{ position: "relative", boxSizing: "border-box", width: "100%", maxWidth: "100%", overflow: "hidden", borderRadius: 8, aspectRatio: ratio }}>
        <img alt={alt} src={src} width={870} height={1596} style={{ display: "block", width: "100%", maxWidth: "100%", height: "100%", objectFit: "contain", position: "relative" }} />
      </div>
    </figure>
  );
}
