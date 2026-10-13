import { useState, useEffect } from "react";
import { IMG_BASE } from "../lib/constants.js";

// ============ EXERCISE DEMO ANIMATION ============
export function ExerciseAnim({ imgId, name }) {
  const [frame, setFrame] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setFrame((f) => 1 - f), 950);
    return () => clearInterval(t);
  }, []);
  if (failed) return <div className="wt-anim-err">Demo images couldn’t load — they need an internet connection.</div>;
  return (
    <div className="wt-anim">
      {[0, 1].map((i) => (
        <img key={i} src={`${IMG_BASE}${imgId}/${i}.jpg`} alt={`${name} — ${i === 0 ? "start" : "finish"} position`}
          className={"wt-anim-frame" + (frame === i ? " show" : "")} loading="lazy" onError={() => setFailed(true)} />
      ))}
      <span className="wt-anim-badge">{frame === 0 ? "Start" : "Finish"}</span>
      <button className="wt-anim-step" onClick={() => setFrame((f) => 1 - f)} aria-label="Toggle position">⇄</button>
    </div>
  );
}
