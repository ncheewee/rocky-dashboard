import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./Dashboard";
import { ThemeProvider, themeFor, type ThemeKind } from "./kit";
import "./index.css";

const KEY = "rocky-theme";
const systemDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
const stored = (): ThemeKind | null => {
  try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : null; } catch { return null; }
};

// Light/dark follows the system until the reader picks one with the toggle (bottom-right); the pick is remembered.
function App() {
  const [chosen, setChosen] = useState<ThemeKind | null>(stored);
  const [sys, setSys] = useState<ThemeKind>(systemDark() ? "dark" : "light");
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const f = () => setSys(mq.matches ? "dark" : "light");
    mq?.addEventListener("change", f);
    return () => mq?.removeEventListener("change", f);
  }, []);
  const kind = chosen ?? sys;
  useEffect(() => { document.documentElement.dataset.theme = kind; document.documentElement.style.colorScheme = kind; }, [kind]);
  const t = themeFor(kind);
  const next: ThemeKind = kind === "dark" ? "light" : "dark";
  return (
    <ThemeProvider kind={kind}>
      <Dashboard />
      <button
        type="button"
        className="theme-toggle"
        aria-label={`Switch to ${next} theme`}
        title={`Switch to ${next} theme`}
        style={{ ["--tt-bg" as string]: t.bg.elevated, ["--tt-fg" as string]: t.text.primary, ["--tt-border" as string]: t.border.default }}
        onClick={() => { setChosen(next); try { localStorage.setItem(KEY, next); } catch { /* private mode */ } }}
      >
        {kind === "dark" ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M10.75 8a2.75 2.75 0 1 1-5.5 0 2.75 2.75 0 0 1 5.5 0ZM8 1.75v1.5M8 12.75v1.5M3.58 3.58l1.06 1.06M11.36 11.36l1.06 1.06M1.75 8h1.5M12.75 8h1.5M3.58 12.42l1.06-1.06M11.36 4.64l1.06-1.06" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85Z" /></svg>
        )}
      </button>
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
