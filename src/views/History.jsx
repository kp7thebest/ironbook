import { useState } from "react";
import { muscleColor } from "../lib/constants.js";
import { exportToExcel } from "../lib/excel.js";
import { fmtDate, setLine } from "../lib/helpers.js";
import { RoutineSaver } from "../components/RoutineSaver.jsx";

// ============ HISTORY ============
export function HistoryView({ unit, workouts, onDelete, onEdit, who, flash, readOnly = false, routines = [], routinesReady = null, onSaveRoutine }) {
  const [open, setOpen] = useState(null);
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  if (sorted.length === 0) return <div className="wt-pane"><p className="wt-hint">{readOnly ? "No sessions logged yet." : "No sessions yet. Your finished workouts land here."}</p></div>;
  return (
    <div className="wt-pane">
      <div className="wt-hist-bar">
        <div className="wt-count">{sorted.length} sessions on record</div>
        {!readOnly && (
          <button className="wt-export" onClick={async () => {
            try { await exportToExcel(workouts, unit, who); flash("Exported .xlsx"); }
            catch (e) { console.error(e); flash("Export failed"); }
          }}>⤓ Export .xlsx</button>
        )}
      </div>
      {sorted.map((w) => (
        <div key={w.id} className="wt-hist">
          <button className="wt-hist-head" onClick={() => setOpen(open === w.id ? null : w.id)}>
            <span className="wt-hist-date">{fmtDate(w.date)}</span>
            <span className="wt-hist-name">{w.name}{w.pendingSync ? <span className="wt-pending">Waiting to sync</span> : null}</span>
            <span className="wt-hist-n">{w.effort ? <span className="wt-effort-chip" aria-label={`Effort ${w.effort} out of 10`}>{w.effort}/10</span> : null}{w.entries.length} exercise{w.entries.length === 1 ? "" : "s"}</span>
          </button>
          {open === w.id && (
            <div className="wt-hist-body">
              {w.entries.map((e) => (
                <div className="wt-hist-row" key={e.id || e.exercise} style={{ "--plate": muscleColor(e.muscle) }}>
                  <span className="wt-plate sm" aria-hidden="true" />
                  <span className="wt-hist-ex">{e.exercise}</span>
                  <span className="wt-hist-sets">{e.sets.map((s) => setLine(s, unit)).join(" · ")} {e.kind !== "cardio" && <em>{unit}</em>}</span>
                  {e.note && <span className="wt-hist-note">{e.note}</span>}
                </div>
              ))}
              {!readOnly && (
                <div className="wt-hist-actions">
                  <button className="wt-ghost small" onClick={() => onEdit(w)}>✎ Edit session</button>
                  <button className="wt-ghost small danger" onClick={() => { if (confirm(`Delete session from ${fmtDate(w.date)}?`)) onDelete(w.id); }}>Delete session</button>
                  {onSaveRoutine && <RoutineSaver defaultName={w.name} routines={routines} ready={routinesReady} entries={w.entries} onSave={onSaveRoutine} />}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
