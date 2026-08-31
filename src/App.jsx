import { useState, useEffect, useMemo, useRef } from "react";
import { EXDB } from "./exdb.js";
import { SEED } from "./seed.js";
import {
  configured, getSession, onAuthChange, signIn, signUp, signOut, updatePassword,
  fetchMyProfile, fetchProfiles, updateUnit, updateDisplayName, updateEmail,
  fetchWorkouts, insertWorkout, updateWorkout, deleteWorkout,
  fetchCustom, fetchAllCustom, insertCustom, updateCustom, deleteCustom,
} from "./db.js";

// ============ CONSTANTS ============
const KG_PER_LB = 0.45359237;
const IMG_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";
const COMMON_DAYS = ["push", "pull", "legs", "upper", "lower", "full body", "chest day", "back day", "leg day", "arms day", "shoulders day"];
const THEME_KEY = "ironbook:theme";
const draftKey = (uid) => `ironbook:draft:${uid}`;
const queueKey = (uid) => `ironbook:queue:${uid}`;

// Muscle -> region + competition-plate color
const MUSCLE_META = {
  quadriceps: ["Legs", "#D64545"], hamstrings: ["Legs", "#D64545"], glutes: ["Legs", "#D64545"],
  calves: ["Legs", "#D64545"], adductors: ["Legs", "#D64545"], abductors: ["Legs", "#D64545"],
  chest: ["Chest", "#3B6FD6"],
  lats: ["Back", "#3F9E62"], "middle back": ["Back", "#3F9E62"], "lower back": ["Back", "#3F9E62"], traps: ["Back", "#3F9E62"],
  shoulders: ["Shoulders", "#E8C547"],
  biceps: ["Arms", "#C9CDD4"], triceps: ["Arms", "#C9CDD4"], forearms: ["Arms", "#C9CDD4"],
  abdominals: ["Core", "#8A8F98"], neck: ["Other", "#8A8F98"], other: ["Other", "#8A8F98"],
};
const muscleColor = (m) => (MUSCLE_META[m] || MUSCLE_META.other)[1];
const muscleRegion = (m) => (MUSCLE_META[m] || MUSCLE_META.other)[0];

// ============ HELPERS ============
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};
const daysAgo = (d) => {
  const diff = Math.round((new Date(todayStr()) - new Date(d)) / 86400000);
  if (diff === 0) return "today"; if (diff === 1) return "yesterday"; return `${diff}d ago`;
};
const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
const uid = () => Math.random().toString(36).slice(2, 9);

const kgToDisplay = (kg, unit) => {
  if (kg == null || kg === "") return "";
  const v = unit === "lbs" ? kg / KG_PER_LB : kg;
  return Math.round(v * 100) / 100;
};
const displayToKg = (val, unit) => {
  if (val === "" || val == null || isNaN(val)) return null;
  const v = parseFloat(val);
  return unit === "lbs" ? Math.round(v * KG_PER_LB * 100) / 100 : v;
};
const setLine = (s, unit) => {
  const w = s.weight != null ? `${kgToDisplay(s.weight, unit)}` : "bw";
  return `${w}×${s.reps || "–"}`;
};

// localStorage JSON helpers (fine outside Claude artifacts)
const lsGet = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full/blocked */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

// ============ EXERCISE REGISTRY ============
function buildRegistry(customExercises, workouts) {
  const map = new Map();
  for (const w of workouts) for (const e of w.entries) {
    const k = norm(e.exercise);
    if (!map.has(k)) map.set(k, { name: e.exercise, muscle: e.muscle || "other", equipment: "", img: "", source: "log" });
  }
  for (const c of customExercises) {
    map.set(norm(c.name), { name: c.name, muscle: c.muscle, equipment: c.equipment || "", img: "", source: "custom" });
  }
  for (const [name, muscle, equipment, img] of EXDB) {
    const k = norm(name);
    if (!map.has(k)) map.set(k, { name, muscle, equipment, img: img || "", source: "db" });
    else if (img && !map.get(k).img) map.get(k).img = img;
  }
  return map;
}

function lastPerformance(workouts, exName, excludeId) {
  const k = norm(exName);
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) {
    if (w.id === excludeId) continue;
    const entry = w.entries.find((e) => norm(e.exercise) === k);
    if (entry && entry.sets.some((s) => s.weight != null || s.reps)) return { date: w.date, day: w.name, sets: entry.sets };
  }
  return null;
}

function similarPerformances(workouts, registry, exName, excludeId, limit = 4) {
  const k = norm(exName);
  const meta = registry.get(k);
  const muscle = meta ? meta.muscle : "other";
  const seen = new Set([k]);
  const out = [];
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) {
    if (w.id === excludeId) continue;
    for (const e of w.entries) {
      const ek = norm(e.exercise);
      if (seen.has(ek)) continue;
      const em = registry.get(ek);
      const emu = em ? em.muscle : e.muscle;
      if (emu !== muscle) continue;
      if (!e.sets.some((s) => s.weight != null || s.reps)) continue;
      seen.add(ek);
      out.push({ exercise: e.exercise, date: w.date, sets: e.sets });
      if (out.length >= limit) return { muscle, items: out };
    }
  }
  return { muscle, items: out };
}

// ============ EXCEL EXPORT ============
async function exportToExcel(workouts, unit, who) {
  const XLSX = await import("xlsx"); // loaded on demand — keeps the main bundle small
  const wb = XLSX.utils.book_new();
  const byDay = {};
  [...workouts].sort((a, b) => a.date.localeCompare(b.date)).forEach((w) => {
    (byDay[w.name] = byDay[w.name] || []).push(w);
  });
  for (const [day, sessions] of Object.entries(byDay)) {
    const dates = sessions.map((s) => s.date);
    const exOrder = []; const maxSets = {};
    sessions.forEach((s) => s.entries.forEach((e) => {
      const k = norm(e.exercise);
      if (!maxSets[k]) { exOrder.push({ k, name: e.exercise }); maxSets[k] = 0; }
      maxSets[k] = Math.max(maxSets[k], e.sets.length);
    }));
    const header1 = ["exercise"]; const header2 = [""];
    dates.forEach((d) => { header1.push(d, ""); header2.push(`weight (${unit})`, "reps"); });
    const rows = [header1, header2];
    exOrder.forEach(({ k, name }) => {
      for (let i = 0; i < maxSets[k]; i++) {
        const row = [name];
        sessions.forEach((s) => {
          const e = s.entries.find((x) => norm(x.exercise) === k);
          const set = e && e.sets[i];
          row.push(set && set.weight != null ? kgToDisplay(set.weight, unit) : "", set && set.reps ? set.reps : "");
        });
        rows.push(row);
      }
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 26 }, ...dates.flatMap(() => [{ wch: 11 }, { wch: 7 }])];
    const safe = day.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "workout";
    XLSX.utils.book_append_sheet(wb, ws, safe);
  }
  XLSX.writeFile(wb, `ironbook-${who.toLowerCase().replace(/\s+/g, "-")}-${todayStr()}.xlsx`);
}

// ============ APP ============
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [theme, setTheme] = useState(() => (lsGet(THEME_KEY, "dark") === "light" ? "light" : "dark"));
  const toggleTheme = () => setTheme((t) => { const n = t === "dark" ? "light" : "dark"; lsSet(THEME_KEY, n); return n; });

  useEffect(() => {
    if (!configured) return;
    getSession().then(setSession);
    return onAuthChange(setSession);
  }, []);

  if (!configured) return (
    <Shell theme={theme}>
      <div className="wt-confirm-wrap">
        <div className="wt-eyebrow">Setup needed</div>
        <h2 className="wt-confirm-title">Supabase isn’t configured</h2>
        <p className="wt-confirm-body">Copy <strong>.env.example</strong> to <strong>.env</strong>, fill in your Supabase URL and anon key, then restart. See SETUP.md.</p>
      </div>
    </Shell>
  );
  if (session === undefined) return <LoadingScreen theme={theme} label="Opening Ironbook" />;
  if (!session) return <AuthScreen theme={theme} onToggleTheme={toggleTheme} />;
  return <MainApp key={session.user.id} session={session} theme={theme} onToggleTheme={toggleTheme} />;
}

function Shell({ theme, children }) {
  return <div className={"wt-root theme-" + theme}><style>{CSS}</style>{children}</div>;
}

// ============ AUTH SCREEN ============
function AuthScreen({ theme, onToggleTheme }) {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      if (mode === "signup") {
        if (name.trim().length < 2) throw new Error("Pick a display name (2+ characters).");
        if (pw.length < 6) throw new Error("Password must be at least 6 characters.");
        await signUp(email.trim(), pw, name.trim());
      } else {
        await signIn(email.trim(), pw);
      }
    } catch (e) {
      setErr(e.message || "Something went wrong.");
    } finally { setBusy(false); }
  };

  return (
    <Shell theme={theme}>
      <button className="wt-theme-btn corner" onClick={onToggleTheme} aria-label="Toggle dark or light mode">{theme === "dark" ? "☀" : "☾"}</button>
      <div className="wt-profile-wrap">
        <div className="wt-eyebrow">Training log</div>
        <h1 className="wt-title">IRONBOOK</h1>
        <p className="wt-profile-sub">{mode === "signin" ? "Welcome back" : "Join the crew"}</p>
        <div className="wt-form auth">
          {mode === "signup" && (
            <label>Display name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Srijan" autoComplete="nickname" /></label>
          )}
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" /></label>
          <label>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            onKeyDown={(e) => e.key === "Enter" && submit()} /></label>
          {err && <div className="wt-err">{err}</div>}
          <button className="wt-primary" disabled={busy || !email || !pw} onClick={submit}>
            {busy ? "One sec…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
          <button className="wt-ghost" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(""); }}>
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </Shell>
  );
}

// ============ MAIN APP (signed in) ============
function MainApp({ session, theme, onToggleTheme }) {
  const myId = session.user.id;
  const [profile, setProfile] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [custom, setCustom] = useState([]);
  const [draft, setDraft] = useState(() => lsGet(draftKey(myId), null));
  const [editing, setEditing] = useState(null); // a saved workout being edited (full object incl. id)
  const [tab, setTab] = useState("log");
  const [toast, setToast] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [minWait, setMinWait] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const unit = profile ? profile.unit : "kg";
  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  // Initial load: profile + my workouts + my customs, min 3s loading screen
  useEffect(() => {
    const minTimer = new Promise((res) => setTimeout(res, 3000));
    (async () => {
      try {
        const [p, ws, cs] = await Promise.all([fetchMyProfile(myId), fetchWorkouts(myId), fetchCustom(myId)]);
        await flushQueue(myId, setWorkouts); // push any offline-saved sessions first
        const fresh = await fetchWorkouts(myId);
        await minTimer;
        setProfile(p); setWorkouts(fresh.length ? fresh : ws); setCustom(cs);
        setLoaded(true);
      } catch (e) {
        await minTimer;
        setLoadErr(e.message || "Couldn’t load your data. Check your connection and refresh.");
      } finally { setMinWait(true); }
    })();
  }, [myId]);

  // Persist draft locally so a mid-workout refresh loses nothing
  useEffect(() => { draft ? lsSet(draftKey(myId), draft) : lsDel(draftKey(myId)); }, [draft, myId]);

  const registry = useMemo(() => buildRegistry(custom, workouts), [custom, workouts]);

  const setUnit = async (u) => {
    setProfile((p) => ({ ...p, unit: u }));
    try { await updateUnit(myId, u); } catch { flash("Couldn’t sync unit preference"); }
  };

  const finishWorkout = async (sessionData) => {
    setDraft(null);
    try {
      const saved = await insertWorkout(myId, sessionData);
      setWorkouts((ws) => [saved, ...ws]);
      flash("Workout saved"); setTab("history");
    } catch {
      const q = lsGet(queueKey(myId), []);
      lsSet(queueKey(myId), [...q, sessionData]);
      setWorkouts((ws) => [{ ...sessionData, id: "local-" + uid(), pendingSync: true }, ...ws]);
      flash("Saved offline — will sync next time you’re online"); setTab("history");
    }
  };

  const removeWorkout = async (id) => {
    if (String(id).startsWith("local-")) { setWorkouts((ws) => ws.filter((w) => w.id !== id)); return; }
    try { await deleteWorkout(id); setWorkouts((ws) => ws.filter((w) => w.id !== id)); flash("Session deleted"); }
    catch { flash("Couldn’t delete — are you online?"); }
  };

  const saveEditedWorkout = async (id, sessionData) => {
    try {
      const saved = await updateWorkout(id, sessionData);
      setWorkouts((ws) => ws.map((w) => (w.id === id ? saved : w)));
      setEditing(null); flash("Workout updated"); setTab("history");
    } catch { flash("Couldn’t save changes — are you online?"); }
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

  const importSeed = async () => {
    flash("Importing spreadsheet history…");
    try {
      for (const w of [...SEED].sort((a, b) => a.date.localeCompare(b.date))) {
        await insertWorkout(myId, { date: w.date, name: w.name, entries: w.entries });
      }
      setWorkouts(await fetchWorkouts(myId));
      flash("History imported");
    } catch { flash("Import failed partway — check connection and retry"); }
  };

  if (!minWait || (!loaded && !loadErr)) return <LoadingScreen theme={theme} label="Fetching your training log" />;
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
        <div>
          <div className="wt-eyebrow">Training log · {profile.display_name}</div>
          <h1 className="wt-title">IRONBOOK</h1>
        </div>
        <div className="wt-header-right">
          <button className="wt-theme-btn" onClick={onToggleTheme} aria-label="Toggle dark or light mode">{theme === "dark" ? "☀" : "☾"}</button>
          <div className="wt-unit" role="group" aria-label="Weight unit">
            {["kg", "lbs"].map((u) => (
              <button key={u} className={"wt-unit-btn" + (unit === u ? " on" : "")} onClick={() => setUnit(u)}>{u}</button>
            ))}
          </div>
        </div>
      </header>

      <nav className="wt-tabs">
        {[["log", "Log"], ["history", "History"], ["friends", "Friends"], ["exercises", "Library"], ["settings", "Settings"]].map(([id, label]) => (
          <button key={id} className={"wt-tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {tab === "log" && (
        <LogView unit={unit} draft={draft} setDraft={setDraft} editing={editing} setEditing={setEditing}
          workouts={workouts} registry={registry}
          onFinish={finishWorkout} onSaveEdit={saveEditedWorkout} onAddCustom={addCustom} />
      )}
      {tab === "history" && (
        <HistoryView unit={unit} workouts={workouts} who={profile.display_name} flash={flash}
          onDelete={removeWorkout} onEdit={(w) => { setEditing(w); setTab("log"); }} />
      )}
      {tab === "friends" && <FriendsView myId={myId} unit={unit} theme={theme} />}
      {tab === "exercises" && (
        <ExercisesView registry={registry} workouts={workouts} unit={unit} flash={flash}
          myId={myId} onAddCustom={addCustom} onEditCustom={editCustom} onDeleteCustom={removeCustom} />
      )}
      {tab === "settings" && (
        <SettingsView flash={flash} hasWorkouts={workouts.length > 0} onImportSeed={importSeed}
          profile={profile} email={session.user.email} onSaveProfile={saveProfileEdits} />
      )}

      {toast && <div className="wt-toast">{toast}</div>}
    </Shell>
  );
}

async function flushQueue(myId, setWorkouts) {
  const q = lsGet(queueKey(myId), []);
  if (!q.length) return;
  const remaining = [];
  for (const w of q) {
    try { await insertWorkout(myId, w); } catch { remaining.push(w); }
  }
  remaining.length ? lsSet(queueKey(myId), remaining) : lsDel(queueKey(myId));
}

// ============ FRIENDS ============
function FriendsView({ myId, unit, theme }) {
  const [profiles, setProfiles] = useState(null);
  const [sel, setSel] = useState(null); // selected friend profile
  const [friendWorkouts, setFriendWorkouts] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetchProfiles().then((ps) => setProfiles(ps.filter((p) => p.id !== myId))).catch(() => setErr("Couldn’t load the crew."));
  }, [myId]);

  const open = async (p) => {
    setSel(p); setFriendWorkouts(null);
    try { setFriendWorkouts(await fetchWorkouts(p.id)); } catch { setErr("Couldn’t load their log."); }
  };

  if (err) return <div className="wt-pane"><p className="wt-hint">{err}</p></div>;
  if (!profiles) return <div className="wt-pane"><p className="wt-hint">Loading the crew…</p></div>;
  if (profiles.length === 0) return <div className="wt-pane"><p className="wt-hint">No one else has joined yet. Send your friends the app link — once they sign up, their logs show here.</p></div>;

  if (sel) {
    return (
      <div className="wt-pane">
        <button className="wt-ghost back" onClick={() => { setSel(null); setFriendWorkouts(null); }}>← All friends</button>
        <div className="wt-friend-head">
          <span className="wt-avatar big">{sel.display_name[0].toUpperCase()}</span>
          <div>
            <div className="wt-friend-name">{sel.display_name}</div>
            <div className="wt-hint">{friendWorkouts ? `${friendWorkouts.length} sessions · read-only` : "Loading…"}</div>
          </div>
        </div>
        {friendWorkouts && <HistoryView unit={unit} workouts={friendWorkouts} who={sel.display_name} readOnly />}
      </div>
    );
  }

  return (
    <div className="wt-pane">
      <div className="wt-count">The crew</div>
      {profiles.map((p) => (
        <button key={p.id} className="wt-friend-row" onClick={() => open(p)}>
          <span className="wt-avatar">{p.display_name[0].toUpperCase()}</span>
          <span className="wt-friend-name">{p.display_name}</span>
          <span className="wt-hint">View log →</span>
        </button>
      ))}
    </div>
  );
}

// ============ LOG VIEW ============
function LogView({ unit, draft, setDraft, editing, setEditing, workouts, registry, onFinish, onSaveEdit, onAddCustom }) {
  const [picking, setPicking] = useState(false);
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

  if (!current) {
    return (
      <div className="wt-pane">
        <div className="wt-empty">
          <div className="wt-empty-big">Ready to lift?</div>
          <p>Pick today’s workout — every exercise you log shows what you did last time, plus how similar movements went.</p>
          <div className="wt-quickdays">
            {dayNames.slice(0, 11).map((n) => (
              <button key={n} className="wt-chip" onClick={() => setDraft({ id: uid(), date: todayStr(), name: n, entries: [] })}>{n}</button>
            ))}
          </div>
          <button className="wt-primary" onClick={() => setDraft({ id: uid(), date: todayStr(), name: dayNames[0] || "workout", entries: [] })}>
            Start workout
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
    const sets = last ? last.sets.map(() => ({ weight: null, reps: "" })) : [{ weight: null, reps: "" }];
    setCurrent((d) => ({ ...d, entries: [...d.entries.map((e) => ({ ...e, id: e.id || uid() })), { id: uid(), exercise: meta.name, muscle: meta.muscle, sets }] }));
    setPicking(false);
  };

  const cleaned = () => ({
    date: current.date, name: current.name,
    entries: entriesWithIds.map((e) => ({ exercise: e.exercise, muscle: e.muscle, sets: e.sets.filter((s) => s.weight != null || s.reps) })).filter((e) => e.sets.length > 0),
  });

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

      {entriesWithIds.length === 0 && <p className="wt-hint">No exercises yet. Add one to start logging sets.</p>}

      {entriesWithIds.map((entry) => (
        <EntryCard key={entry.id} entry={entry} unit={unit} workouts={workouts} registry={registry} draftId={current.id}
          onChange={(fn) => updateEntry(entry.id, fn)} onRemove={() => removeEntry(entry.id)} />
      ))}

      <button className="wt-secondary wide" onClick={() => setPicking(true)}>+ Add exercise</button>

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

      {picking && <ExercisePicker registry={registry} workouts={workouts} onPick={addExercise} onClose={() => setPicking(false)} onAddCustom={onAddCustom} />}
    </div>
  );
}

// ============ EXERCISE DEMO ANIMATION ============
function ExerciseAnim({ imgId, name }) {
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

// ============ LOADING SCREEN ============
const QUIPS = [
  "Chalking up…", "Loading the plates…", "Un-racking the bar…", "Warming up the rotator cuffs…",
  "Finding a free bench…", "Filling the water bottle…", "Queuing the hype playlist…",
  "Tightening the lifting belt…", "Counting: one more rep…", "Wiping down the machine…",
];
function LoadingScreen({ label, theme = "dark" }) {
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

// ============ ENTRY CARD ============
function EntryCard({ entry, unit, workouts, registry, draftId, onChange, onRemove }) {
  const last = useMemo(() => lastPerformance(workouts, entry.exercise, draftId), [workouts, entry.exercise, draftId]);
  const similar = useMemo(() => similarPerformances(workouts, registry, entry.exercise, draftId), [workouts, registry, entry.exercise, draftId]);
  const [showSimilar, setShowSimilar] = useState(true);
  const [showDemo, setShowDemo] = useState(false);
  const color = muscleColor(entry.muscle);
  const meta = registry.get(norm(entry.exercise));
  const imgId = meta && meta.img;

  const setSet = (i, field, val) => onChange((e) => {
    const sets = e.sets.map((s, j) => (j === i ? { ...s, [field]: field === "weight" ? displayToKg(val, unit) : val } : s));
    return { ...e, sets };
  });
  const addSet = () => onChange((e) => {
    const prev = e.sets[e.sets.length - 1];
    return { ...e, sets: [...e.sets, prev ? { ...prev } : { weight: null, reps: "" }] };
  });
  const dropSet = (i) => onChange((e) => ({ ...e, sets: e.sets.filter((_, j) => j !== i) }));

  return (
    <div className="wt-card" style={{ "--plate": color }}>
      <div className="wt-card-head">
        <span className="wt-plate" aria-hidden="true" />
        <div className="wt-card-titlewrap">
          <div className="wt-card-title">{entry.exercise}</div>
          <div className="wt-card-sub">{entry.muscle} · {muscleRegion(entry.muscle)}</div>
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
          <span className="wt-lt-sets">{last.sets.map((s) => setLine(s, unit)).join("  ·  ")} <em>{unit}</em></span>
        </div>
      ) : (
        <div className="wt-lasttime none">First time logging this — set your baseline.</div>
      )}

      <div className="wt-sets">
        <div className="wt-sets-head"><span>Set</span><span>Weight ({unit})</span><span>Reps</span><span /></div>
        {entry.sets.map((s, i) => (
          <div className="wt-set-row" key={i}>
            <span className="wt-set-n">{i + 1}</span>
            <input inputMode="decimal" placeholder={last && last.sets[i] && last.sets[i].weight != null ? String(kgToDisplay(last.sets[i].weight, unit)) : "–"}
              value={s.weight != null ? kgToDisplay(s.weight, unit) : ""} onChange={(e) => setSet(i, "weight", e.target.value)} aria-label={`Set ${i + 1} weight`} />
            <input inputMode="numeric" placeholder={last && last.sets[i] ? (last.sets[i].reps || "–") : "e.g. 8 or 6,6"}
              value={s.reps || ""} onChange={(e) => setSet(i, "reps", e.target.value)} aria-label={`Set ${i + 1} reps`} />
            <button className="wt-x dim" onClick={() => dropSet(i)} aria-label={`Remove set ${i + 1}`}>✕</button>
          </div>
        ))}
        <button className="wt-ghost small" onClick={addSet}>+ Add set</button>
      </div>

      {similar.items.length > 0 && (
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

// ============ EXERCISE PICKER ============
function ExercisePicker({ registry, workouts, onPick, onClose, onAddCustom }) {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("All");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);
  const regions = ["All", "Chest", "Back", "Legs", "Shoulders", "Arms", "Core"];

  const recent = useMemo(() => {
    const seen = new Set(); const out = [];
    [...workouts].sort((a, b) => b.date.localeCompare(a.date)).forEach((w) => w.entries.forEach((e) => {
      const k = norm(e.exercise);
      if (!seen.has(k)) { seen.add(k); out.push(registry.get(k) || { name: e.exercise, muscle: e.muscle }); }
    }));
    return out;
  }, [workouts, registry]);

  const { mine, db } = useMemo(() => {
    const nq = norm(q);
    const rank = (name) => (norm(name).startsWith(nq) ? 0 : 1);
    const inRegion = (m) => region === "All" || muscleRegion(m.muscle) === region;
    const mine = [], db = [];
    for (const meta of registry.values()) {
      if (!inRegion(meta)) continue;
      if (nq && !norm(meta.name).includes(nq)) continue;
      (meta.source === "db" ? db : mine).push(meta);
    }
    const cmp = (a, b) => (nq ? rank(a.name) - rank(b.name) : 0) || a.name.length - b.name.length || a.name.localeCompare(b.name);
    mine.sort(cmp); db.sort(cmp);
    return { mine: mine.slice(0, 25), db: db.slice(0, 40) };
  }, [q, region, registry]);

  const showBrowse = q === "" && region === "All";
  const nothing = !showBrowse && mine.length === 0 && db.length === 0;

  return (
    <div className="wt-modal-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wt-modal" role="dialog" aria-label="Add exercise">
        {!adding ? (
          <>
            <div className="wt-modal-head">
              <input ref={inputRef} className="wt-search" placeholder="Search 870+ exercises…" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="wt-x" onClick={onClose} aria-label="Close">✕</button>
            </div>
            <div className="wt-regions pad-v">
              {regions.map((r) => <button key={r} className={"wt-chip sm" + (region === r ? " on" : "")} onClick={() => setRegion(r)}>{r}</button>)}
            </div>
            <div className="wt-picker-list">
              {showBrowse ? (
                recent.length > 0 ? (<>
                  <div className="wt-picker-label">Your recent exercises</div>
                  {recent.slice(0, 14).map((m) => <PickRow key={m.name} m={m} onPick={onPick} />)}
                  <div className="wt-hint pad">Search above or pick a muscle group to browse the full database.</div>
                </>) : (
                  <div className="wt-hint pad">Search above or pick a muscle group to browse the database, then select an exercise from the list.</div>
                )
              ) : (<>
                {mine.length > 0 && (<>
                  <div className="wt-picker-label">Your exercises</div>
                  {mine.map((m) => <PickRow key={m.name} m={m} onPick={onPick} />)}
                </>)}
                {db.length > 0 && (<>
                  <div className="wt-picker-label">Exercise database</div>
                  {db.map((m) => <PickRow key={m.name} m={m} onPick={onPick} />)}
                </>)}
                {nothing && (
                  <div className="wt-nomatch">
                    <div>No match for “{q}”{region !== "All" ? ` in ${region}` : ""}.</div>
                    <button className="wt-primary" onClick={() => setAdding(true)}>Create it as a custom exercise</button>
                  </div>
                )}
              </>)}
            </div>
            <button className="wt-createx" onClick={() => setAdding(true)}>✚ Create custom exercise</button>
          </>
        ) : (
          <>
            <div className="wt-modal-head">
              <div className="wt-picker-title">New custom exercise</div>
              <button className="wt-x" onClick={onClose} aria-label="Close">✕</button>
            </div>
            <CustomForm initialName={q} onCancel={() => setAdding(false)}
              onSave={(c) => { onAddCustom(c); setAdding(false); onPick(c); }} />
          </>
        )}
      </div>
    </div>
  );
}

function PickRow({ m, onPick }) {
  return (
    <button className="wt-pick-row" style={{ "--plate": muscleColor(m.muscle) }} onClick={() => onPick(m)}>
      <span className="wt-plate sm" aria-hidden="true" />
      <span className="wt-pick-name">{m.name}</span>
      <span className="wt-pick-meta">{m.muscle}{m.equipment ? ` · ${m.equipment}` : ""}{m.source === "custom" ? " · custom" : ""}</span>
    </button>
  );
}

function CustomForm({ initialName, initialMuscle, initialEquipment, saveLabel, onSave, onCancel }) {
  const [name, setName] = useState(initialName || "");
  const [muscle, setMuscle] = useState(initialMuscle || "chest");
  const [equipment, setEquipment] = useState(initialEquipment || "");
  const muscles = Object.keys(MUSCLE_META).filter((m) => m !== "other");
  return (
    <div className="wt-form">
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hammer curl (rope)" /></label>
      <label>Primary muscle
        <select value={muscle} onChange={(e) => setMuscle(e.target.value)}>
          {muscles.map((m) => <option key={m} value={m}>{m} — {muscleRegion(m)}</option>)}
        </select>
      </label>
      <label>Equipment (optional)<input value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="e.g. cable, dumbbell" /></label>
      <div className="wt-form-actions">
        <button className="wt-primary" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), muscle, equipment: equipment.trim(), source: "custom" })}>{saveLabel || "Save exercise"}</button>
        <button className="wt-ghost" onClick={onCancel}>Back</button>
      </div>
    </div>
  );
}

// ============ HISTORY ============
function HistoryView({ unit, workouts, onDelete, onEdit, who, flash, readOnly = false }) {
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
            <span className="wt-hist-name">{w.name}{w.pendingSync ? " · syncing…" : ""}</span>
            <span className="wt-hist-n">{w.entries.length} exercises</span>
          </button>
          {open === w.id && (
            <div className="wt-hist-body">
              {w.entries.map((e) => (
                <div className="wt-hist-row" key={e.id || e.exercise} style={{ "--plate": muscleColor(e.muscle) }}>
                  <span className="wt-plate sm" aria-hidden="true" />
                  <span className="wt-hist-ex">{e.exercise}</span>
                  <span className="wt-hist-sets">{e.sets.map((s) => setLine(s, unit)).join(" · ")} <em>{unit}</em></span>
                </div>
              ))}
              {!readOnly && (
                <div className="wt-hist-actions">
                  <button className="wt-ghost small" onClick={() => onEdit(w)}>✎ Edit session</button>
                  <button className="wt-ghost small danger" onClick={() => { if (confirm(`Delete session from ${fmtDate(w.date)}?`)) onDelete(w.id); }}>Delete session</button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============ EXERCISES LIBRARY ============
function ExercisesView({ registry, workouts, unit, flash, myId, onAddCustom, onEditCustom, onDeleteCustom }) {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("All");
  const [adding, setAdding] = useState(false);
  const [openEx, setOpenEx] = useState(null);
  const [allCustom, setAllCustom] = useState(null); // crew-wide customs with author
  const [editingId, setEditingId] = useState(null);
  const regions = ["All", "Chest", "Back", "Legs", "Shoulders", "Arms", "Core"];

  const loadCustoms = () => fetchAllCustom().then(setAllCustom).catch(() => setAllCustom([]));
  useEffect(() => { loadCustoms(); }, []);

  const list = useMemo(() => {
    const nq = norm(q);
    const out = [];
    for (const meta of registry.values()) {
      if (nq && !norm(meta.name).includes(nq)) continue;
      if (region !== "All" && muscleRegion(meta.muscle) !== region) continue;
      out.push(meta);
      if (out.length >= 120) break;
    }
    out.sort((a, b) => (a.source === "db" ? 1 : 0) - (b.source === "db" ? 1 : 0) || a.name.localeCompare(b.name));
    return out;
  }, [q, region, registry]);

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
                    <span className="wt-pick-meta">{c.muscle}{c.equipment ? ` · ${c.equipment}` : ""} · added by {c.user_id === myId ? "you" : c.author}</span>
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
      <div className="wt-regions">
        {regions.map((r) => <button key={r} className={"wt-chip" + (region === r ? " on" : "")} onClick={() => setRegion(r)}>{r}</button>)}
      </div>
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
                  <span className="wt-pick-meta">{m.muscle}{m.equipment ? ` · ${m.equipment}` : ""}{m.source === "custom" ? " · custom" : ""}{m.img ? " · ▶ demo" : ""}</span>
                </div>
                {last && <span className="wt-lib-last">{last.sets.slice(0, 3).map((s) => setLine(s, unit)).join(" · ")}<br /><em>{daysAgo(last.date)}</em></span>}
              </button>
              {isOpen && (m.img ? <ExerciseAnim imgId={m.img} name={m.name} /> : <div className="wt-anim-err">No demo images for this one{m.source === "custom" ? " — custom exercises don’t have demos yet" : ""}.</div>)}
            </div>
          );
        })}
        {list.length === 0 && <div className="wt-hint pad">Nothing matches. Try another search or create it as a custom exercise.</div>}
      </div>
    </div>
  );
}

// ============ SETTINGS ============
function SettingsView({ flash, hasWorkouts, onImportSeed, profile, email, onSaveProfile }) {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Profile edit state
  const [name, setName] = useState(profile.display_name);
  const [newEmail, setNewEmail] = useState(email || "");
  const [pErr, setPErr] = useState("");
  const [pBusy, setPBusy] = useState(false);

  const nameChanged = name.trim() && name.trim() !== profile.display_name;
  const emailChanged = newEmail.trim() && newEmail.trim() !== (email || "");

  const saveProfile = async () => {
    setPErr("");
    if (name.trim().length < 2) { setPErr("Display name must be at least 2 characters."); return; }
    setPBusy(true);
    try {
      await onSaveProfile({ displayName: nameChanged ? name.trim() : null, email: emailChanged ? newEmail.trim() : null });
      flash(emailChanged ? "Saved — check your email to confirm the new address" : "Profile updated");
    } catch (e) { setPErr(e.message || "Couldn’t save changes."); }
    finally { setPBusy(false); }
  };

  const submit = async () => {
    setErr("");
    if (next.length < 6) { setErr("New password must be at least 6 characters."); return; }
    if (next !== confirm) { setErr("New passwords don’t match."); return; }
    setBusy(true);
    try {
      await updatePassword(next);
      setNext(""); setConfirm("");
      flash("Password updated");
    } catch (e) { setErr(e.message || "Couldn’t update password."); }
    finally { setBusy(false); }
  };

  return (
    <div className="wt-pane">
      <div className="wt-settings-block">
        <div className="wt-settings-title">Profile</div>
        <div className="wt-form">
          <label>Display name<input value={name} onChange={(e) => { setName(e.target.value); setPErr(""); }} autoComplete="nickname" /></label>
          <label>Email<input type="email" value={newEmail} onChange={(e) => { setNewEmail(e.target.value); setPErr(""); }} autoComplete="email" inputMode="email" /></label>
          {emailChanged && <p className="wt-hint">Changing your email sends a confirmation link to the new address; it takes effect once you click it.</p>}
          {pErr && <div className="wt-err">{pErr}</div>}
          <div className="wt-form-actions">
            <button className="wt-primary" disabled={(!nameChanged && !emailChanged) || pBusy} onClick={saveProfile}>{pBusy ? "Saving…" : "Save profile"}</button>
          </div>
        </div>
      </div>

      <div className="wt-settings-block">
        <div className="wt-settings-title">Change password</div>
        <div className="wt-form">
          <label>New password<input type="password" autoComplete="new-password" value={next} onChange={(e) => { setNext(e.target.value); setErr(""); }} /></label>
          <label>Confirm new password<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setErr(""); }} /></label>
          {err && <div className="wt-err">{err}</div>}
          <div className="wt-form-actions">
            <button className="wt-primary" disabled={!next || !confirm || busy} onClick={submit}>{busy ? "Saving…" : "Update password"}</button>
          </div>
        </div>
      </div>

      {!hasWorkouts && (
        <div className="wt-settings-block">
          <div className="wt-settings-title">Import spreadsheet history</div>
          <p className="wt-hint">One-time import of the original Workout_tracking.xlsx sessions (May–Aug 2026). Intended for Srijan — it will add that history to <em>your</em> log.</p>
          <button className="wt-secondary wide" onClick={onImportSeed}>Import history</button>
        </div>
      )}

      <div className="wt-settings-block">
        <div className="wt-settings-title">Account</div>
        <button className="wt-ghost danger" onClick={signOut}>Sign out</button>
      </div>
    </div>
  );
}

// ============ STYLES ============
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600&display=swap');
.wt-root{font-family:'Barlow',-apple-system,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;
  max-width:560px;margin:0 auto;padding:16px 14px 60px;box-sizing:border-box;position:relative}
.wt-root.theme-dark{--bg:#121018;--panel:#1C1926;--panel2:#241F30;--line:#332C44;--text:#EDEAF3;--dim:#9C93AE;
  --accent:#5F3687;--accent-soft:#7E52B5;--accent-ink:#F5F3FB;color-scheme:dark}
.wt-root.theme-light{--bg:#F7F5FB;--panel:#FFFFFF;--panel2:#F1EDF9;--line:#DDD5EE;--text:#17131F;--dim:#6B6380;
  --accent:#5F3687;--accent-soft:#7A55A6;--accent-ink:#FFFFFF;color-scheme:light}
.wt-root *{box-sizing:border-box}
.wt-header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px}
.wt-eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim)}
.wt-title{font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-weight:700;font-size:34px;line-height:1;margin:2px 0 0;letter-spacing:.04em}
.wt-title::after{content:'';display:block;width:44px;height:4px;background:var(--accent);margin-top:6px}
.wt-theme-btn{background:var(--panel);border:1px solid var(--line);color:var(--text);border-radius:8px;width:34px;height:34px;font-size:15px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex:none}
.wt-theme-btn:hover{border-color:var(--accent)}
.wt-theme-btn.corner{position:absolute;top:16px;right:16px}
.wt-header-right{display:flex;align-items:center;gap:8px}
.wt-editbar{display:flex;align-items:center;justify-content:space-between;background:var(--panel2);border:1px solid var(--accent);border-radius:10px;padding:8px 12px;font-size:13px;color:var(--text)}
.wt-hist-actions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
.wt-custlist{display:flex;flex-direction:column;gap:2px;margin-top:8px}
.wt-cust-row{display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid var(--line)}
.wt-cust-actions{display:flex;gap:2px;flex:none}
.wt-cust-edit{border:1px solid var(--accent);border-radius:10px;padding:4px 8px;margin:4px 0}
.wt-settings-block{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px}
.wt-settings-title{font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700;margin-bottom:6px}
.wt-err{color:#D67B7B;font-size:13px}
.wt-err.center{text-align:center;width:auto}
.wt-unit{display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.wt-unit-btn{background:transparent;border:0;color:var(--dim);padding:7px 13px;font:inherit;font-weight:600;cursor:pointer}
.wt-unit-btn.on{background:var(--accent);color:var(--accent-ink)}
.wt-tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);margin-bottom:16px;overflow-x:auto}
.wt-tab{background:none;border:0;color:var(--dim);font:inherit;font-weight:600;padding:10px 11px;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}
.wt-tab.on{color:var(--text);border-bottom-color:var(--accent)}
.wt-pane{display:flex;flex-direction:column;gap:12px}
.wt-empty{text-align:center;padding:36px 12px;display:flex;flex-direction:column;gap:12px;align-items:center}
.wt-empty-big{font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:700}
.wt-empty p{color:var(--dim);margin:0;max-width:34ch}
.wt-quickdays{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:6px}
.wt-chip{background:var(--panel);border:1px solid var(--line);color:var(--text);border-radius:999px;padding:7px 14px;font:inherit;cursor:pointer}
.wt-chip.on{border-color:var(--accent);color:var(--accent)}
.wt-chip.sm{padding:5px 11px;font-size:13px}
.wt-primary{background:var(--accent);color:var(--accent-ink);border:0;border-radius:10px;padding:13px 22px;font:inherit;font-weight:700;font-size:16px;cursor:pointer}
.wt-primary:disabled{opacity:.4;cursor:default}
.wt-secondary{background:var(--panel);border:1px dashed var(--line);color:var(--text);border-radius:10px;padding:12px;font:inherit;font-weight:600;cursor:pointer}
.wt-secondary.wide{width:100%}
.wt-ghost{background:none;border:0;color:var(--dim);font:inherit;cursor:pointer;padding:8px}
.wt-ghost.small{font-size:13px;padding:6px}
.wt-ghost.danger{color:#D67B7B}
.wt-ghost.back{align-self:flex-start;padding-left:0}
.wt-hint{color:var(--dim);font-size:14px}.wt-hint.pad{padding:14px}
.wt-session-head{display:flex;gap:8px}
.wt-session-name{flex:1;background:var(--panel);border:1px solid var(--line);border-radius:10px;color:var(--text);
  font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;padding:8px 12px;min-width:0}
.wt-session-date{background:var(--panel);border:1px solid var(--line);border-radius:10px;color:var(--text);font:inherit;padding:8px 10px}
.wt-session-actions{display:flex;gap:10px;align-items:center;margin-top:4px}
.wt-card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 12px 10px;position:relative}
.wt-plate{width:16px;height:16px;border-radius:50%;background:var(--plate);flex:none;position:relative}
.wt-plate::after{content:'';position:absolute;inset:5px;border-radius:50%;background:var(--panel)}
.wt-plate.sm{width:12px;height:12px}.wt-plate.sm::after{inset:4px}
.wt-card-head{display:flex;align-items:center;gap:10px}
.wt-card-titlewrap{flex:1;min-width:0}
.wt-card-title{font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700;text-transform:capitalize}
.wt-card-sub{font-size:12px;color:var(--dim);text-transform:capitalize}
.wt-x{background:none;border:0;color:var(--dim);cursor:pointer;font-size:14px;padding:6px}
.wt-x.dim{opacity:.55}
.wt-demo-btn{background:none;border:1px solid var(--line);border-radius:999px;color:var(--dim);font:inherit;font-size:12px;font-weight:600;padding:5px 10px;cursor:pointer;flex:none;white-space:nowrap}
.wt-demo-btn.on,.wt-demo-btn:hover{border-color:var(--plate);color:var(--text)}
.wt-anim{position:relative;margin:10px 0 4px;border-radius:10px;overflow:hidden;background:#fff;aspect-ratio:16/9;max-height:230px}
.wt-anim-frame{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .35s ease}
.wt-anim-frame.show{opacity:1}
.wt-anim-badge{position:absolute;top:8px;left:8px;background:rgba(18,16,24,.85);color:#EDEAF3;font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:4px 9px;border-radius:999px}
.wt-anim-step{position:absolute;bottom:8px;right:8px;background:rgba(18,16,24,.85);color:#EDEAF3;border:0;border-radius:999px;width:32px;height:32px;font-size:15px;cursor:pointer}
.wt-anim-err{margin:8px 0 4px;color:var(--dim);font-size:13px;background:var(--panel2);border-radius:8px;padding:10px}
@media (prefers-reduced-motion:reduce){.wt-anim-frame{transition:none}}
.wt-loadscreen{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:90px 20px;text-align:center}
.wt-barbell{display:flex;align-items:center;gap:2px}
.wt-bb-bar{width:110px;height:6px;background:#9C93AE;border-radius:3px}
.wt-bb-plate{border-radius:3px;background:var(--accent)}
.wt-bb-plate.p1{width:9px;height:44px}
.wt-bb-plate.p2{width:9px;height:32px;background:#D64545}
@media (prefers-reduced-motion:no-preference){
  .wt-barbell{animation:wt-lift 1.5s ease-in-out infinite}
  @keyframes wt-lift{0%,100%{transform:translateY(10px)}45%,60%{transform:translateY(-12px)}52%{transform:translateY(-14px) rotate(-1.5deg)}}
}
.wt-load-quip{font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:600;min-height:28px}
.wt-load-label{color:var(--dim);font-size:13px}
.wt-lasttime{margin:10px 0 6px;background:var(--panel2);border-left:3px solid var(--plate);border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:2px}
.wt-lasttime.none{color:var(--dim);font-size:13px;border-left-color:var(--line)}
.wt-lt-label{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.wt-lt-sets{font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:600;letter-spacing:.02em}
.wt-lt-sets em,.wt-hist-sets em,.wt-lib-last em,.wt-sim-sets em{font-style:normal;color:var(--dim);font-size:12px}
.wt-sets{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.wt-sets-head{display:grid;grid-template-columns:28px 1fr 1fr 28px;gap:8px;font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.1em;padding:0 2px}
.wt-set-row{display:grid;grid-template-columns:28px 1fr 1fr 28px;gap:8px;align-items:center}
.wt-set-n{color:var(--dim);font-weight:600;text-align:center}
.wt-set-row input{background:var(--panel2);border:1px solid var(--line);border-radius:8px;color:var(--text);font:inherit;font-size:16px;padding:9px 10px;width:100%;min-width:0}
.wt-set-row input:focus,.wt-search:focus,.wt-session-name:focus{outline:2px solid var(--accent);outline-offset:0;border-color:transparent}
.wt-similar{margin-top:10px;background:var(--panel2);border-left:3px solid var(--plate);border-radius:8px;padding:8px 10px}
.wt-similar-head{display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:var(--text);font:inherit;cursor:pointer;padding:2px 0;text-align:left}
.wt-sim-label{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);flex:1}
.wt-sim-count{background:var(--plate);color:#14120A;font-weight:700;font-size:12px;border-radius:999px;min-width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;padding:0 6px}
.wt-sim-caret{color:var(--dim);font-size:12px}
.wt-similar-list{display:flex;flex-direction:column;gap:7px;padding:8px 0 2px}
.wt-similar-row{display:flex;gap:10px;align-items:baseline}
.wt-sim-name{color:var(--text);text-transform:capitalize;flex:1;min-width:0;font-size:14px;font-weight:500}
.wt-sim-sets{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:600;color:var(--text)}
.wt-sim-date{color:var(--dim);font-size:11px;flex:none}
.wt-modal-back{position:fixed;inset:0;background:rgba(10,8,14,.72);display:flex;align-items:flex-end;justify-content:center;z-index:20}
.wt-modal{background:var(--bg);border:1px solid var(--line);border-radius:16px 16px 0 0;width:100%;max-width:560px;max-height:82vh;display:flex;flex-direction:column;padding:12px}
.wt-modal-head{display:flex;gap:8px;align-items:center}
.wt-search{flex:1;background:var(--panel);border:1px solid var(--line);border-radius:10px;color:var(--text);font:inherit;font-size:16px;padding:11px 12px;width:100%}
.wt-picker-list{overflow-y:auto;flex:1;margin:10px 0;display:flex;flex-direction:column;gap:2px}
.wt-picker-label{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);padding:6px 4px}
.wt-picker-title{flex:1;font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700;padding:6px 2px}
.wt-pick-row{display:flex;align-items:center;gap:10px;background:none;border:0;color:var(--text);font:inherit;text-align:left;padding:10px 6px;border-radius:8px;cursor:pointer}
.wt-pick-row:hover{background:var(--panel)}
.wt-pick-name{text-transform:capitalize;font-weight:500;flex:none;max-width:55%}
.wt-pick-meta{color:var(--dim);font-size:12px;text-transform:capitalize;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wt-nomatch{display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center;padding:22px 12px;color:var(--dim)}
.wt-createx{width:100%;background:linear-gradient(180deg,var(--accent-soft),var(--accent));color:var(--accent-ink);border:0;border-radius:10px;padding:13px;font:inherit;font-weight:700;font-size:15px;cursor:pointer;box-shadow:0 2px 14px rgba(95,54,135,.4)}
.wt-createx:hover{filter:brightness(1.05)}
.wt-form{display:flex;flex-direction:column;gap:10px;padding:8px 2px}
.wt-form.auth{width:100%;max-width:320px}
.wt-form label{display:flex;flex-direction:column;gap:5px;font-size:13px;color:var(--dim);text-align:left}
.wt-form input,.wt-form select{background:var(--panel);border:1px solid var(--line);border-radius:8px;color:var(--text);font:inherit;font-size:16px;padding:10px}
.wt-form-actions{display:flex;gap:10px;align-items:center;margin-top:4px}
.wt-count{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.wt-hist-bar{display:flex;align-items:center;justify-content:space-between;gap:10px}
.wt-export{background:var(--panel);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:8px 13px;font:inherit;font-weight:600;font-size:13px;cursor:pointer}
.wt-export:hover{border-color:var(--accent);color:var(--accent)}
.wt-hist{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.wt-hist-head{display:flex;gap:10px;align-items:baseline;width:100%;background:none;border:0;color:var(--text);font:inherit;padding:12px;cursor:pointer;text-align:left}
.wt-hist-date{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:17px;flex:none}
.wt-hist-name{color:var(--accent-soft);text-transform:capitalize;flex:1;min-width:0}
.wt-hist-n{color:var(--dim);font-size:12px;flex:none}
.wt-hist-body{border-top:1px solid var(--line);padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.wt-hist-row{display:flex;gap:8px;align-items:baseline;font-size:14px}
.wt-hist-ex{text-transform:capitalize;flex:1;min-width:0}
.wt-hist-sets{font-family:'Barlow Condensed',sans-serif;font-size:16px}
.wt-regions{display:flex;gap:6px;flex-wrap:wrap}
.wt-regions.pad-v{padding:10px 0 2px}
.wt-lib{display:flex;flex-direction:column;gap:2px}
.wt-lib-item{border-bottom:1px solid var(--line)}
.wt-lib-item.open{background:var(--panel);border-radius:10px;border-bottom-color:transparent;padding:0 8px 8px}
.wt-lib-row{display:flex;align-items:center;gap:10px;padding:10px 6px;width:100%;background:none;border:0;color:var(--text);font:inherit;text-align:left;cursor:pointer}
.wt-lib-main{flex:1;min-width:0;display:flex;flex-direction:column}
.wt-lib-last{text-align:right;font-family:'Barlow Condensed',sans-serif;font-size:14px;flex:none;color:var(--text)}
.wt-profile-wrap{display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:48px;gap:10px}
.wt-profile-sub{font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:600;margin:22px 0 6px}
.wt-avatar{width:24px;height:24px;border-radius:50%;background:var(--accent);color:var(--accent-ink);font-weight:700;display:inline-flex;align-items:center;justify-content:center;font-size:13px;flex:none}
.wt-avatar.big{width:64px;height:64px;font-size:28px;font-family:'Barlow Condensed',sans-serif}
.wt-confirm-wrap{display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:64px;gap:10px}
.wt-confirm-title{font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:700;margin:8px 0 0}
.wt-confirm-body{color:var(--dim);font-size:14px;max-width:34ch;line-height:1.5;margin:0}
.wt-confirm-body strong{color:var(--text)}
.wt-confirm-actions{display:flex;gap:10px;margin-top:8px}
.wt-friend-row{display:flex;align-items:center;gap:12px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px;font:inherit;color:var(--text);cursor:pointer;text-align:left}
.wt-friend-row:hover{border-color:var(--accent)}
.wt-friend-head{display:flex;align-items:center;gap:12px;margin-bottom:4px}
.wt-friend-name{font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700;flex:1}
.wt-toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:var(--accent);color:var(--accent-ink);font-weight:700;padding:10px 18px;border-radius:999px;z-index:30}
@media (prefers-reduced-motion:no-preference){.wt-toast{animation:wt-pop .18s ease-out}}
@keyframes wt-pop{from{transform:translateX(-50%) translateY(8px);opacity:0}}
`;
