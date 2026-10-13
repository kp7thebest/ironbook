import { useState, useMemo } from "react";
import { EquipTag } from "../components/EquipTag.jsx";
import { ExerciseAnim } from "../components/ExerciseAnim.jsx";
import { muscleColor, muscleRegion } from "../lib/constants.js";
import { daysAgo, displayToKg, kgToDisplay, norm, setLine } from "../lib/helpers.js";
import { BARS, defaultBar, isBarbell, platesPerSide } from "../lib/plates.js";
import { lastNote, lastPerformance, similarPerformances } from "../lib/registry.js";
import { lsGet, lsSet } from "../lib/storage.js";
import { bestE1, fmtLoad } from "../lib/strength.js";
import { blankSet, displayToKm, distUnit, fmtDuration, isCardio, kmToDisplay, paceLine, parseDuration } from "../lib/session.js";

// ============ ENTRY CARD ============
export function EntryCard({ entry, unit, workouts, registry, draftId, onChange, onRemove, reorder, onSetDone }) {
  const last = useMemo(() => lastPerformance(workouts, entry.exercise, draftId), [workouts, entry.exercise, draftId]);
  const similar = useMemo(() => similarPerformances(workouts, registry, entry.exercise, draftId), [workouts, registry, entry.exercise, draftId]);
  const [showSimilar, setShowSimilar] = useState(true);
  const [showDemo, setShowDemo] = useState(false);
  const [noteOpen, setNoteOpen] = useState(Boolean(entry.note));
  const [showPlates, setShowPlates] = useState(false);
  const [bar, setBarState] = useState(() => {
    const b = lsGet("ironbook:bar:" + unit, null);
    return BARS[unit].includes(b) ? b : defaultBar(unit);
  });
  const setBar = (b) => { setBarState(b); lsSet("ironbook:bar:" + unit, b); };
  const prevNote = useMemo(() => lastNote(workouts, entry.exercise, draftId), [workouts, entry.exercise, draftId]);
  const color = muscleColor(entry.muscle);
  const meta = registry.get(norm(entry.exercise));
  const imgId = meta && meta.img;

  // Live 1-rep-max estimate from today's sets vs your best estimate on record.
  const prevBest = useMemo(() => {
    const k = norm(entry.exercise);
    let best = null;
    for (const w of workouts) {
      if (w.id === draftId) continue;
      for (const e of w.entries || []) {
        if (norm(e.exercise) !== k) continue;
        const b = bestE1(e.sets);
        if (b && (!best || b.e1 > best.e1)) best = { ...b, date: w.date };
      }
    }
    return best;
  }, [workouts, entry.exercise, draftId]);
  const today = bestE1(entry.sets);
  const cardio = isCardio(entry); // v14: time (+ distance) instead of weight × reps
  const barbell = isBarbell(meta) && !cardio;
  const barNow = BARS[unit].includes(bar) ? bar : defaultBar(unit); // unit may have changed
  const isNewPR = today && prevBest && today.e1 > prevBest.e1 + 0.01;

  const setSet = (i, field, val) => onChange((e) => {
    const sets = e.sets.map((s, j) => {
      if (j !== i) return s;
      if (field === "weight") {
        // Keep the raw text (so "22." or "22.5" type smoothly) and derive kg from it.
        return { ...s, wStr: val, weight: displayToKg(val, unit) };
      }
      if (field === "time") return { ...s, tStr: val, time: parseDuration(val) };
      if (field === "distance") return { ...s, dStr: val, distance: displayToKm(val, unit) };
      return { ...s, [field]: val };
    });
    return { ...e, sets };
  });
  const addSet = () => onChange((e) => {
    const prev = e.sets[e.sets.length - 1];
    return { ...e, sets: [...e.sets, prev ? { ...prev } : { weight: null, reps: "" }] };
  });
  const dropSet = (i) => onChange((e) => ({ ...e, sets: e.sets.filter((_, j) => j !== i) }));
  // Switch between weight × reps and time; keeps the number of sets and which are warm-ups.
  const switchKind = () => onChange((e) => {
    const next = cardio ? "strength" : "cardio";
    const { kind, ...rest } = e; // eslint-disable-line no-unused-vars
    return { ...rest, ...(next === "cardio" ? { kind: "cardio" } : {}), sets: e.sets.map((s) => blankSet(next, s.warmup)) };
  });
  const cardioTotal = cardio ? entry.sets.filter((s) => s.time > 0 && !s.warmup).reduce((t, s) => ({ time: t.time + s.time, distance: t.distance + (s.distance || 0) }), { time: 0, distance: 0 }) : null;

  return (
    <div className="wt-card" style={{ "--plate": color }}>
      {reorder && (
        <div className="wt-grip">
          {/* Big drag surface: the whole bar except the arrow buttons. */}
          <div className="wt-grip-drag" {...reorder.handleProps} role="button" tabIndex={0}
            aria-label={`Drag to reorder ${entry.exercise}`} title="Drag to reorder">
            <span className="wt-grip-dots" aria-hidden="true">⠿</span>
            <span className="wt-grip-pos">{reorder.index + 1} of {reorder.total}</span>
          </div>
          <div className="wt-grip-arrows">
            <button className="wt-grip-btn" onClick={reorder.onUp} disabled={reorder.index === 0}
              aria-label={`Move ${entry.exercise} up`}>▲</button>
            <button className="wt-grip-btn" onClick={reorder.onDown} disabled={reorder.index === reorder.total - 1}
              aria-label={`Move ${entry.exercise} down`}>▼</button>
          </div>
        </div>
      )}
      <div className="wt-card-head">
        <span className="wt-plate" aria-hidden="true" />
        <div className="wt-card-titlewrap">
          <div className="wt-card-title">{entry.exercise}</div>
          <div className="wt-card-sub"><span>{entry.muscle}{norm(muscleRegion(entry.muscle)) !== norm(entry.muscle || "") ? ` · ${muscleRegion(entry.muscle)}` : ""}</span> <EquipTag meta={meta || { equipment: "" }} /></div>
        </div>
        {imgId && (
          <button className={"wt-demo-btn" + (showDemo ? " on" : "")} onClick={() => setShowDemo((v) => !v)} aria-expanded={showDemo}>
            ▶ How it’s done
          </button>
        )}
        <button className="wt-x" onClick={onRemove} aria-label={`Remove ${entry.exercise}`}>✕</button>
      </div>

      {showDemo && imgId && <ExerciseAnim imgId={imgId} name={entry.exercise} />}

      {last ? (
        <div className="wt-lasttime">
          <span className="wt-lt-label">Last time · {daysAgo(last.date)}</span>
          <span className="wt-lt-sets">{last.sets.map((s) => setLine(s, unit)).join("  ·  ")} {last.kind !== "cardio" && <em>{unit}</em>}</span>
        </div>
      ) : (
        <div className="wt-lasttime none">First time logging this — set your baseline.</div>
      )}
      {prevNote && (
        <div className="wt-lastnote"><span className="wt-lt-label">Note · {daysAgo(prevNote.date)}</span> <span className="wt-lastnote-text">{prevNote.note}</span></div>
      )}

      <div className="wt-sets">
        {cardio
          ? <div className="wt-sets-head"><span>Set</span><span>Time (min:sec)</span><span>Distance ({distUnit(unit)})</span><span /></div>
          : <div className="wt-sets-head"><span>Set</span><span>Weight ({unit})</span><span>Reps</span><span /></div>}
        {entry.sets.map((s, i) => (
          <div className="wt-set-row" key={i}>
            <button className={"wt-set-n" + (s.warmup ? " warm" : "") + ((cardio ? s.time > 0 : s.reps && String(s.reps).trim()) ? " done" : "")} onClick={() => setSet(i, "warmup", !s.warmup)}
              aria-pressed={Boolean(s.warmup)} aria-label={`Set ${i + 1}: ${s.warmup ? "warm-up (tap for work set)" : "work set (tap to mark as warm-up)"}`}
              title={s.warmup ? "Warm-up — doesn’t count toward PRs or volume" : "Tap to mark as a warm-up"}>{s.warmup ? "W" : i + 1}</button>
            {cardio ? (<>
              {/* "25" = 25 min, "25:30" or "25.30" = 25 min 30 s (the iPhone number pad has no colon) */}
              <input inputMode="decimal" placeholder={last && last.kind === "cardio" && last.sets[i] && last.sets[i].time ? fmtDuration(last.sets[i].time) : "mm:ss"}
                value={s.tStr != null ? s.tStr : fmtDuration(s.time)} onChange={(e) => setSet(i, "time", e.target.value.replace(/[^0-9:.,]/g, ""))}
                aria-label={`Set ${i + 1} time, minutes and seconds`} aria-invalid={Boolean(s.tStr && s.tStr.trim() && !s.time)} />
              <input inputMode="decimal" placeholder={last && last.kind === "cardio" && last.sets[i] && last.sets[i].distance != null ? String(kmToDisplay(last.sets[i].distance, unit)) : "optional"}
                value={s.dStr != null ? s.dStr : (s.distance != null ? kmToDisplay(s.distance, unit) : "")} onChange={(e) => setSet(i, "distance", e.target.value)}
                aria-label={`Set ${i + 1} distance in ${distUnit(unit)}`} />
            </>) : (<>
            <input inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" placeholder={last && last.sets[i] && last.sets[i].weight != null ? String(kgToDisplay(last.sets[i].weight, unit)) : "–"}
              value={s.wStr != null ? s.wStr : (s.weight != null ? kgToDisplay(s.weight, unit) : "")} onChange={(e) => setSet(i, "weight", e.target.value)} aria-label={`Set ${i + 1} weight`} />
            <input inputMode="text" pattern="[0-9,]*" placeholder={last && last.sets[i] ? (last.sets[i].reps || "–") : "e.g. 8 or 6,6"}
              value={s.reps || ""} onChange={(e) => setSet(i, "reps", e.target.value.replace(/[^0-9,]/g, ""))} aria-label={`Set ${i + 1} reps`}
              onBlur={(e) => { if (onSetDone && e.target.value.trim()) onSetDone(entry.exercise); }} />
            </>)}
            <button className="wt-x dim" onClick={() => dropSet(i)} aria-label={`Remove set ${i + 1}`}>✕</button>
          </div>
        ))}
        <div className="wt-card-tools">
          <button className="wt-ghost small" onClick={addSet}>+ Add set</button>
          {!noteOpen && <button className="wt-ghost small" onClick={() => setNoteOpen(true)}>+ Note</button>}
          <button className="wt-ghost small wt-kind-btn" onClick={switchKind}>{cardio ? "Use weight × reps" : "Use time"}</button>
          {barbell && (
            <button className={"wt-ghost small" + (showPlates ? " on" : "")} onClick={() => setShowPlates((v) => !v)} aria-expanded={showPlates}>
              Plates
            </button>
          )}
        </div>
        {noteOpen && (
          <input className="wt-note-input" maxLength={200} value={entry.note || ""} autoFocus={!entry.note}
            placeholder="Seat height, machine #, how it felt…" aria-label={`Note for ${entry.exercise}`}
            onChange={(e) => onChange((x) => ({ ...x, note: e.target.value }))} />
        )}
        {showPlates && barbell && <PlatePanel sets={entry.sets} unit={unit} bar={barNow} setBar={setBar} />}
        {cardio && cardioTotal.time > 0 && (
          <div className="wt-e1-live" aria-live="polite">
            <span>Total today <strong>{fmtDuration(cardioTotal.time)}</strong>{cardioTotal.distance > 0 && <strong>· {kmToDisplay(cardioTotal.distance, unit)} {distUnit(unit)}</strong>}</span>
            {cardioTotal.distance > 0 && <span className="wt-e1-prev">{paceLine(cardioTotal, unit)}</span>}
          </div>
        )}
        {today && (
          <div className={"wt-e1-live" + (isNewPR ? " pr" : "")} aria-live="polite">
            <span>Est. 1-rep max today <strong>{fmtLoad(today.e1, unit)} {unit}</strong></span>
            {isNewPR
              ? <span className="wt-e1-badge">▲ New estimated PR</span>
              : prevBest && <span className="wt-e1-prev">best {fmtLoad(prevBest.e1, unit)} {unit}</span>}
          </div>
        )}
      </div>

      {!cardio && similar.items.length > 0 && (
        <div className="wt-similar">
          <button className="wt-similar-head" onClick={() => setShowSimilar((v) => !v)} aria-expanded={showSimilar}>
            <span className="wt-sim-label">Similar {similar.muscle} work</span>
            <span className="wt-sim-count">{similar.items.length}</span>
            <span className="wt-sim-caret">{showSimilar ? "▾" : "▸"}</span>
          </button>
          {showSimilar && (
            <div className="wt-similar-list">
              {similar.items.map((it) => (
                <div className="wt-similar-row" key={it.exercise}>
                  <span className="wt-sim-name">{it.exercise}</span>
                  <span className="wt-sim-sets">{it.sets.map((s) => setLine(s, unit)).join(" · ")} <em>{unit}</em></span>
                  <span className="wt-sim-date">{daysAgo(it.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Plates to load per side for each set's weight (barbell exercises only).
function PlatePanel({ sets, unit, bar, setBar }) {
  const rows = sets.map((s, i) => ({ i, w: s.weight != null ? kgToDisplay(s.weight, unit) : null })).filter((r) => r.w != null);
  return (
    <div className="wt-plates">
      <div className="wt-plates-head">
        <span>Plates per side</span>
        <div className="wt-seg" role="group" aria-label="Bar weight">
          {BARS[unit].map((b) => (
            <button key={b} className={"wt-seg-btn" + (b === bar ? " on" : "")} onClick={() => setBar(b)}>{b} {unit} bar</button>
          ))}
        </div>
      </div>
      {rows.length === 0 && <p className="wt-hint">Enter a weight to see what to load.</p>}
      {rows.map(({ i, w }) => {
        const r = platesPerSide(w, bar, unit);
        return (
          <div className="wt-plates-row" key={i}>
            <span className="wt-plates-set">Set {i + 1} · {w} {unit}</span>
            {r.belowBar ? <span className="wt-hint">lighter than the bar</span>
              : r.perSide.length === 0 ? <span className="wt-hint">just the bar</span>
              : (
                <span className="wt-plates-list" aria-label={`${r.perSide.join(", ")} ${unit} per side`}>
                  {r.perSide.map((p, j) => <span key={j} className="wt-plate-chip" style={{ "--h": `${Math.round(16 + (p / (unit === "kg" ? 25 : 45)) * 16)}px` }}>{p}</span>)}
                </span>
              )}
            {!r.belowBar && r.leftover > 0 && <span className="wt-plates-left">+{r.leftover} {unit}/side won’t fit</span>}
          </div>
        );
      })}
    </div>
  );
}
