import { useState } from "react";

// "Save as routine" (v13, N6): a button that opens a one-line name form.
// ready === false means the routines table doesn't exist yet (patch_routines.sql not run).
export function RoutineSaver({ defaultName, routines, ready, onSave, entries }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName || "");
  const [busy, setBusy] = useState(false);
  if (!open) {
    return <button className="wt-ghost small" onClick={() => { setName(defaultName || ""); setOpen(true); }}>☆ Save as routine</button>;
  }
  if (ready === false) {
    return (
      <div className="wt-routine-form">
        <p className="wt-hint">Routines need a one-time database update: run <strong>supabase/patch_routines.sql</strong> in the Supabase SQL editor, then try again.</p>
        <button className="wt-ghost small" onClick={() => setOpen(false)}>OK</button>
      </div>
    );
  }
  const clean = name.trim();
  const replaces = routines.some((r) => r.name === clean);
  const save = async () => {
    setBusy(true);
    const ok = await onSave(clean, entries);
    setBusy(false);
    if (ok) setOpen(false);
  };
  return (
    <div className="wt-routine-form">
      <label className="wt-rename-label">Routine name
        <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Upper A" autoFocus
          onKeyDown={(e) => e.key === "Enter" && clean && save()} />
      </label>
      <p className="wt-hint">{replaces ? <>Replaces your existing <strong>{clean}</strong> routine.</> : "Saves the exercises and number of sets (not the weights). Start it any time from Log."}</p>
      <div className="wt-form-actions">
        <button className="wt-primary" disabled={!clean || busy} onClick={save}>{busy ? "Saving…" : "Save routine"}</button>
        <button className="wt-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
