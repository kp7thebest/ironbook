import { useEffect, useRef, useState } from "react";
import { chime, fmtClock } from "../lib/rest.js";

// Rest timer bar (v13, N1): sits above the bottom nav on every tab while a rest is running.
export function RestTimer({ rest, onAdjust, onClose }) {
  const [now, setNow] = useState(() => Date.now());
  const rang = useRef(false);
  useEffect(() => {
    rang.current = Date.now() >= rest.endsAt; // reopened after it already ended: no sound
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [rest.endsAt]);
  const left = rest.endsAt - now;
  const done = left <= 0;
  useEffect(() => {
    if (done && !rang.current) { rang.current = true; chime(); }
  }, [done]);
  // close itself 20 s after the rest is over
  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(onClose, Math.max(0, rest.endsAt + 20000 - Date.now()));
    return () => clearTimeout(t);
  }, [done, rest.endsAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = Math.max(0, Math.min(1, left / (rest.total * 1000)));

  return (
    <div className={"wt-rest" + (done ? " done" : "")} role="timer" aria-live={done ? "assertive" : "off"}>
      <div className="wt-rest-bar" style={{ transform: `scaleX(${pct})` }} aria-hidden="true" />
      <div className="wt-rest-row">
        <div className="wt-rest-text">
          <span className="wt-rest-label">{done ? "Rest over — next set" : "Rest"}</span>
          <span className="wt-rest-ex">{rest.exercise}</span>
        </div>
        {!done && <span className="wt-rest-clock" aria-label={`${Math.ceil(left / 1000)} seconds left`}>{fmtClock(left)}</span>}
        {!done && (<>
          <button className="wt-rest-btn" onClick={() => onAdjust(-15)} aria-label="15 seconds less">−15</button>
          <button className="wt-rest-btn" onClick={() => onAdjust(15)} aria-label="15 seconds more">+15</button>
        </>)}
        <button className="wt-rest-btn close" onClick={onClose} aria-label={done ? "Dismiss" : "Stop the rest timer"}>✕</button>
      </div>
    </div>
  );
}
