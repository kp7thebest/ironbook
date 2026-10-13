import { useState, useMemo, useRef } from "react";
import { COMMON_DAYS } from "../lib/constants.js";
import { fmtDate, norm, todayStr, uid } from "../lib/helpers.js";
import { lastPerformance } from "../lib/registry.js";
import { EntryCard } from "./EntryCard.jsx";
import { ExercisePicker } from "./ExercisePicker.jsx";
import { RoutineSaver } from "../components/RoutineSaver.jsx";
import { routineToDraftEntries } from "../lib/routines.js";
import { EffortPicker } from "../components/EffortPicker.jsx";
import { blankSet, cleanSession, kindFor } from "../lib/session.js";

// ============ LOG VIEW ============
export function LogView({ unit, draft, setDraft, editing, setEditing, workouts, registry, onFinish, onSaveEdit, onAddCustom, onSetDone,
  routines = [], routinesReady = null, onSaveRoutine, onDeleteRoutine, effortReady = null }) {
  const [picking, setPicking] = useState(false);
  const [managing, setManaging] = useState(false);
  const isEdit = Boolean(editing);
  // When editing, the working object is `editing`; otherwise it's `draft`.
  const current = isEdit ? editing : draft;
  const setCurrent = isEdit ? ((updater) => setEditing((e) => (typeof updater === "function" ? updater(e) : updater))) : setDraft;

  const dayNames = useMemo(() => {
    const c = {};
    workouts.forEach((w) => { c[w.name] = (c[w.name] || 0) + 1; });
    const mine = Object.keys(c).sort((a, b) => c[b] - c[a]);
    const merged = [...mine];
    for (const d of COMMON_DAYS) if (!merged.some((m) => norm(m) === norm(d))) merged.push(d);
    return merged;
  }, [workouts]);

  // Start a session, pre-filling the exercise list from the most recent workout of the same name.
  // Sets are created empty (blank weight/reps) so you just fill in today's numbers; each card still
  // shows the "last time" figures. Pass prefill=false for a blank start.
  const startWorkout = (name, prefill = true) => {
    let entries = [];
    let from = null;
    if (prefill) {
      const prev = [...workouts].filter((w) => norm(w.name) === norm(name)).sort((a, b) => b.date.localeCompare(a.date))[0];
      if (prev) {
        from = prev.date;
        entries = prev.entries.map((e) => ({
          id: uid(), exercise: e.exercise, muscle: e.muscle,
          ...(e.kind === "cardio" ? { kind: "cardio" } : {}),
          sets: (e.sets && e.sets.length ? e.sets : [{}]).map((s) => blankSet(e.kind, s.warmup)),
        }));
      }
    }
    setDraft({ id: uid(), date: todayStr(), name, entries, prefilledFrom: from, prefillTried: prefill });
  };

  const startRoutine = (r) => setDraft({ id: uid(), date: todayStr(), name: r.name, entries: routineToDraftEntries(r), fromRoutine: r.name });

  // ---- reordering state ----
  // NOTE: these hooks MUST stay above the early return below. React requires the same
  // number of hooks on every render; putting them after the return crashed the screen
  // (blank page) whenever a workout was saved or discarded.
  const cardRefs = useRef([]);
  const dragRef = useRef(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragDy, setDragDy] = useState(0);

  const moveEntry = (from, to) => setCurrent((d) => {
    const list = d.entries.map((e) => ({ ...e, id: e.id || uid() }));
    if (to < 0 || to >= list.length || from === to) return d;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    return { ...d, entries: list };
  });

  const onDragStart = (i, e) => {
    const rects = cardRefs.current.map((el) => (el ? el.getBoundingClientRect() : null));
    dragRef.current = { from: i, target: i, startY: e.clientY, centers: rects.map((r) => (r ? r.top + r.height / 2 : 0)) };
    setDragIdx(i); setDragDy(0);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
  };
  const onDragMove = (e) => {
    const st = dragRef.current; if (!st) return;
    const dy = e.clientY - st.startY;
    setDragDy(dy);
    const dragged = st.centers[st.from] + dy;
    let target = st.from;
    for (let j = 0; j < st.centers.length; j++) {
      if (j < st.from && dragged < st.centers[j]) { target = Math.min(target, j); }
      if (j > st.from && dragged > st.centers[j]) { target = Math.max(target, j); }
    }
    st.target = target;
  };
  const onDragEnd = () => {
    const st = dragRef.current; if (!st) return;
    if (st.target !== st.from) moveEntry(st.from, st.target);
    dragRef.current = null; setDragIdx(null); setDragDy(0);
  };

  if (!current) {
    return (
      <div className="wt-pane">
        <div className="wt-empty">
          <div className="wt-empty-big">Ready to lift?</div>
          <p>Pick today’s workout — we’ll pre-load the same exercises you did last time for that split, ready to fill in.</p>
          {routines.length > 0 && (
            <div className="wt-routines">
              <div className="wt-routines-head">
                <span className="wt-count">Your routines</span>
                <button className="wt-ghost small" onClick={() => setManaging((v) => !v)}>{managing ? "Done" : "Manage"}</button>
              </div>
              {routines.map((r) => (
                <div key={r.id} className="wt-routine-row">
                  <button className="wt-routine-start" onClick={() => startRoutine(r)} disabled={managing}>
                    <span className="wt-routine-play" aria-hidden="true">▶</span>
                    <span className="wt-routine-name">{r.name}</span>
                    <span className="wt-routine-n">{r.entries.length} exercise{r.entries.length === 1 ? "" : "s"}</span>
                  </button>
                  {managing && <button className="wt-ghost small danger" onClick={() => { if (confirm(`Delete the “${r.name}” routine? Your past workouts aren’t affected.`)) onDeleteRoutine(r.id); }}>Delete</button>}
                </div>
              ))}
            </div>
          )}
          <div className="wt-quickdays">
            {dayNames.slice(0, 11).map((n) => (
              <button key={n} className="wt-chip" onClick={() => startWorkout(n)}>{n}</button>
            ))}
          </div>
          <button className="wt-primary" onClick={() => startWorkout(dayNames[0] || "workout")}>
            Start workout
          </button>
          <button className="wt-ghost small" onClick={() => setDraft({ id: uid(), date: todayStr(), name: dayNames[0] || "workout", entries: [] })}>
            or start empty
          </button>
        </div>
      </div>
    );
  }

  // Ensure entries/sets have stable ids for editing an old workout (seed/imported ones may lack them)
  const entriesWithIds = current.entries.map((e) => ({ ...e, id: e.id || uid() }));

  const updateEntry = (eid, fn) => setCurrent((d) => ({ ...d, entries: (d.entries.map((e) => ({ ...e, id: e.id || uid() }))).map((e) => (e.id === eid ? fn(e) : e)) }));
  const removeEntry = (eid) => setCurrent((d) => ({ ...d, entries: d.entries.map((e) => ({ ...e, id: e.id || uid() })).filter((e) => e.id !== eid) }));

  const addExercise = (meta) => {
    const last = lastPerformance(workouts, meta.name, current.id);
    const kind = kindFor(meta.name, workouts); // last time's choice, else guessed from the name (cardio → time)
    const sets = last ? last.sets.map((s) => blankSet(kind, s.warmup)) : [blankSet(kind)];
    setCurrent((d) => ({ ...d, entries: [...d.entries.map((e) => ({ ...e, id: e.id || uid() })),
      { id: uid(), exercise: meta.name, muscle: meta.muscle, ...(kind === "cardio" ? { kind: "cardio" } : {}), sets }] }));
    setPicking(false);
  };

  const cleaned = () => cleanSession(current, entriesWithIds); // lib/session.js: strength + cardio sets, effort

  return (
    <div className="wt-pane">
      {isEdit && (
        <div className="wt-editbar">
          <span>Editing session · {fmtDate(current.date)}</span>
          <button className="wt-ghost small" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      )}
      <div className="wt-session-head">
        <input className="wt-session-name" list="wt-daynames" value={current.name} onChange={(e) => setCurrent({ ...current, entries: entriesWithIds, name: e.target.value })} aria-label="Session name" />
        <datalist id="wt-daynames">{dayNames.map((n) => <option key={n} value={n} />)}</datalist>
        <input type="date" className="wt-session-date" value={current.date} onChange={(e) => setCurrent({ ...current, entries: entriesWithIds, date: e.target.value })} aria-label="Session date" />
      </div>

      {!isEdit && current.fromRoutine && (
        <div className="wt-prefill-note">Started from your <strong>{current.fromRoutine}</strong> routine — fill in today’s numbers.</div>
      )}
      {!isEdit && current.prefillTried && (
        current.prefilledFrom
          ? <div className="wt-prefill-note">Loaded your last <strong>{current.name}</strong> split from {fmtDate(current.prefilledFrom)} — fill in today’s numbers.</div>
          : <div className="wt-prefill-note none">No previous <strong>{current.name}</strong> session on your account yet, so this one starts empty. Next time it’ll pre-load.</div>
      )}

      {entriesWithIds.length === 0 && <p className="wt-hint">No exercises yet. Add one to start logging sets.</p>}

      {entriesWithIds.length > 0 && (
        <div className="wt-reorder-hint">
          {entriesWithIds.length > 1 && <>Drag the grip bar, or use ▲▼, to reorder · </>}Tap a set number to mark a warm-up
        </div>
      )}

      {entriesWithIds.map((entry, i) => (
        <div key={entry.id} ref={(el) => (cardRefs.current[i] = el)}
          className={"wt-card-wrap" + (dragIdx === i ? " dragging" : "")}
          style={dragIdx === i ? { transform: `translateY(${dragDy}px)` } : undefined}>
          <EntryCard entry={entry} unit={unit} workouts={workouts} registry={registry} draftId={current.id}
            onChange={(fn) => updateEntry(entry.id, fn)} onRemove={() => removeEntry(entry.id)}
            onSetDone={isEdit ? null : onSetDone /* no rest timer while editing a past session */}
            reorder={entriesWithIds.length > 1 ? {
              index: i,
              total: entriesWithIds.length,
              onUp: () => moveEntry(i, i - 1),
              onDown: () => moveEntry(i, i + 1),
              handleProps: {
                onPointerDown: (e) => onDragStart(i, e),
                onPointerMove: onDragMove,
                onPointerUp: onDragEnd,
                onPointerCancel: onDragEnd,
              },
            } : null} />
        </div>
      ))}

      <button className="wt-secondary wide" onClick={() => setPicking(true)}>+ Add exercise</button>

      <EffortPicker value={current.effort ?? null} available={effortReady}
        onChange={(v) => setCurrent((d) => ({ ...d, entries: d.entries.map((e) => ({ ...e, id: e.id || uid() })), effort: v }))} />

      <div className="wt-session-actions">
        {isEdit ? (
          <>
            <button className="wt-primary" disabled={entriesWithIds.length === 0} onClick={() => onSaveEdit(editing.id, cleaned())}>Save changes</button>
            <button className="wt-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </>
        ) : (
          <>
            <button className="wt-primary" disabled={entriesWithIds.length === 0} onClick={() => onFinish(cleaned())}>Finish workout</button>
            <button className="wt-ghost" onClick={() => { if (confirm("Discard this session?")) setDraft(null); }}>Discard</button>
          </>
        )}
      </div>

      {!isEdit && onSaveRoutine && entriesWithIds.length > 0 && (
        <div className="wt-routine-save">
          <RoutineSaver defaultName={current.fromRoutine || current.name} routines={routines} ready={routinesReady}
            entries={entriesWithIds} onSave={onSaveRoutine} />
        </div>
      )}

      {picking && <ExercisePicker registry={registry} workouts={workouts} onPick={addExercise} onClose={() => setPicking(false)} onAddCustom={onAddCustom} />}
    </div>
  );
}
