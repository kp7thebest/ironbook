import { useState, useEffect, useMemo, useRef } from "react";
import { LoadingScreen } from "./components/LoadingScreen.jsx";
import { Shell } from "./components/Shell.jsx";
import { deleteCustom, deleteRoutine, deleteWorkout, fetchCustom, fetchMyProfile, fetchRoutines, fetchWorkouts, hasEffortColumn, insertCustom, insertWorkout, saveRoutine, signOut, updateCustom, updateDisplayName, updateEmail, updatePrivacy, updateUnit, updateWorkout } from "./db.js";
import { cacheKey, draftKey, queueKey } from "./lib/constants.js";
import { norm } from "./lib/helpers.js";
import { buildRegistry, loadExdb } from "./lib/registry.js";
import { isMissingTable, toRoutineEntries } from "./lib/routines.js";
import { renameInWorkouts } from "./lib/rename.js";
import { lsDel, lsGet, lsSet } from "./lib/storage.js";
import { setReloadBlocked } from "./lib/updates.js";
import { applyOps, enqueue, flushOps, makeOp, migrateQueue, newId, settle } from "./sync.js";
import { BottomNav } from "./components/BottomNav.jsx";
import { RestTimer } from "./components/RestTimer.jsx";
import { REST_KEY, clampRest, rememberRest, restEnabled, restSecondsFor, unlockAudio } from "./lib/rest.js";
import { CalendarView } from "./views/Calendar.jsx";
import { MoreView } from "./views/More.jsx";
import { FriendsView } from "./views/Friends.jsx";
import { HistoryView } from "./views/History.jsx";
import { ExercisesView } from "./views/Library.jsx";
import { LogView } from "./views/Log.jsx";
import { ProgressView } from "./views/Progress.jsx";
import { SettingsView } from "./views/Settings.jsx";

// ============ MAIN APP (signed in) ============
export function MainApp({ session, theme, onToggleTheme }) {
  const myId = session.user.id;
  // Last-known data saved on this phone: the app opens on it at once and refreshes in the background.
  const [boot] = useState(() => lsGet(cacheKey(myId), null));
  const [profile, setProfile] = useState(() => (boot ? boot.profile : null));
  const [workouts, setWorkouts] = useState(() => (boot ? applyOps(boot.workouts, migrateQueue(lsGet(queueKey(myId), []))) : []));
  const [custom, setCustom] = useState(() => (boot ? boot.custom : []));
  const [exdb, setExdb] = useState(null); // 873-exercise database, loaded after first paint
  const [routines, setRoutines] = useState(() => (boot && boot.routines) || []);
  const [effortReady, setEffortReady] = useState(null); // v14: false = workouts.effort column missing (patch not run)
  // true = available, false = table missing (patch_routines.sql not run yet), null = not known yet
  const [routinesReady, setRoutinesReady] = useState(() => (boot && boot.routines ? true : null));
  const [draft, setDraft] = useState(() => lsGet(draftKey(myId), null));
  const [editing, setEditing] = useState(null); // a saved workout being edited (full object incl. id)
  const [progressKey, setProgressKey] = useState(null); // exercise shown on the Progress tab
  const [tab, setTab] = useState("log");
  const [crewView, setCrewView] = useState("friends"); // Crew tab: friends | calendar
  const [rest, setRest] = useState(() => { const r = lsGet(REST_KEY, null); return r && r.endsAt > Date.now() - 20000 ? r : null; });
  const [moreView, setMoreView] = useState(null); // More tab: null (menu) | library | settings
  const [toast, setToast] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [loaded, setLoaded] = useState(Boolean(boot));

  const unit = profile ? profile.unit : "kg";
  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  // ---- offline-safe sync (src/sync.js) ----
  // Queued ops live in localStorage; the screen shows server rows with pending ops applied on top.
  const syncing = useRef(null);
  const readQueue = () => migrateQueue(lsGet(queueKey(myId), []));
  const writeQueue = (ops) => (ops.length ? lsSet(queueKey(myId), ops) : lsDel(queueKey(myId)));
  const syncApi = {
    insertWorkout: (id, data) => insertWorkout(myId, { id, ...data }),
    updateWorkout: (id, data) => updateWorkout(id, data),
    deleteWorkout: (id) => deleteWorkout(id),
  };
  // Send whatever is queued. One flush at a time (launch, commit() and reconnects all share the
  // lock), so ops for the same workout always go in order. Ops added meanwhile are kept by settle().
  const flushLocked = async () => {
    while (syncing.current) await syncing.current; // let the running flush finish first
    const run = (async () => {
      const ops = readQueue();
      if (!ops.length) return { sent: [], failed: 0, offline: false };
      writeQueue(ops); // persists ids given to a v10-format queue, so settle() can match them
      const r = await flushOps(ops, syncApi);
      if (r.sent.length) writeQueue(settle(readQueue(), r.sent));
      return r;
    })();
    const mine = run.catch(() => {});
    syncing.current = mine;
    try { return await run; } finally { if (syncing.current === mine) syncing.current = null; }
  };
  // Flush, then reload my workouts from the server if anything was sent.
  const syncNow = async () => {
    const r = await flushLocked();
    if (r.sent.length) {
      try { setWorkouts(applyOps(await fetchWorkouts(myId), readQueue())); } catch { /* keep what's on screen */ }
    }
    return { ...r, synced: r.sent.length, pending: readQueue().length };
  };
  // Record a change: save it on the phone, show it at once, then try to send it.
  const commit = async (op) => {
    writeQueue(enqueue(readQueue(), op));
    setWorkouts((ws) => applyOps(ws, [op]));
    const r = await syncNow();
    return r.pending === 0 ? "synced" : r.offline ? "offline" : "failed";
  };

  // Load (or refresh) from the server: profile + my customs, push anything queued offline, then my
  // workouts. With a saved copy the app is already on screen; without one, the loading screen shows.
  useEffect(() => {
    let live = true;
    fetchRoutines(myId)
      .then((rs) => { if (live) { setRoutines(rs); setRoutinesReady(true); } })
      .catch((e) => { if (live && isMissingTable(e)) setRoutinesReady(false); }); // offline: keep the saved copy
    (async () => {
      try {
        const [p, cs] = await Promise.all([fetchMyProfile(myId), fetchCustom(myId)]);
        await flushLocked();
        const fresh = await fetchWorkouts(myId);
        if (!live) return;
        setEffortReady(hasEffortColumn());
        setProfile(p); setWorkouts(applyOps(fresh, readQueue())); setCustom(cs);
        setLoaded(true);
      } catch (e) {
        if (!live) return;
        if (boot) flash("Offline — showing the log saved on this phone");
        else setLoadErr(e.message || "Couldn’t load your data. Check your connection and refresh.");
      }
    })();
    return () => { live = false; };
  }, [myId]);

  // Keep the saved copy current (pending-sync flags are re-derived from the queue on launch).
  useEffect(() => {
    if (!loaded || !profile) return;
    lsSet(cacheKey(myId), { profile, custom, workouts: workouts.map(({ pendingSync, ...w }) => w),
      routines: routinesReady ? routines : null, savedAt: Date.now() });
  }, [loaded, profile, custom, workouts, routines, routinesReady, myId]);

  // The exercise database isn't needed for first paint; fetch it right after.
  useEffect(() => { loadExdb().then(setExdb).catch(() => {}); }, []);

  // Retry queued changes when the connection comes back or the app is reopened.
  useEffect(() => {
    if (!loaded) return;
    const retry = () => { if (readQueue().length) syncNow().then((r) => { if (r.synced && !r.pending) flash("Offline changes synced"); }); };
    const onVis = () => { if (document.visibilityState === "visible") retry(); };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("online", retry); document.removeEventListener("visibilitychange", onVis); };
  }, [loaded]);

  // Persist draft locally so a mid-workout refresh loses nothing
  useEffect(() => { draft ? lsSet(draftKey(myId), draft) : lsDel(draftKey(myId)); }, [draft, myId]);

  // Each tab opens at the top (after Finish, History used to open wherever the Log page was scrolled).
  useEffect(() => { window.scrollTo(0, 0); }, [tab, crewView, moreView]);
  // Tapping More again returns to its menu.
  const onTab = (id) => { if (id === "more" && tab === "more") setMoreView(null); setTab(id); };

  // ---- rest timer (v13) ----
  const saveRest = (r) => { setRest(r); r ? lsSet(REST_KEY, r) : lsDel(REST_KEY); };
  const startRest = (exercise) => {
    if (!restEnabled()) return;
    const total = restSecondsFor(exercise);
    saveRest({ endsAt: Date.now() + total * 1000, total, exercise });
  };
  const adjustRest = (delta) => {
    if (!rest) return;
    const total = clampRest(rest.total + delta);
    rememberRest(rest.exercise, total); // next time this exercise starts with the adjusted rest
    saveRest({ ...rest, total, endsAt: rest.endsAt + (total - rest.total) * 1000 });
  };
  // iOS only plays sound after a tap has "unlocked" audio; any tap in the app does it.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // Tell the update banner (App) not to auto-reload while a past session is open for editing.
  useEffect(() => { setReloadBlocked(Boolean(editing)); return () => setReloadBlocked(false); }, [editing]);

  const registry = useMemo(() => buildRegistry(custom, workouts, exdb || undefined), [custom, workouts, exdb]);

  const setUnit = async (u) => {
    setProfile((p) => ({ ...p, unit: u }));
    try { await updateUnit(myId, u); } catch { flash("Couldn’t sync unit preference"); }
  };

  const syncMsg = (status, done) => (status === "synced" ? done
    : status === "offline" ? "Saved offline · syncs when back online"
    : "Saved on this phone · sync will retry");

  const finishWorkout = async (sessionData) => {
    setDraft(null); setTab("history");
    flash(syncMsg(await commit(makeOp("insert", newId(), sessionData)), "Workout saved"));
  };

  const removeWorkout = async (id) => {
    flash(syncMsg(await commit(makeOp("delete", id)), "Session deleted"));
  };

  const saveEditedWorkout = async (id, sessionData) => {
    setEditing(null); setTab("history");
    flash(syncMsg(await commit(makeOp("update", id, sessionData)), "Workout updated"));
  };

  // Rename (or merge) an exercise across every session in my log — one queued update per session.
  const renameExercise = async (oldName, newName) => {
    const target = registry.get(norm(newName));
    const changes = renameInWorkouts(workouts, oldName, newName, target && norm(target.name) !== norm(oldName) ? target.muscle : undefined);
    if (!changes.length) return 0;
    const ops = changes.map((c) => makeOp("update", c.id, c.data));
    writeQueue(ops.reduce((q, op) => enqueue(q, op), readQueue()));
    setWorkouts((ws) => applyOps(ws, ops));
    if (progressKey === norm(oldName)) setProgressKey(norm(newName));
    // My custom exercise of that name follows the rename (unless the new name is already one of mine).
    const mine = custom.find((c) => norm(c.name) === norm(oldName));
    if (mine && mine.id && !custom.some((c) => c !== mine && norm(c.name) === norm(newName))) {
      try { await updateCustom(mine.id, { ...mine, name: newName.trim() }); setCustom(await fetchCustom(myId)); } catch { /* name stays; history is renamed */ }
    }
    const r = await syncNow();
    const status = r.pending === 0 ? "synced" : r.offline ? "offline" : "failed";
    flash(syncMsg(status, `Renamed in ${changes.length} session${changes.length === 1 ? "" : "s"}`));
    return changes.length;
  };

  // ---- saved routines (v13) ----
  const saveAsRoutine = async (name, entries) => {
    try {
      const row = await saveRoutine(myId, { name: name.trim(), entries: toRoutineEntries(entries) });
      setRoutines((rs) => [...rs.filter((r) => r.name !== row.name), row].sort((a, b) => a.name.localeCompare(b.name)));
      setRoutinesReady(true);
      flash(`Routine “${row.name}” saved`);
      return true;
    } catch (e) {
      if (isMissingTable(e)) { setRoutinesReady(false); flash("Routines need a one-time database update"); }
      else flash("Couldn’t save the routine — are you online?");
      return false;
    }
  };
  const removeRoutine = async (id) => {
    try { await deleteRoutine(id); setRoutines((rs) => rs.filter((r) => r.id !== id)); flash("Routine deleted"); }
    catch { flash("Couldn’t delete — are you online?"); }
  };

  const addCustom = async (c) => {
    setCustom((cs) => [...cs.filter((x) => norm(x.name) !== norm(c.name)), c]);
    try { await insertCustom(myId, c); } catch { flash("Couldn’t sync custom exercise"); }
  };
  const editCustom = async (id, c) => {
    try { await updateCustom(id, c); flash("Exercise updated"); }
    catch { flash("Couldn’t update — are you online?"); throw new Error("failed"); }
    setCustom(await fetchCustom(myId));
  };
  const removeCustom = async (id) => {
    try { await deleteCustom(id); flash("Exercise deleted"); }
    catch { flash("Couldn’t delete — are you online?"); throw new Error("failed"); }
    setCustom(await fetchCustom(myId));
  };

  const saveProfileEdits = async ({ displayName, email }) => {
    if (displayName && displayName !== profile.display_name) {
      await updateDisplayName(myId, displayName);
      setProfile((p) => ({ ...p, display_name: displayName }));
    }
    if (email) await updateEmail(email); // triggers Supabase confirmation flow
  };

  const togglePrivacy = async (isPrivate) => {
    setProfile((p) => ({ ...p, is_private: isPrivate }));
    try { await updatePrivacy(myId, isPrivate); flash(isPrivate ? "Profile is now private" : "Profile is now visible to the crew"); }
    catch { setProfile((p) => ({ ...p, is_private: !isPrivate })); flash("Couldn’t update privacy"); }
  };

  if (!loaded && !loadErr) return <LoadingScreen theme={theme} label="Fetching your training log" />;
  if (loadErr) return (
    <Shell theme={theme}>
      <div className="wt-confirm-wrap">
        <div className="wt-eyebrow">Connection trouble</div>
        <h2 className="wt-confirm-title">Couldn’t load your log</h2>
        <p className="wt-confirm-body">{loadErr}</p>
        <div className="wt-confirm-actions">
          <button className="wt-primary" onClick={() => location.reload()}>Retry</button>
          <button className="wt-ghost" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </Shell>
  );

  return (
    <Shell theme={theme}>
      <header className="wt-header">
        <h1 className="wt-title">IRONBOOK</h1>
        <div className="wt-header-right">
          <button className="wt-theme-btn" onClick={onToggleTheme} aria-label="Toggle dark or light mode">{theme === "dark" ? "☀" : "☾"}</button>
          <div className="wt-unit" role="group" aria-label="Weight unit">
            {["kg", "lbs"].map((u) => (
              <button key={u} className={"wt-unit-btn" + (unit === u ? " on" : "")} onClick={() => setUnit(u)}>{u}</button>
            ))}
          </div>
          <button className="wt-me" onClick={() => { setTab("more"); setMoreView("settings"); }}
            aria-label={`${profile.display_name} — open Settings`} title={profile.display_name}>
            {(profile.display_name || "?").trim()[0].toUpperCase()}
          </button>
        </div>
      </header>


      {tab === "log" && (
        <LogView unit={unit} draft={draft} setDraft={setDraft} editing={editing} setEditing={setEditing}
          workouts={workouts} registry={registry}
          onFinish={finishWorkout} onSaveEdit={saveEditedWorkout} onAddCustom={addCustom} onSetDone={startRest}
          routines={routines} routinesReady={routinesReady} onSaveRoutine={saveAsRoutine} onDeleteRoutine={removeRoutine}
          effortReady={effortReady} />
      )}
      {tab === "history" && (
        <HistoryView unit={unit} workouts={workouts} who={profile.display_name} flash={flash}
          onDelete={removeWorkout} onEdit={(w) => { setEditing(w); setTab("log"); }}
          routines={routines} routinesReady={routinesReady} onSaveRoutine={saveAsRoutine} />
      )}
      {tab === "crew" && (
        <>
          <div className="wt-seg wt-crew-seg" role="tablist" aria-label="Crew">
            {[["friends", "Friends"], ["calendar", "Calendar"]].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={crewView === id} className={"wt-seg-btn" + (crewView === id ? " on" : "")}
                onClick={() => setCrewView(id)}>{label}</button>
            ))}
          </div>
          {crewView === "friends"
            ? <FriendsView myId={myId} unit={unit} />
            : <CalendarView myId={myId} myName={profile.display_name} myWorkouts={workouts} />}
        </>
      )}
      {tab === "progress" && (
        <ProgressView workouts={workouts} unit={unit} registry={registry} exKey={progressKey} setExKey={setProgressKey} myId={myId} />
      )}
      {tab === "more" && !moreView && <MoreView onOpen={setMoreView} />}
      {tab === "more" && moreView && (
        <button className="wt-ghost back wt-more-back" onClick={() => setMoreView(null)}>← More</button>
      )}
      {tab === "more" && moreView === "library" && (
        <ExercisesView registry={registry} workouts={workouts} unit={unit} flash={flash}
          myId={myId} onAddCustom={addCustom} onEditCustom={editCustom} onDeleteCustom={removeCustom} onRename={renameExercise}
          onShowProgress={(name) => { setProgressKey(norm(name)); setTab("progress"); }} />
      )}
      {tab === "more" && moreView === "settings" && (
        <SettingsView flash={flash} theme={theme}
          profile={profile} email={session.user.email} onSaveProfile={saveProfileEdits} onTogglePrivacy={togglePrivacy} />
      )}

      {rest && <RestTimer key={rest.endsAt} rest={rest} onAdjust={adjustRest} onClose={() => saveRest(null)} />}
      <BottomNav tab={tab} onTab={onTab} />
      {toast && <div className="wt-toast">{toast}</div>}
    </Shell>
  );
}
