import { useState, useEffect } from "react";
import { Shell } from "./Shell.jsx";

// ============ LOADING SCREEN ============
export const QUIPS = [
  "Chalking up…", "Loading the plates…", "Un-racking the bar…", "Warming up the rotator cuffs…",
  "Finding a free bench…", "Filling the water bottle…", "Queuing the hype playlist…",
  "Tightening the lifting belt…", "Counting: one more rep…", "Wiping down the machine…",
];
export function LoadingScreen({ label, theme = "dark" }) {
  const [i, setI] = useState(() => Math.floor(Math.random() * QUIPS.length));
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % QUIPS.length), 1500);
    return () => clearInterval(t);
  }, []);
  return (
    <Shell theme={theme}>
      <div className="wt-loadscreen" role="status" aria-live="polite">
        <div className="wt-barbell" aria-hidden="true">
          <span className="wt-bb-plate p2" /><span className="wt-bb-plate p1" />
          <span className="wt-bb-bar" />
          <span className="wt-bb-plate p1" /><span className="wt-bb-plate p2" />
        </div>
        <div className="wt-load-quip">{QUIPS[i]}</div>
        {label && <div className="wt-load-label">{label}</div>}
      </div>
    </Shell>
  );
}
