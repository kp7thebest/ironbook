import { useState, useEffect, useMemo } from "react";
import { CustomForm } from "../components/CustomForm.jsx";
import { EquipTag } from "../components/EquipTag.jsx";
import { ExerciseAnim } from "../components/ExerciseAnim.jsx";
import { ExerciseFilters } from "../components/ExerciseFilters.jsx";
import { fetchAllCustom } from "../db.js";
import { muscleColor } from "../lib/constants.js";
import { EMPTY_FILTER, matchFilter } from "../lib/filters.js";
import { daysAgo, norm, setLine } from "../lib/helpers.js";
import { lastPerformance } from "../lib/registry.js";
import { loggedNames } from "../lib/rename.js";

// ============ EXERCISES LIBRARY ============
export const LIB_CAP = 150;
export function ExercisesView({ registry, workouts, unit, flash, myId, onAddCustom, onEditCustom, onDeleteCustom, onShowProgress, onRename }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState(EMPTY_FILTER);
  const [adding, setAdding] = useState(false);
  const [openEx, setOpenEx] = useState(null);
  const [allCustom, setAllCustom] = useState(null); // crew-wide customs with author
  const [editingId, setEditingId] = useState(null);
  const [renaming, setRenaming] = useState(null); // name of the exercise whose rename form is open

  const loadCustoms = () => fetchAllCustom().then(setAllCustom).catch(() => setAllCustom([]));
  useEffect(() => { loadCustoms(); }, []);

  const { list, total } = useMemo(() => {
    const nq = norm(q);
    const out = [];
    for (const meta of registry.values()) {
      if (nq && !norm(meta.name).includes(nq)) continue;
      if (!matchFilter(meta, f)) continue;
      out.push(meta);
    }
    // your own exercises first, then the database, alphabetically
    out.sort((a, b) => (a.source === "db" ? 1 : 0) - (b.source === "db" ? 1 : 0) || a.name.localeCompare(b.name));
    return { list: out.slice(0, LIB_CAP), total: out.length };
  }, [q, f, registry]);

  return (
    <div className="wt-pane">
      {/* --- Custom exercises management --- */}
      <div className="wt-settings-block">
        <div className="wt-settings-title">Custom exercises</div>
        {!adding ? (
          <button className="wt-createx" onClick={() => setAdding(true)}>✚ Create custom exercise</button>
        ) : (
          <CustomForm initialName="" onCancel={() => setAdding(false)}
            onSave={async (c) => { await onAddCustom(c); setAdding(false); flash("Exercise added"); loadCustoms(); }} />
        )}
        {allCustom === null ? (
          <p className="wt-hint pad">Loading…</p>
        ) : allCustom.length === 0 ? (
          <p className="wt-hint pad">No custom exercises yet. Create one above — everyone in the crew will see it.</p>
        ) : (
          <div className="wt-custlist">
            {allCustom.map((c) => (
              editingId === c.id ? (
                <div key={c.id} className="wt-cust-edit">
                  <CustomForm initialName={c.name} initialMuscle={c.muscle} initialEquipment={c.equipment}
                    saveLabel="Save changes" onCancel={() => setEditingId(null)}
                    onSave={async (upd) => { try { await onEditCustom(c.id, upd); setEditingId(null); loadCustoms(); } catch {} }} />
                </div>
              ) : (
                <div key={c.id} className="wt-cust-row" style={{ "--plate": muscleColor(c.muscle) }}>
                  <span className="wt-plate sm" aria-hidden="true" />
                  <div className="wt-lib-main">
                    <span className="wt-pick-name">{c.name}</span>
                    <span className="wt-pick-meta">
                      <span className="wt-pick-muscle">{c.muscle} · added by {c.user_id === myId ? "you" : c.author}</span>
                      <EquipTag meta={c} />
                    </span>
                  </div>
                  {c.user_id === myId && (
                    <div className="wt-cust-actions">
                      <button className="wt-ghost small" onClick={() => setEditingId(c.id)}>Edit</button>
                      <button className="wt-ghost small danger" onClick={async () => { if (confirm(`Delete “${c.name}”?`)) { try { await onDeleteCustom(c.id); loadCustoms(); } catch {} } }}>Delete</button>
                    </div>
                  )}
                </div>
              )
            ))}
          </div>
        )}
      </div>

      {/* --- Full library browser --- */}
      <input className="wt-search" placeholder="Search the library…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ExerciseFilters f={f} setF={setF} />
      <div className="wt-lib-count">{total} exercise{total === 1 ? "" : "s"}{total > list.length ? ` · showing first ${list.length}` : ""}</div>
      <div className="wt-lib">
        {list.map((m) => {
          const last = lastPerformance(workouts, m.name, null);
          const isOpen = openEx === m.name;
          return (
            <div key={m.name} className={"wt-lib-item" + (isOpen ? " open" : "")} style={{ "--plate": muscleColor(m.muscle) }}>
              <button className="wt-lib-row" onClick={() => setOpenEx(isOpen ? null : m.name)} aria-expanded={isOpen}>
                <span className="wt-plate sm" aria-hidden="true" />
                <div className="wt-lib-main">
                  <span className="wt-pick-name">{m.name}</span>
                  <span className="wt-pick-meta">
                    <span className="wt-pick-muscle">{m.muscle}{m.source === "custom" ? " · custom" : ""}{m.img ? " · ▶ demo" : ""}</span>
                    <EquipTag meta={m} />
                  </span>
                </div>
                {last && <span className="wt-lib-last">{last.sets.slice(0, 3).map((s) => setLine(s, unit)).join(" · ")}<br /><em>{daysAgo(last.date)}</em></span>}
              </button>
              {isOpen && (m.img ? <ExerciseAnim imgId={m.img} name={m.name} /> : <div className="wt-anim-err">No demo images for this one{m.source === "custom" ? " — custom exercises don’t have demos yet" : ""}.</div>)}
              {isOpen && last && (
                <div className="wt-lib-actions">
                  {onShowProgress && <button className="wt-ghost small wt-lib-progress" onClick={() => onShowProgress(m.name)}>View progress chart <span aria-hidden="true">›</span></button>}
                  {onRename && renaming !== m.name && <button className="wt-ghost small" onClick={() => setRenaming(m.name)}>Rename across my log</button>}
                </div>
              )}
              {isOpen && last && renaming === m.name && (
                <RenameForm name={m.name} workouts={workouts} onCancel={() => setRenaming(null)}
                  onRename={async (to) => {
                    const n = await onRename(m.name, to);
                    if (n) { setRenaming(null); setOpenEx(to.trim().replace(/\s+/g, " ")); setQ(""); }
                  }} />
              )}
            </div>
          );
        })}
        {list.length === 0 && <div className="wt-hint pad">Nothing matches. Try another search or create it as a custom exercise.</div>}
      </div>
    </div>
  );
}

// Rename an exercise everywhere in my log, or merge it into another one I've logged.
function RenameForm({ name, workouts, onRename, onCancel }) {
  const [to, setTo] = useState(name);
  const [busy, setBusy] = useState(false);
  const others = useMemo(() => loggedNames(workouts, name), [workouts, name]);
  const sessions = useMemo(() => workouts.filter((w) => (w.entries || []).some((e) => norm(e.exercise) === norm(name))).length, [workouts, name]);
  const clean = to.trim().replace(/\s+/g, " ");
  const mergeInto = others.find((o) => norm(o) === norm(clean));
  const unchanged = !clean || clean === name;
  const go = async () => {
    if (mergeInto && !confirm(`Merge “${name}” into “${mergeInto}”? Their histories become one, and this can’t be split apart again.`)) return;
    setBusy(true);
    try { await onRename(mergeInto || clean); } finally { setBusy(false); }
  };
  return (
    <div className="wt-rename">
      <label className="wt-rename-label">New name
        <input list="wt-rename-names" value={to} onChange={(e) => setTo(e.target.value)} autoCapitalize="none" />
      </label>
      <datalist id="wt-rename-names">{others.map((o) => <option key={o} value={o} />)}</datalist>
      <p className="wt-hint">
        {mergeInto
          ? <>Merges into <strong>{mergeInto}</strong> — {sessions} session{sessions === 1 ? "" : "s"} move over and the two histories become one.</>
          : <>Updates {sessions} session{sessions === 1 ? "" : "s"} in your log. Friends’ logs aren’t changed.</>}
      </p>
      <div className="wt-form-actions">
        <button className="wt-primary" disabled={unchanged || busy} onClick={go}>{busy ? "Saving…" : mergeInto ? "Merge" : "Rename"}</button>
        <button className="wt-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
