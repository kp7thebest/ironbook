import { useState, useEffect, useMemo, useRef } from "react";
import { EXDB } from "./exdb.js";
import { SEED } from "./seed.js";
import {
  supabase, configured, getSession, signIn, signUp, signOut, updatePassword, sendPasswordReset,
  fetchMyProfile, fetchProfiles, updateUnit, updatePrivacy, updateDisplayName, updateEmail,
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

// ============ EQUIPMENT ============
// Groups used by the filter; each exercise's tag shows its specific equipment.
const EQUIP_KINDS = [
  ["bodyweight", "Bodyweight"], ["free", "Free weights"], ["machine", "Machine"],
  ["cable", "Cable"], ["bands", "Bands"], ["other", "Other equipment"],
];
// Returns null when unknown (e.g. an exercise only seen in your history with no DB match).
function equipKind(meta) {
  const e = ((meta && meta.equipment) || "").toLowerCase().trim();
  const n = ((meta && meta.name) || "").toLowerCase();
  if (!e) return null;
  if (/(body only|bodyweight|body weight|^none$|no equipment)/.test(e) || (e === "other" && /bodyweight/.test(n))) return "bodyweight";
  if (/(dumbbell|barbell|kettlebell|e-z|ez bar|ez curl)/.test(e)) return "free";
  if (/(machine|smith)/.test(e)) return "machine";
  if (/(cable|rope)/.test(e)) return "cable";
  if (/band/.test(e)) return "bands";
  return "other";
}
const capFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
function equipLabel(meta) {
  const k = equipKind(meta);
  if (!k) return null;
  if (k === "bodyweight") return "Bodyweight";
  if (k === "other" && (meta.equipment || "").toLowerCase() === "other") return "Other equipment";
  const e = (meta.equipment || "").toLowerCase();
  if (e === "e-z curl bar") return "EZ bar";
  if (e === "kettlebells") return "Kettlebell";
  return capFirst(meta.equipment);
}
function EquipTag({ meta }) {
  const k = equipKind(meta);
  if (!k) return null;
  return (
    <span className={"wt-etag " + k} title={k === "bodyweight" ? "No external weight needed" : "Needs: " + equipLabel(meta)}>
      {equipLabel(meta)}
    </span>
  );
}

// ============ EXERCISE FILTERS (muscle group → specific muscle → equipment) ============
const REGIONS = ["All", "Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Other"];
const REGION_MUSCLES = REGIONS.reduce((acc, r) => {
  acc[r] = Object.keys(MUSCLE_META).filter((m) => m !== "other" && MUSCLE_META[m][0] === r);
  return acc;
}, {});
const EMPTY_FILTER = { region: "All", muscle: null, equip: "any" };
const matchFilter = (m, f) =>
  (f.region === "All" || muscleRegion(m.muscle) === f.region) &&
  (!f.muscle || m.muscle === f.muscle) &&
  (f.equip === "any" || equipKind(m) === f.equip);
const filterActive = (f) => f.region !== "All" || f.muscle || f.equip !== "any";

function ExerciseFilters({ f, setF, small }) {
  const subs = f.region !== "All" ? REGION_MUSCLES[f.region] || [] : [];
  const chip = "wt-chip" + (small ? " sm" : "");
  return (
    <div className="wt-filters">
      <div className="wt-regions" role="group" aria-label="Muscle group">
        {REGIONS.map((r) => (
          <button key={r} className={chip + (f.region === r ? " on" : "")} aria-pressed={f.region === r}
            onClick={() => setF({ ...f, region: r, muscle: null })}>{r}</button>
        ))}
      </div>
      {subs.length > 1 && (
        <div className="wt-subchips" role="group" aria-label={`${f.region} muscles`}>
          <button className={"wt-subchip" + (!f.muscle ? " on" : "")} aria-pressed={!f.muscle}
            onClick={() => setF({ ...f, muscle: null })}>All {f.region.toLowerCase()}</button>
          {subs.map((m) => (
            <button key={m} className={"wt-subchip" + (f.muscle === m ? " on" : "")} aria-pressed={f.muscle === m}
              onClick={() => setF({ ...f, muscle: m })}>{capFirst(m)}</button>
          ))}
        </div>
      )}
      <label className="wt-equip-select">
        <span>Equipment</span>
        <select value={f.equip} onChange={(e) => setF({ ...f, equip: e.target.value })}>
          <option value="any">Any</option>
          {EQUIP_KINDS.map(([k, label]) => <option key={k} value={k}>{k === "bodyweight" ? "Bodyweight (no weights)" : label}</option>)}
        </select>
      </label>
    </div>
  );
}

// ============ STRENGTH MATH (1-rep max estimation) ============
// Reps may be unilateral ("6,6" = 6 each side) -> use the average of the parts.
const repsValue = (r) => {
  if (r == null || r === "") return null;
  const parts = String(r).split(",").map((x) => parseFloat(x)).filter((x) => !isNaN(x) && x > 0);
  if (!parts.length) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
};
// Average of Epley and Brzycki: the two most widely used formulas; they agree closely under ~10 reps.
function est1RM(w, r) {
  if (w == null || r == null || !(w > 0) || !(r > 0)) return null;
  if (r <= 1) return w;
  const epley = w * (1 + r / 30);
  const brzycki = r < 37 ? (w * 36) / (37 - r) : epley;
  return (epley + brzycki) / 2;
}
// Inverse: the weight you should manage for `r` reps given a 1RM.
function weightForReps(oneRM, r) {
  if (!(oneRM > 0)) return null;
  if (r <= 1) return oneRM;
  return (oneRM / (1 + r / 30) + (oneRM * (37 - r)) / 36) / 2;
}
// Best (highest) estimated 1RM across a list of sets.
function bestE1(sets) {
  let best = null;
  for (const s of sets || []) {
    const e = est1RM(s.weight != null ? Number(s.weight) : null, repsValue(s.reps));
    if (e != null && (!best || e > best.e1)) best = { e1: e, weight: Number(s.weight), reps: s.reps };
  }
  return best;
}
const roundTo = (v, step) => Math.round(v / step) * step;
// A kg weight shown in the user's unit, rounded to a loadable increment (0.5 kg / 1 lb).
const fmtLoad = (kg, unit) => {
  if (kg == null) return "–";
  const v = unit === "lbs" ? kg / KG_PER_LB : kg;
  return String(roundTo(v, unit === "lbs" ? 1 : 0.5));
};

// localStorage JSON helpers (fine outside Claude artifacts)
const lsGet = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full/blocked */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

// ============ EXERCISE REGISTRY ============
const DB_INDEX = new Map(EXDB.map((t) => [norm(t[0]), t]));
// Everyday gym names -> the closest exercise-database entry. Logged/custom exercises with these
// names borrow that entry's equipment (for tags/filters) and demo images. Nothing is renamed.
// Every target is checked to exist by the test harness.
const ALIASES = {
  "bench press": "Barbell Bench Press - Medium Grip", "barbell bench press": "Barbell Bench Press - Medium Grip",
  "incline bench press": "Barbell Incline Bench Press - Medium Grip",
  "squat": "Barbell Full Squat", "squats": "Barbell Full Squat", "back squat": "Barbell Full Squat",
  "deadlift": "Barbell Deadlift", "deadlifts": "Barbell Deadlift", "rdl": "Romanian Deadlift",
  "hip thrust": "Barbell Hip Thrust", "hip thrusts": "Barbell Hip Thrust",
  "lat pulldown": "Wide-Grip Lat Pulldown", "lat pulldowns": "Wide-Grip Lat Pulldown", "lat pull down": "Wide-Grip Lat Pulldown",
  "leg extension": "Leg Extensions", "leg curl": "Seated Leg Curl", "leg curls": "Seated Leg Curl",
  "calf raise": "Standing Calf Raises", "calf raises": "Standing Calf Raises",
  "adductor": "Thigh Adductor", "abductor": "Thigh Abductor",
  "lateral raise": "Side Lateral Raise", "lateral raises": "Side Lateral Raise", "lat raise": "Side Lateral Raise",
  "shoulder press": "Dumbbell Shoulder Press", "overhead press": "Barbell Shoulder Press",
  "machine shoulder press": "Machine Shoulder (Military) Press",
  "chest press": "Leverage Chest Press", "machine chest press": "Leverage Chest Press",
  "incline chest press": "Leverage Incline Chest Press", "chest fly": "Butterfly", "pec deck": "Butterfly",
  "dumbbell fly": "Dumbbell Flyes", "cable fly": "Cable Crossover",
  "seated row": "Seated Cable Rows", "seated rows": "Seated Cable Rows", "cable row": "Seated Cable Rows",
  "close grip row": "Seated Cable Rows", "barbell row": "Bent Over Barbell Row", "dumbbell row": "One-Arm Dumbbell Row",
  "t-bar row": "T-Bar Row with Handle", "t-bar row wide": "T-Bar Row with Handle",
  "back extension": "Hyperextensions (Back Extensions)", "back extensions": "Hyperextensions (Back Extensions)",
  "tricep pushdown": "Triceps Pushdown", "triceps pushdown": "Triceps Pushdown",
  "tricep pushdown single arm": "Cable One Arm Tricep Extension",
  "overhead tricep": "Cable Rope Overhead Triceps Extension", "overhead tricep extension": "Cable Rope Overhead Triceps Extension",
  "dips": "Dips - Triceps Version",
  "bicep curl": "Dumbbell Bicep Curl", "biceps curl": "Dumbbell Bicep Curl", "hammer curl": "Hammer Curls",
  "preacher curl": "Preacher Curl", "concentration curl": "Concentration Curls", "reverse curl": "Reverse Barbell Curl",
  "cable curl": "Standing Biceps Cable Curl", "bayesian curl": "Standing One-Arm Cable Curl",
  "abs": "Ab Crunch Machine", "ab crunch": "Ab Crunch Machine", "crunch": "Crunches",
  "pull ups": "Pullups", "pull-ups": "Pullups", "pullup": "Pullups", "chin ups": "Chin-Up", "chin-ups": "Chin-Up",
  "push ups": "Pushups", "push-ups": "Pushups", "pushup": "Pushups", "lunges": "Dumbbell Lunges",
};
// Resolve a logged/custom name to a DB entry: exact alias, else singular/plural variant.
function dbMatch(k) {
  if (ALIASES[k]) return DB_INDEX.get(norm(ALIASES[k])) || null;
  return DB_INDEX.get(k + "s") || (k.endsWith("s") ? DB_INDEX.get(k.slice(0, -1)) : null) || null;
}

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
    // In the source DB, blank equipment means none is needed (push-ups, lunges, stretches).
    const eq = equipment || "body only";
    if (!map.has(k)) map.set(k, { name, muscle, equipment: eq, img: img || "", source: "db" });
    else {
      // A logged/custom exercise that matches a DB entry inherits its demo images and equipment.
      const cur = map.get(k);
      if (img && !cur.img) cur.img = img;
      if (!cur.equipment) cur.equipment = eq;
    }
  }
  // Everyday names ("bench press") -> borrow equipment + demo from the closest DB entry.
  for (const [k, cur] of map) {
    if (cur.source === "db" || (cur.img && cur.equipment)) continue;
    const t = dbMatch(k);
    if (!t) continue;
    if (!cur.img && t[3]) cur.img = t[3];
    if (!cur.equipment) cur.equipment = t[2] || "body only";
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
  const [recovering, setRecovering] = useState(false); // arrived via password-reset link
  const toggleTheme = () => setTheme((t) => { const n = t === "dark" ? "light" : "dark"; lsSet(THEME_KEY, n); return n; });

  useEffect(() => {
    if (!configured) return;
    getSession().then(setSession);
    // onAuthChange fires "PASSWORD_RECOVERY" when the reset link is opened.
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    // Fallback: the reset redirect adds ?reset=1
    if (new URLSearchParams(window.location.search).get("reset") === "1") setRecovering(true);
    return () => data.subscription.unsubscribe();
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
  if (recovering && session) return <ResetPasswordScreen theme={theme} onDone={() => {
    setRecovering(false);
    // clean the ?reset=1 out of the URL
    window.history.replaceState({}, "", window.location.origin + "/");
  }} />;
  if (!session) return <AuthScreen theme={theme} onToggleTheme={toggleTheme} />;
  return <MainApp key={session.user.id} session={session} theme={theme} onToggleTheme={toggleTheme} />;
}

// ============ RESET PASSWORD (after clicking the email link) ============
function ResetPasswordScreen({ theme, onDone }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr("");
    if (pw.length < 6) { setErr("Password must be at least 6 characters."); return; }
    if (pw !== confirm) { setErr("Passwords don’t match."); return; }
    setBusy(true);
    try { await updatePassword(pw); onDone(); }
    catch (e) { setErr(e.message || "Couldn’t set password. The reset link may have expired — request a new one."); }
    finally { setBusy(false); }
  };
  return (
    <Shell theme={theme}>
      <div className="wt-profile-wrap">
        <div className="wt-eyebrow">Reset password</div>
        <h1 className="wt-title">IRONBOOK</h1>
        <p className="wt-profile-sub">Set a new password</p>
        <div className="wt-form auth">
          <label>New password<input type="password" value={pw} autoFocus autoComplete="new-password" onChange={(e) => { setPw(e.target.value); setErr(""); }} /></label>
          <label>Confirm new password<input type="password" value={confirm} autoComplete="new-password" onChange={(e) => { setConfirm(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && submit()} /></label>
          {err && <div className="wt-err">{err}</div>}
          <button className="wt-primary" disabled={busy || !pw || !confirm} onClick={submit}>{busy ? "Saving…" : "Set password & sign in"}</button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ theme, children }) {
  return <div className={"wt-root theme-" + theme}><style>{CSS}</style>{children}</div>;
}

// ============ AUTH SCREEN ============
function AuthScreen({ theme, onToggleTheme }) {
  const [mode, setMode] = useState("signin"); // signin | signup | forgot
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setNotice(""); setBusy(true);
    try {
      if (mode === "signup") {
        if (name.trim().length < 2) throw new Error("Pick a display name (2+ characters).");
        if (pw.length < 6) throw new Error("Password must be at least 6 characters.");
        await signUp(email.trim(), pw, name.trim());
      } else if (mode === "forgot") {
        if (!email.trim()) throw new Error("Enter your email first.");
        await sendPasswordReset(email.trim());
        setNotice("Check your email for a reset link. It may take a minute, and could land in spam.");
      } else {
        await signIn(email.trim(), pw);
      }
    } catch (e) {
      setErr(e.message || "Something went wrong.");
    } finally { setBusy(false); }
  };

  const goto = (m) => { setMode(m); setErr(""); setNotice(""); };

  const subtitle = mode === "signin" ? "Welcome back" : mode === "signup" ? "Join the crew" : "Reset your password";
  const cta = busy ? "One sec…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link";

  return (
    <Shell theme={theme}>
      <div className="wt-profile-wrap">
        <div className="wt-eyebrow">Training log</div>
        <h1 className="wt-title">IRONBOOK</h1>
        <p className="wt-profile-sub">{subtitle}</p>
        <div className="wt-form auth">
          {mode === "signup" && (
            <label>Display name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Srijan" autoComplete="nickname" /></label>
          )}
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email"
            onKeyDown={(e) => e.key === "Enter" && mode === "forgot" && submit()} /></label>
          {mode !== "forgot" && (
            <label>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              onKeyDown={(e) => e.key === "Enter" && submit()} /></label>
          )}
          {err && <div className="wt-err">{err}</div>}
          {notice && <div className="wt-notice">{notice}</div>}
          <button className="wt-primary" disabled={busy || !email || (mode !== "forgot" && !pw)} onClick={submit}>{cta}</button>

          {mode === "signin" && (
            <button className="wt-ghost small" onClick={() => goto("forgot")}>Forgot password?</button>
          )}
          <button className="wt-ghost" onClick={() => goto(mode === "signup" ? "signin" : mode === "forgot" ? "signin" : "signup")}>
            {mode === "signin" ? "New here? Create an account" : mode === "signup" ? "Already have an account? Sign in" : "← Back to sign in"}
          </button>
        </div>
        <button className="wt-theme-inline" onClick={onToggleTheme} aria-label="Toggle dark or light mode">
          {theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}
        </button>
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
  const [progressKey, setProgressKey] = useState(null); // exercise shown on the Progress tab
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

  const togglePrivacy = async (isPrivate) => {
    setProfile((p) => ({ ...p, is_private: isPrivate }));
    try { await updatePrivacy(myId, isPrivate); flash(isPrivate ? "Profile is now private" : "Profile is now visible to the crew"); }
    catch { setProfile((p) => ({ ...p, is_private: !isPrivate })); flash("Couldn’t update privacy"); }
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
        {[["log", "Log"], ["history", "History"], ["progress", "Progress"], ["calendar", "Calendar"], ["friends", "Friends"], ["exercises", "Library"], ["settings", "Settings"]].map(([id, label]) => (
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
      {tab === "progress" && (
        <ProgressView workouts={workouts} unit={unit} registry={registry} exKey={progressKey} setExKey={setProgressKey} />
      )}
      {tab === "calendar" && <CalendarView myId={myId} myName={profile.display_name} myWorkouts={workouts} />}
      {tab === "exercises" && (
        <ExercisesView registry={registry} workouts={workouts} unit={unit} flash={flash}
          myId={myId} onAddCustom={addCustom} onEditCustom={editCustom} onDeleteCustom={removeCustom}
          onShowProgress={(name) => { setProgressKey(norm(name)); setTab("progress"); }} />
      )}
      {tab === "settings" && (
        <SettingsView flash={flash} hasWorkouts={workouts.length > 0} onImportSeed={importSeed}
          profile={profile} email={session.user.email} onSaveProfile={saveProfileEdits} onTogglePrivacy={togglePrivacy} />
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

// ============ PROGRESS ============
// One point per session date for an exercise. "Top set" = the heaviest set that day (ties -> more reps);
// bodyweight exercises (no load logged) use the set with the most reps instead.
function exerciseSeries(workouts, key) {
  const byDate = new Map();
  for (const w of workouts) {
    for (const e of w.entries || []) {
      if (norm(e.exercise) !== key) continue;
      const sets = (e.sets || [])
        .map((s) => ({ weight: s.weight != null && s.weight !== "" ? Number(s.weight) : null, reps: s.reps || "", rv: repsValue(s.reps) }))
        .filter((s) => s.weight != null || s.rv != null);
      if (!sets.length) continue;
      const pool = sets.some((s) => s.weight != null) ? sets.filter((s) => s.weight != null) : sets;
      const top = pool.slice().sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || (b.rv ?? 0) - (a.rv ?? 0))[0];
      const best = bestE1(sets);
      const pt = { date: w.date, name: w.name, sets, top, e1: best ? best.e1 : null, e1Set: best };
      const prev = byDate.get(w.date);
      const stronger = !prev || (top.weight ?? 0) > (prev.top.weight ?? 0) ||
        ((top.weight ?? 0) === (prev.top.weight ?? 0) && (top.rv ?? 0) > (prev.top.rv ?? 0));
      if (stronger) byDate.set(w.date, pt);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Clean axis ticks (1, 2, 5 x 10^n steps) covering [min, max].
function niceTicks(min, max, count) {
  if (!isFinite(min) || !isFinite(max)) return { lo: 0, hi: 1, ticks: [0, 1] };
  if (min === max) { const pad = Math.max(1, Math.abs(min) * 0.1); min -= pad; max += pad; }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / mag;
  const step = (r >= 7.5 ? 10 : r >= 3.5 ? 5 : r >= 1.5 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi, ticks };
}
const shortDate = (d) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtNum = (v) => (v == null ? "–" : String(Number.isInteger(v) ? v : Math.round(v * 10) / 10));
const toDisp = (kg, unit) => (kg == null ? null : unit === "lbs" ? kg / KG_PER_LB : kg);

// Two panels, one shared date axis: weight on top (line), reps below (columns).
// Deliberately NOT a single dual-y-axis plot — two scales on one plot make the
// crossing points and relative slopes an artifact of how the axes happen to be scaled.
function ProgressChart({ points, unit, weighted, selIdx, onSelect, prIdx, exName }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [W, setW] = useState(340);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => { const w = Math.round(el.getBoundingClientRect().width); if (w > 0) setW(Math.max(260, w)); };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = points.length;
  const padL = 36, padR = 42;
  const plotW = Math.max(40, W - padL - padR);
  const band = plotW / Math.max(n, 1);
  const xOf = (i) => padL + band * (i + 0.5);

  // vertical layout (the x-axis label band is inside H, so nothing gets clipped)
  const wTop = 30, wH = weighted ? 132 : 0, wBot = wTop + wH;
  const rLabelY = weighted ? wBot + 32 : 16;
  const rTop = weighted ? wBot + 44 : wTop, rH = weighted ? 78 : 140, rBot = rTop + rH;
  const H = rBot + 28;

  const wVals = points.map((p) => toDisp(p.top.weight, unit));
  const wFinite = wVals.filter((v) => v != null);
  const wMin = wFinite.length ? Math.min(...wFinite) : 0;
  const wMax = wFinite.length ? Math.max(...wFinite) : 1;
  const wSpan = Math.max(wMax - wMin, 1);
  const wt = niceTicks(wMin - wSpan * 0.08, wMax + wSpan * 0.2, 4); // headroom keeps the PR label inside the panel
  const yW = (v) => wBot - ((v - wt.lo) / (wt.hi - wt.lo)) * wH;

  const rVals = points.map((p) => p.top.rv);
  const rMax = Math.max(1, ...rVals.filter((v) => v != null));
  const rt = niceTicks(0, rMax * 1.08, 3);
  const yR = (v) => rBot - (v / rt.hi) * rH;

  // weight line, broken where a session has no load
  const segs = [];
  let cur = [];
  wVals.forEach((v, i) => {
    if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([xOf(i), yW(v)]);
  });
  if (cur.length) segs.push(cur);
  const pts = (s) => s.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L");
  const linePath = segs.map((s) => "M" + pts(s)).join(" ");
  const areaPath = segs.filter((s) => s.length > 1)
    .map((s) => `M${s[0][0].toFixed(1)},${wBot} L${pts(s)} L${s[s.length - 1][0].toFixed(1)},${wBot} Z`).join(" ");
  let lastW = -1;
  wVals.forEach((v, i) => { if (v != null) lastW = i; });

  const bw = Math.max(3, Math.min(24, band * 0.58));
  const barPath = (x, y, w, h) => {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  };

  // date labels: as many as fit without crowding, always including the latest
  const maxLabels = Math.max(2, Math.floor(plotW / 62));
  const step = Math.max(1, Math.ceil(n / maxLabels));
  const xIdx = [];
  for (let i = 0; i < n; i += step) xIdx.push(i);
  if (n > 1 && xIdx[xIdx.length - 1] !== n - 1) {
    if (xIdx.length > 1 && (n - 1) - xIdx[xIdx.length - 1] < step * 0.6) xIdx.pop();
    xIdx.push(n - 1);
  }

  const pick = (e) => {
    const svg = svgRef.current;
    if (!svg || !n) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - padL) / band)));
    if (i !== selIdx) onSelect(i);
  };
  const onKey = (e) => {
    const moves = { ArrowLeft: selIdx - 1, ArrowRight: selIdx + 1, Home: 0, End: n - 1 };
    if (e.key in moves) { e.preventDefault(); onSelect(Math.max(0, Math.min(n - 1, moves[e.key]))); }
  };

  const xs = selIdx != null ? xOf(selIdx) : null;
  return (
    <div ref={wrapRef} className="wt-viz">
      <svg ref={svgRef} width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="wt-viz-svg"
        tabIndex={0} role="group" onPointerMove={pick} onPointerDown={pick} onKeyDown={onKey}
        aria-label={`${exName} progress, ${n} session${n === 1 ? "" : "s"}. Left and right arrow keys move between sessions.`}>
        <defs>
          <linearGradient id="wtWeightWash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="wt-viz-wash-top" />
            <stop offset="100%" className="wt-viz-wash-bot" />
          </linearGradient>
        </defs>

        {/* panel titles, each keyed with its series' line mark */}
        {weighted && (<>
          <line x1="0" x2="12" y1="11" y2="11" className="wt-viz-key w" />
          <text x="18" y="15" className="wt-viz-title">Top-set weight ({unit})</text>
        </>)}
        <rect x="0" y={rLabelY - 9} width="12" height="8" rx="2" className="wt-viz-key-bar" />
        <text x="18" y={rLabelY} className="wt-viz-title">{weighted ? "Reps in that set" : "Reps (best set)"}</text>

        {/* gridlines + ticks */}
        {weighted && wt.ticks.map((t) => (
          <g key={"w" + t}>
            <line x1={padL} x2={W - padR + 8} y1={yW(t)} y2={yW(t)} className="wt-viz-grid" />
            <text x={padL - 6} y={yW(t) + 3.5} textAnchor="end" className="wt-viz-tick">{fmtNum(t)}</text>
          </g>
        ))}
        {rt.ticks.map((t) => (
          <g key={"r" + t}>
            <line x1={padL} x2={W - padR + 8} y1={yR(t)} y2={yR(t)} className={t === 0 ? "wt-viz-base" : "wt-viz-grid"} />
            <text x={padL - 6} y={yR(t) + 3.5} textAnchor="end" className="wt-viz-tick">{fmtNum(t)}</text>
          </g>
        ))}

        {/* linked crosshair across both panels */}
        {xs != null && <line x1={xs} x2={xs} y1={(weighted ? wTop : rTop) - 6} y2={rBot} className="wt-viz-cross" />}

        {/* weight: wash, line, dots */}
        {weighted && (<>
          {areaPath && <path d={areaPath} fill="url(#wtWeightWash)" stroke="none" />}
          {linePath && <path d={linePath} className="wt-viz-line" />}
          {wVals.map((v, i) => v == null ? null : (
            <circle key={"d" + i} cx={xOf(i)} cy={yW(v)} r={i === selIdx ? 6 : 4} className="wt-viz-dot" />
          ))}
          {lastW >= 0 && (
            <text x={xOf(lastW) + 9} y={yW(wVals[lastW]) + 4} className="wt-viz-end">{fmtNum(wVals[lastW])}</text>
          )}
          {prIdx != null && wVals[prIdx] != null && (
            <text x={xOf(prIdx)} y={yW(wVals[prIdx]) - 11} textAnchor="middle" className="wt-viz-pr">PR</text>
          )}
        </>)}

        {/* reps: columns from the zero baseline */}
        {rVals.map((v, i) => v == null ? null : (
          <path key={"b" + i} d={barPath(xOf(i) - bw / 2, yR(v), bw, rBot - yR(v))}
            className={"wt-viz-bar" + (i === selIdx ? " sel" : "")} />
        ))}

        {/* shared date axis */}
        {xIdx.map((i) => (
          <text key={"x" + i} x={xOf(i)} y={rBot + 18} textAnchor="middle" className="wt-viz-tick">{shortDate(points[i].date)}</text>
        ))}
      </svg>
    </div>
  );
}

// Delta on its own line, "since <date>" beneath — keeps narrow tiles from wrapping mid-phrase.
// Direction is carried by ▲/▼ + text, never by color alone.
function KpiDelta({ v, suffix, vs, step = 0.1 }) {
  if (v == null) return <div className="wt-kpi-sub">{vs}</div>;
  const r = Math.round(roundTo(v, step) * 10) / 10;
  const cls = Math.abs(r) < 0.05 ? "flat" : r > 0 ? "up" : "down";
  return (
    <div className="wt-kpi-sub stack">
      <span className={"wt-kpi-delta " + cls}>{cls === "flat" ? "± 0" : `${r > 0 ? "▲" : "▼"} ${Math.abs(r)}${suffix}`}</span>
      <span>{vs}</span>
    </div>
  );
}

// ============ PR ESTIMATOR ============
const REP_TABLE = [1, 2, 3, 4, 5, 6, 8, 10, 12];
function PREstimator({ unit, suggestion, exName }) {
  const [w, setW] = useState("");
  const [r, setR] = useState("");
  const sugKey = suggestion ? `${exName}|${suggestion.weight}|${suggestion.reps}|${unit}` : `${exName}|none|${unit}`;
  useEffect(() => {
    if (suggestion) {
      setW(String(kgToDisplay(suggestion.weight, unit)));
      setR(String(Math.round(repsValue(suggestion.reps) || 0) || ""));
    } else { setW(""); setR(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugKey]);

  const wKg = displayToKg(w.replace(",", "."), unit);
  const rv = parseInt(r, 10);
  const oneRM = est1RM(wKg, rv);
  const epley = oneRM && rv > 1 ? wKg * (1 + rv / 30) : oneRM;
  const brzycki = oneRM && rv > 1 && rv < 37 ? (wKg * 36) / (37 - rv) : oneRM;

  return (
    <div className="wt-settings-block wt-pre" id="pr-estimator">
      <div className="wt-settings-title">PR estimator</div>
      <p className="wt-hint wt-pre-lede">Estimate your 1-rep max from a set you’ve done — no need to actually max out.</p>
      <div className="wt-pre-inputs">
        <label>Weight ({unit})
          <input inputMode="decimal" value={w} placeholder="e.g. 50" onChange={(e) => setW(e.target.value.replace(/[^0-9.,]/g, ""))} aria-label="Weight lifted" />
        </label>
        <span className="wt-pre-x" aria-hidden="true">×</span>
        <label>Reps
          <input inputMode="numeric" value={r} placeholder="e.g. 8" onChange={(e) => setR(e.target.value.replace(/[^0-9]/g, ""))} aria-label="Reps completed" />
        </label>
      </div>

      {oneRM ? (<>
        <div className="wt-pre-hero">
          <span className="wt-pre-hero-label">Estimated 1-rep max</span>
          <span className="wt-pre-hero-val">{fmtLoad(oneRM, unit)}<em> {unit}</em></span>
          {rv > 1 && <span className="wt-pre-range">Epley {fmtLoad(epley, unit)} · Brzycki {fmtLoad(brzycki, unit)}</span>}
        </div>
        {rv > 10 && <div className="wt-pre-warn">⚠ Estimates get less reliable above ~10 reps. A heavier set of 3–8 reps gives a better prediction.</div>}
        <table className="wt-pre-table">
          <caption>What you should be able to lift for other rep counts</caption>
          <thead><tr><th scope="col">Reps</th><th scope="col">Weight</th><th scope="col">% of 1RM</th></tr></thead>
          <tbody>
            {REP_TABLE.map((k) => {
              const wk = weightForReps(oneRM, k);
              return (
                <tr key={k} className={k === rv ? "on" : ""}>
                  <td>{k}</td><td>{fmtLoad(wk, unit)} {unit}</td><td>{Math.round((wk / oneRM) * 100)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </>) : (
        <div className="wt-hint">Enter a weight and the reps you managed to see your estimate.</div>
      )}

      {suggestion && (
        <div className="wt-hint wt-pre-src">
          Pre-filled with your strongest {exName} set: {kgToDisplay(suggestion.weight, unit)} {unit} × {suggestion.reps} on {shortDate(suggestion.date)}.
        </div>
      )}
      <details className="wt-pre-how">
        <summary>How is this calculated?</summary>
        <p>It averages two standard formulas — Epley, weight × (1 + reps ÷ 30), and Brzycki, weight × 36 ÷ (37 − reps).
          They agree closely between 1 and 10 reps. Treat the result as a guide, not a guarantee, and test real maxes with a spotter.</p>
      </details>
    </div>
  );
}

const RANGES = [["all", "All"], ["90", "3M"], ["30", "1M"]];
function ProgressView({ workouts, unit, registry, exKey, setExKey }) {
  // All hooks first — this component has early returns below.
  const [range, setRange] = useState("all");
  const [sel, setSel] = useState(null);
  const [showTable, setShowTable] = useState(false);

  const exercises = useMemo(() => {
    const m = new Map();
    for (const w of workouts) {
      for (const e of w.entries || []) {
        if (!(e.sets || []).some((s) => s.weight != null || s.reps)) continue;
        const k = norm(e.exercise);
        const cur = m.get(k) || { key: k, name: e.exercise, count: 0, last: "" };
        cur.count += 1;
        if (w.date >= cur.last) { cur.last = w.date; cur.name = e.exercise; }
        m.set(k, cur);
      }
    }
    return [...m.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
  }, [workouts]);

  const activeKey = exKey && exercises.some((x) => x.key === exKey) ? exKey : (exercises[0] ? exercises[0].key : null);
  const allPoints = useMemo(() => (activeKey ? exerciseSeries(workouts, activeKey) : []), [workouts, activeKey]);
  const points = useMemo(() => {
    if (range === "all") return allPoints;
    const cutoff = new Date(Date.now() - Number(range) * 86400000).toISOString().slice(0, 10);
    return allPoints.filter((p) => p.date >= cutoff);
  }, [allPoints, range]);
  useEffect(() => { setSel(null); }, [activeKey, range]);

  if (!exercises.length) {
    return (
      <div className="wt-pane">
        <div className="wt-empty">
          <div className="wt-empty-big">No progress yet</div>
          <p>Log a workout and your progress charts will appear here, one per exercise.</p>
        </div>
        <PREstimator unit={unit} suggestion={null} exName="" />
      </div>
    );
  }

  const exInfo = exercises.find((x) => x.key === activeKey);
  const exName = capFirst(exInfo ? exInfo.name : "");
  const meta = (registry && registry.get(activeKey)) || { name: exName, muscle: "other", equipment: "" };
  const n = points.length;
  const selIdx = n ? (sel == null ? n - 1 : Math.max(0, Math.min(sel, n - 1))) : null;
  const weighted = points.some((p) => p.top.weight != null);

  // Personal best in view: heaviest top set (ties -> more reps, then the later one); reps for bodyweight.
  let prIdx = null;
  points.forEach((p, i) => {
    if (prIdx == null) { prIdx = i; return; }
    const b = points[prIdx];
    const better = weighted
      ? (p.top.weight ?? -1) > (b.top.weight ?? -1) || ((p.top.weight ?? -1) === (b.top.weight ?? -1) && (p.top.rv ?? 0) >= (b.top.rv ?? 0))
      : (p.top.rv ?? 0) >= (b.top.rv ?? 0);
    if (better) prIdx = i;
  });

  // strongest set on record (all time) seeds the PR estimator
  let bestSet = null;
  for (const p of allPoints) if (p.e1Set && (!bestSet || p.e1Set.e1 > bestSet.e1)) bestSet = { ...p.e1Set, date: p.date };

  const first = points[0], last = points[n - 1], best = prIdx != null ? points[prIdx] : null;
  const since = first ? `since ${shortDate(first.date)}` : "";
  const p = selIdx != null ? points[selIdx] : null;
  const rangeLabel = (RANGES.find(([k]) => k === range) || [])[1];

  return (
    <div className="wt-pane">
      <div className="wt-prog-filters">
        <label className="wt-prog-ex">
          <span className="wt-prog-ex-label">Exercise</span>
          <select value={activeKey || ""} onChange={(e) => setExKey(e.target.value)}>
            {exercises.map((x) => <option key={x.key} value={x.key}>{capFirst(x.name)} ({x.count})</option>)}
          </select>
        </label>
        <div className="wt-seg" role="group" aria-label="Time range">
          {RANGES.map(([k, label]) => (
            <button key={k} className={"wt-seg-btn" + (range === k ? " on" : "")} aria-pressed={range === k} onClick={() => setRange(k)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="wt-prog-head" style={{ "--plate": muscleColor(meta.muscle) }}>
        <span className="wt-plate" aria-hidden="true" />
        <div className="wt-prog-name">{exName}</div>
        <EquipTag meta={meta} />
      </div>

      {n === 0 ? (
        <div className="wt-empty small">
          <p>No {exName} sessions in the last {rangeLabel === "3M" ? "3 months" : "month"}.</p>
          <button className="wt-ghost" onClick={() => setRange("all")}>Show all time</button>
        </div>
      ) : (<>
        <div className="wt-kpis">
          {weighted ? (<>
            <div className="wt-kpi">
              <div className="wt-kpi-label">Latest</div>
              <div className="wt-kpi-val">{fmtNum(toDisp(last.top.weight, unit))}<small> {unit}</small><span className="wt-kpi-x"> × {last.top.reps || "–"}</span></div>
              {n > 1 ? <KpiDelta v={(toDisp(last.top.weight, unit) ?? 0) - (toDisp(first.top.weight, unit) ?? 0)} suffix={` ${unit}`} vs={since} /> : <div className="wt-kpi-sub">first session</div>}
            </div>
            <div className="wt-kpi">
              <div className="wt-kpi-label">Heaviest</div>
              <div className="wt-kpi-val">{fmtNum(toDisp(best.top.weight, unit))}<small> {unit}</small><span className="wt-kpi-x"> × {best.top.reps || "–"}</span></div>
              <div className="wt-kpi-sub">{shortDate(best.date)}</div>
            </div>
            <div className="wt-kpi">
              <div className="wt-kpi-label">Est. 1RM</div>
              <div className="wt-kpi-val">{last.e1 != null ? fmtLoad(last.e1, unit) : "–"}<small> {unit}</small></div>
              {n > 1 && last.e1 != null && first.e1 != null
                ? <KpiDelta v={toDisp(last.e1, unit) - toDisp(first.e1, unit)} suffix={` ${unit}`} vs={since} step={unit === "lbs" ? 1 : 0.5} />
                : <div className="wt-kpi-sub">latest session</div>}
            </div>
          </>) : (<>
            <div className="wt-kpi">
              <div className="wt-kpi-label">Latest</div>
              <div className="wt-kpi-val">{last.top.reps || "–"}<small> reps</small></div>
              {n > 1 ? <KpiDelta v={(last.top.rv ?? 0) - (first.top.rv ?? 0)} suffix=" reps" vs={since} /> : <div className="wt-kpi-sub">first session</div>}
            </div>
            <div className="wt-kpi">
              <div className="wt-kpi-label">Most reps</div>
              <div className="wt-kpi-val">{best.top.reps || "–"}<small> reps</small></div>
              <div className="wt-kpi-sub">{shortDate(best.date)}</div>
            </div>
            <div className="wt-kpi">
              <div className="wt-kpi-label">Sessions</div>
              <div className="wt-kpi-val">{n}</div>
              <div className="wt-kpi-sub">{since}</div>
            </div>
          </>)}
        </div>

        <div className="wt-chart-card">
          <ProgressChart points={points} unit={unit} weighted={weighted} selIdx={selIdx} onSelect={setSel} prIdx={prIdx} exName={exName} />
          {n === 1 && <div className="wt-hint wt-chart-note">Log {exName} again to start seeing a trend.</div>}

          {p && (
            <div className="wt-readout" aria-live="polite">
              <div className="wt-readout-head">
                <span className="wt-readout-date">{fmtDate(p.date)}</span>
                <span className="wt-readout-name">{p.name}</span>
                {selIdx === prIdx && n > 1 && <span className="wt-pr-chip">PR</span>}
              </div>
              <div className="wt-readout-vals">
                {weighted && (
                  <div className="wt-readout-val"><span className="wt-key w" aria-hidden="true" />
                    <strong>{p.top.weight != null ? fmtNum(toDisp(p.top.weight, unit)) : "–"}</strong><em>{unit}</em><span>top set</span></div>
                )}
                <div className="wt-readout-val"><span className="wt-key r" aria-hidden="true" />
                  <strong>{p.top.reps || "–"}</strong><span>reps</span></div>
                {p.e1 != null && (
                  <div className="wt-readout-val"><strong>{fmtLoad(p.e1, unit)}</strong><em>{unit}</em><span>est. 1RM</span></div>
                )}
              </div>
              <div className="wt-readout-sets">All sets: {p.sets.map((s) => setLine(s, unit)).join("  ·  ")}</div>
            </div>
          )}

          <div className="wt-chart-foot">
            <span className="wt-hint">Tap or drag across the chart to inspect a session.</span>
            <button className="wt-ghost small" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>
              {showTable ? "Hide data table" : "Show data table"}
            </button>
          </div>
          {showTable && (
            <div className="wt-ptable-wrap">
              <table className="wt-ptable">
                <thead><tr><th scope="col">Date</th><th scope="col">Top set</th>{weighted && <th scope="col">Est. 1RM</th>}<th scope="col">All sets</th></tr></thead>
                <tbody>
                  {points.map((pt, i) => ({ pt, i })).reverse().map(({ pt, i }) => (
                    <tr key={pt.date} className={i === selIdx ? "on" : ""} onClick={() => setSel(i)}>
                      <td>{shortDate(pt.date)}</td>
                      <td>{setLine(pt.top, unit)}</td>
                      {weighted && <td>{pt.e1 != null ? fmtLoad(pt.e1, unit) : "–"}</td>}
                      <td>{pt.sets.map((s) => setLine(s, unit)).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>)}

      <PREstimator unit={unit} suggestion={weighted ? bestSet : null} exName={exName} />
    </div>
  );
}

// ============ CALENDAR ============
function CalendarView({ myId, myName, myWorkouts }) {
  const [profiles, setProfiles] = useState(null);
  const [viewId, setViewId] = useState(myId);
  const [viewName, setViewName] = useState(myName);
  const [data, setData] = useState(myWorkouts); // workouts of whoever is being viewed
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(null); // selected day string

  useEffect(() => { fetchProfiles().then(setProfiles).catch(() => setProfiles([])); }, []);

  const switchTo = async (p) => {
    setViewId(p.id); setViewName(p.display_name); setSel(null);
    if (p.id === myId) { setData(myWorkouts); return; }
    setLoading(true);
    try { setData(await fetchWorkouts(p.id)); } catch { setData([]); }
    setLoading(false);
  };

  // Map date-string -> list of workout names that day
  const byDay = useMemo(() => {
    const m = {};
    (data || []).forEach((w) => { (m[w.date] = m[w.date] || []).push(w.name); });
    return m;
  }, [data]);

  const monthName = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const firstDow = new Date(cursor.y, cursor.m, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const todayS = todayStr();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ d, ds, names: byDay[ds] || [] });
  }

  const move = (delta) => setCursor((c) => {
    let m = c.m + delta, y = c.y;
    if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    return { y, m };
  });

  const monthCount = Object.entries(byDay).filter(([ds]) => ds.startsWith(`${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}`)).length;

  return (
    <div className="wt-pane">
      {profiles && profiles.length > 1 && (
        <div className="wt-cal-people">
          {profiles.map((p) => (
            <button key={p.id} className={"wt-chip sm" + (viewId === p.id ? " on" : "")} onClick={() => switchTo(p)}>
              {p.id === myId ? "You" : p.display_name}
            </button>
          ))}
        </div>
      )}

      <div className="wt-cal-head">
        <button className="wt-cal-nav" onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <div className="wt-cal-title">{monthName}</div>
        <button className="wt-cal-nav" onClick={() => move(1)} aria-label="Next month">›</button>
      </div>
      <div className="wt-cal-sub">{loading ? "Loading…" : `${viewId === myId ? "You" : viewName} · ${monthCount} session${monthCount === 1 ? "" : "s"} this month`}</div>

      <div className="wt-cal-grid">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="wt-cal-dow">{d}</div>)}
        {cells.map((c, i) => c === null ? <div key={i} className="wt-cal-cell empty" /> : (
          <button key={i} className={"wt-cal-cell" + (c.names.length ? " has" : "") + (c.ds === todayS ? " today" : "") + (sel === c.ds ? " sel" : "")}
            onClick={() => setSel(sel === c.ds ? null : c.ds)} disabled={!c.names.length && c.ds !== todayS}>
            <span className="wt-cal-num">{c.d}</span>
            {c.names.length > 0 && <span className="wt-cal-dot" />}
          </button>
        ))}
      </div>

      {sel && (
        <div className="wt-cal-detail">
          <div className="wt-cal-detail-date">{fmtDate(sel)}</div>
          {byDay[sel] && byDay[sel].length ? (
            <div className="wt-cal-detail-list">
              {byDay[sel].map((n, i) => <span key={i} className="wt-cal-tag">{n}</span>)}
            </div>
          ) : <div className="wt-hint">No workout logged this day.</div>}
        </div>
      )}

      <div className="wt-cal-legend"><span className="wt-cal-dot" /> workout day · tap a day for details</div>
    </div>
  );
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
          sets: (e.sets && e.sets.length ? e.sets : [{}]).map(() => ({ weight: null, reps: "" })),
        }));
      }
    }
    setDraft({ id: uid(), date: todayStr(), name, entries, prefilledFrom: from, prefillTried: prefill });
  };

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
    const sets = last ? last.sets.map(() => ({ weight: null, reps: "" })) : [{ weight: null, reps: "" }];
    setCurrent((d) => ({ ...d, entries: [...d.entries.map((e) => ({ ...e, id: e.id || uid() })), { id: uid(), exercise: meta.name, muscle: meta.muscle, sets }] }));
    setPicking(false);
  };

  const cleaned = () => ({
    date: current.date, name: current.name,
    entries: entriesWithIds.map((e) => ({ exercise: e.exercise, muscle: e.muscle, sets: e.sets.filter((s) => s.weight != null || s.reps).map((s) => ({ weight: s.weight != null ? s.weight : null, reps: s.reps || "" })) })).filter((e) => e.sets.length > 0),
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

      {!isEdit && current.prefillTried && (
        current.prefilledFrom
          ? <div className="wt-prefill-note">Loaded your last <strong>{current.name}</strong> split from {fmtDate(current.prefilledFrom)} — fill in today’s numbers.</div>
          : <div className="wt-prefill-note none">No previous <strong>{current.name}</strong> session on your account yet, so this one starts empty. Next time it’ll pre-load.</div>
      )}

      {entriesWithIds.length === 0 && <p className="wt-hint">No exercises yet. Add one to start logging sets.</p>}

      {entriesWithIds.length > 1 && <div className="wt-reorder-hint">Drag the grip bar, or use ▲▼, to reorder</div>}

      {entriesWithIds.map((entry, i) => (
        <div key={entry.id} ref={(el) => (cardRefs.current[i] = el)}
          className={"wt-card-wrap" + (dragIdx === i ? " dragging" : "")}
          style={dragIdx === i ? { transform: `translateY(${dragDy}px)` } : undefined}>
          <EntryCard entry={entry} unit={unit} workouts={workouts} registry={registry} draftId={current.id}
            onChange={(fn) => updateEntry(entry.id, fn)} onRemove={() => removeEntry(entry.id)}
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
function EntryCard({ entry, unit, workouts, registry, draftId, onChange, onRemove, reorder }) {
  const last = useMemo(() => lastPerformance(workouts, entry.exercise, draftId), [workouts, entry.exercise, draftId]);
  const similar = useMemo(() => similarPerformances(workouts, registry, entry.exercise, draftId), [workouts, registry, entry.exercise, draftId]);
  const [showSimilar, setShowSimilar] = useState(true);
  const [showDemo, setShowDemo] = useState(false);
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
  const isNewPR = today && prevBest && today.e1 > prevBest.e1 + 0.01;

  const setSet = (i, field, val) => onChange((e) => {
    const sets = e.sets.map((s, j) => {
      if (j !== i) return s;
      if (field === "weight") {
        // Keep the raw text (so "22." or "22.5" type smoothly) and derive kg from it.
        return { ...s, wStr: val, weight: displayToKg(val, unit) };
      }
      return { ...s, [field]: val };
    });
    return { ...e, sets };
  });
  const addSet = () => onChange((e) => {
    const prev = e.sets[e.sets.length - 1];
    return { ...e, sets: [...e.sets, prev ? { ...prev } : { weight: null, reps: "" }] };
  });
  const dropSet = (i) => onChange((e) => ({ ...e, sets: e.sets.filter((_, j) => j !== i) }));

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
            <input inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" placeholder={last && last.sets[i] && last.sets[i].weight != null ? String(kgToDisplay(last.sets[i].weight, unit)) : "–"}
              value={s.wStr != null ? s.wStr : (s.weight != null ? kgToDisplay(s.weight, unit) : "")} onChange={(e) => setSet(i, "weight", e.target.value)} aria-label={`Set ${i + 1} weight`} />
            <input inputMode="text" pattern="[0-9,]*" placeholder={last && last.sets[i] ? (last.sets[i].reps || "–") : "e.g. 8 or 6,6"}
              value={s.reps || ""} onChange={(e) => setSet(i, "reps", e.target.value.replace(/[^0-9,]/g, ""))} aria-label={`Set ${i + 1} reps`} />
            <button className="wt-x dim" onClick={() => dropSet(i)} aria-label={`Remove set ${i + 1}`}>✕</button>
          </div>
        ))}
        <button className="wt-ghost small" onClick={addSet}>+ Add set</button>
        {today && (
          <div className={"wt-e1-live" + (isNewPR ? " pr" : "")} aria-live="polite">
            <span>Est. 1-rep max today <strong>{fmtLoad(today.e1, unit)} {unit}</strong></span>
            {isNewPR
              ? <span className="wt-e1-badge">▲ New estimated PR</span>
              : prevBest && <span className="wt-e1-prev">best {fmtLoad(prevBest.e1, unit)} {unit}</span>}
          </div>
        )}
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
  const [f, setF] = useState(EMPTY_FILTER);
  const [adding, setAdding] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);

  const recent = useMemo(() => {
    const seen = new Set(); const out = [];
    [...workouts].sort((a, b) => b.date.localeCompare(a.date)).forEach((w) => w.entries.forEach((e) => {
      const k = norm(e.exercise);
      if (!seen.has(k)) { seen.add(k); out.push(registry.get(k) || { name: e.exercise, muscle: e.muscle }); }
    }));
    return out;
  }, [workouts, registry]);

  const { mine, db, dbTotal } = useMemo(() => {
    const nq = norm(q);
    const rank = (name) => (norm(name).startsWith(nq) ? 0 : 1);
    const mine = [], db = [];
    for (const meta of registry.values()) {
      if (!matchFilter(meta, f)) continue;
      if (nq && !norm(meta.name).includes(nq)) continue;
      (meta.source === "db" ? db : mine).push(meta);
    }
    const cmp = (a, b) => (nq ? rank(a.name) - rank(b.name) : 0) || a.name.length - b.name.length || a.name.localeCompare(b.name);
    mine.sort(cmp); db.sort(cmp);
    return { mine: mine.slice(0, 25), db: db.slice(0, 60), dbTotal: db.length };
  }, [q, f, registry]);

  const showBrowse = q === "" && !filterActive(f);
  const nothing = !showBrowse && mine.length === 0 && db.length === 0;
  const filterDesc = [f.muscle ? capFirst(f.muscle) : f.region !== "All" ? f.region : null,
    f.equip !== "any" ? (EQUIP_KINDS.find(([k]) => k === f.equip) || [])[1] : null].filter(Boolean).join(", ");

  return (
    <div className="wt-modal-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wt-modal" role="dialog" aria-label="Add exercise">
        {!adding ? (
          <>
            <div className="wt-modal-head">
              <input ref={inputRef} className="wt-search" placeholder="Search 870+ exercises…" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="wt-x" onClick={onClose} aria-label="Close">✕</button>
            </div>
            <div className="pad-v">
              <ExerciseFilters f={f} setF={setF} small />
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
                  <div className="wt-picker-label">Exercise database · {dbTotal}</div>
                  {db.map((m) => <PickRow key={m.name} m={m} onPick={onPick} />)}
                  {dbTotal > db.length && <div className="wt-hint pad">Showing {db.length} of {dbTotal}. Search or narrow the filters to see the rest.</div>}
                </>)}
                {nothing && (
                  <div className="wt-nomatch">
                    <div>No match{q ? <> for “{q}”</> : ""}{filterDesc ? ` in ${filterDesc}` : ""}.</div>
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
  const [showDemo, setShowDemo] = useState(false);
  return (
    <div className="wt-pick-wrap" style={{ "--plate": muscleColor(m.muscle) }}>
      <div className="wt-pick-row-inner">
        <button className="wt-pick-row" onClick={() => onPick(m)}>
          <span className="wt-plate sm" aria-hidden="true" />
          <span className="wt-pick-text">
            <span className="wt-pick-name">{m.name}</span>
            <span className="wt-pick-meta">
              <span className="wt-pick-muscle">{m.muscle}{m.source === "custom" ? " · custom" : ""}</span>
              <EquipTag meta={m} />
            </span>
          </span>
        </button>
        {m.img && (
          <button className={"wt-pick-demo" + (showDemo ? " on" : "")} onClick={(e) => { e.stopPropagation(); setShowDemo((v) => !v); }}
            aria-label={`Preview ${m.name} demo`} title="Preview demo">▶</button>
        )}
      </div>
      {showDemo && m.img && <ExerciseAnim imgId={m.img} name={m.name} />}
    </div>
  );
}

// Stored values match the exercise database's vocabulary so tags and filters classify them the same way.
const CUSTOM_EQUIPMENT = [
  ["", "Not specified"], ["body only", "Bodyweight (no weights)"], ["dumbbell", "Dumbbell"], ["barbell", "Barbell"],
  ["kettlebells", "Kettlebell"], ["e-z curl bar", "EZ bar"], ["machine", "Machine"], ["cable", "Cable"],
  ["bands", "Bands"], ["other", "Other"],
];
function CustomForm({ initialName, initialMuscle, initialEquipment, saveLabel, onSave, onCancel }) {
  const [name, setName] = useState(initialName || "");
  const [muscle, setMuscle] = useState(initialMuscle || "chest");
  const [equipment, setEquipment] = useState(initialEquipment || "");
  const muscles = Object.keys(MUSCLE_META).filter((m) => m !== "other");
  // Older customs stored free text; keep it selectable so editing doesn't silently drop it.
  const equipOptions = CUSTOM_EQUIPMENT.some(([v]) => v === equipment) ? CUSTOM_EQUIPMENT : [...CUSTOM_EQUIPMENT, [equipment, equipment]];
  return (
    <div className="wt-form">
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hammer curl (rope)" /></label>
      <label>Primary muscle
        <select value={muscle} onChange={(e) => setMuscle(e.target.value)}>
          {muscles.map((m) => <option key={m} value={m}>{m} — {muscleRegion(m)}</option>)}
        </select>
      </label>
      <label>Equipment
        <select value={equipment} onChange={(e) => setEquipment(e.target.value)}>
          {equipOptions.map(([v, label]) => <option key={v || "none"} value={v}>{label}</option>)}
        </select>
      </label>
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
const LIB_CAP = 150;
function ExercisesView({ registry, workouts, unit, flash, myId, onAddCustom, onEditCustom, onDeleteCustom, onShowProgress }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState(EMPTY_FILTER);
  const [adding, setAdding] = useState(false);
  const [openEx, setOpenEx] = useState(null);
  const [allCustom, setAllCustom] = useState(null); // crew-wide customs with author
  const [editingId, setEditingId] = useState(null);

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
              {isOpen && last && onShowProgress && (
                <button className="wt-ghost small wt-lib-progress" onClick={() => onShowProgress(m.name)}>View progress chart →</button>
              )}
            </div>
          );
        })}
        {list.length === 0 && <div className="wt-hint pad">Nothing matches. Try another search or create it as a custom exercise.</div>}
      </div>
    </div>
  );
}

// ============ SETTINGS ============
function SettingsView({ flash, hasWorkouts, onImportSeed, profile, email, onSaveProfile, onTogglePrivacy }) {
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
        <div className="wt-settings-title">Privacy</div>
        <label className="wt-toggle-row">
          <div>
            <div className="wt-toggle-label">Private profile</div>
            <div className="wt-hint">When on, other members can’t see your workouts or find you in Friends or Calendar.</div>
          </div>
          <button role="switch" aria-checked={!!profile.is_private} className={"wt-switch-toggle" + (profile.is_private ? " on" : "")} onClick={() => onTogglePrivacy(!profile.is_private)}>
            <span className="wt-switch-knob" />
          </button>
        </label>
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
.wt-root{padding-top:calc(16px + env(safe-area-inset-top));padding-left:calc(14px + env(safe-area-inset-left));padding-right:calc(14px + env(safe-area-inset-right))}
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
.wt-theme-btn.corner{position:absolute;top:calc(16px + env(safe-area-inset-top));right:calc(14px + env(safe-area-inset-right));z-index:5}
.wt-theme-inline{margin-top:22px;background:var(--panel);border:1px solid var(--line);color:var(--dim);font:inherit;font-size:13px;font-weight:600;padding:9px 18px;border-radius:999px;cursor:pointer}
.wt-theme-inline:hover{border-color:var(--accent);color:var(--text)}
.wt-header-right{display:flex;align-items:center;gap:8px}
.wt-card-wrap{position:relative}
.wt-card-wrap.dragging{z-index:10;position:relative}
.wt-card-wrap.dragging .wt-card{box-shadow:0 10px 26px rgba(0,0,0,.45);border-color:var(--accent);opacity:.97}
.wt-grip{display:flex;align-items:stretch;gap:6px;margin:-12px -12px 8px;padding:0 6px 0 0;border-bottom:1px solid var(--line);background:var(--panel2);border-radius:14px 14px 0 0;min-height:50px}
.wt-grip-drag{flex:1;display:flex;align-items:center;gap:10px;padding:0 12px;cursor:grab;touch-action:none;color:var(--dim);user-select:none;-webkit-user-select:none;border-radius:14px 0 0 0}
.wt-grip-drag:active{cursor:grabbing;background:var(--line)}
.wt-grip-dots{font-size:18px;line-height:1;letter-spacing:2px}
.wt-grip-pos{font-size:11px;letter-spacing:.12em;text-transform:uppercase}
.wt-grip-arrows{display:flex;align-items:center;gap:4px;flex:none}
.wt-grip-btn{width:38px;height:36px;background:var(--panel);border:1px solid var(--line);border-radius:8px;color:var(--text);font-size:12px;cursor:pointer;flex:none}
.wt-grip-btn:disabled{opacity:.3;cursor:default}
.wt-grip-btn:not(:disabled):hover{border-color:var(--accent);color:var(--accent)}
.wt-drag-dots{font-size:15px;line-height:1}
.wt-reorder-hint{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);text-align:center;margin-bottom:-4px}
.wt-prefill-note{background:var(--panel2);border-left:3px solid var(--accent);border-radius:8px;padding:9px 11px;font-size:13px;color:var(--text)}
.wt-prefill-note.none{border-left-color:var(--line);color:var(--dim)}
.wt-cal-people{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px}
.wt-cal-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.wt-cal-nav{background:var(--panel);border:1px solid var(--line);color:var(--text);border-radius:8px;width:36px;height:36px;font-size:20px;cursor:pointer;flex:none}
.wt-cal-nav:hover{border-color:var(--accent)}
.wt-cal-title{font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;flex:1;text-align:center}
.wt-cal-sub{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);text-align:center;margin-top:-4px}
.wt-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-top:6px}
.wt-cal-dow{text-align:center;font-size:11px;color:var(--dim);font-weight:600;padding:2px 0}
.wt-cal-cell{position:relative;aspect-ratio:1;background:var(--panel);border:1px solid var(--line);border-radius:9px;color:var(--text);font:inherit;cursor:pointer;display:flex;align-items:flex-start;justify-content:flex-start;padding:6px}
.wt-cal-cell.empty{background:transparent;border:0}
.wt-cal-cell:disabled{cursor:default;opacity:.55}
.wt-cal-cell.has{background:var(--panel2);border-color:var(--accent)}
.wt-cal-cell.today{outline:2px solid var(--accent);outline-offset:-1px}
.wt-cal-cell.sel{background:var(--accent);color:var(--accent-ink)}
.wt-cal-num{font-size:13px;font-weight:600}
.wt-cal-dot{position:absolute;bottom:6px;right:6px;width:7px;height:7px;border-radius:50%;background:var(--accent)}
.wt-cal-cell.sel .wt-cal-dot{background:var(--accent-ink)}
.wt-cal-detail{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:10px}
.wt-cal-detail-date{font-family:'Barlow Condensed',sans-serif;font-size:17px;font-weight:700;margin-bottom:6px}
.wt-cal-detail-list{display:flex;gap:6px;flex-wrap:wrap}
.wt-cal-tag{background:var(--panel2);border:1px solid var(--accent);color:var(--text);border-radius:999px;padding:4px 12px;font-size:13px;text-transform:capitalize}
.wt-cal-legend{display:flex;align-items:center;gap:8px;color:var(--dim);font-size:12px;margin-top:12px;position:relative;padding-left:2px}
.wt-cal-legend .wt-cal-dot{position:static}
.wt-editbar{display:flex;align-items:center;justify-content:space-between;background:var(--panel2);border:1px solid var(--accent);border-radius:10px;padding:8px 12px;font-size:13px;color:var(--text)}
.wt-hist-actions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
.wt-custlist{display:flex;flex-direction:column;gap:2px;margin-top:8px}
.wt-cust-row{display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid var(--line)}
.wt-cust-actions{display:flex;gap:2px;flex:none}
.wt-cust-edit{border:1px solid var(--accent);border-radius:10px;padding:4px 8px;margin:4px 0}
.wt-settings-block{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px}
.wt-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:14px;cursor:pointer}
.wt-toggle-label{font-weight:600;font-size:15px;margin-bottom:2px}
.wt-switch-toggle{flex:none;width:48px;height:28px;border-radius:999px;background:var(--line);border:0;position:relative;cursor:pointer;transition:background .15s}
.wt-switch-toggle.on{background:var(--accent)}
.wt-switch-knob{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:left .15s}
.wt-switch-toggle.on .wt-switch-knob{left:23px}
.wt-settings-title{font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700;margin-bottom:6px}
.wt-err{color:#D67B7B;font-size:13px}
.wt-err.center{text-align:center;width:auto}
.wt-notice{color:#7FB88A;font-size:13px;background:var(--panel2);border-radius:8px;padding:9px 11px;text-align:center}
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
.wt-pick-row{display:flex;align-items:center;gap:10px;background:none;border:0;color:var(--text);font:inherit;text-align:left;padding:10px 6px;border-radius:8px;cursor:pointer;flex:1;min-width:0}
.wt-pick-wrap{border-radius:8px}
.wt-pick-row-inner{display:flex;align-items:center;gap:4px}
.wt-pick-row-inner:hover{background:var(--panel)}
.wt-pick-demo{background:none;border:1px solid var(--line);border-radius:8px;color:var(--dim);font-size:12px;width:32px;height:32px;flex:none;cursor:pointer;margin-right:4px}
.wt-pick-demo.on,.wt-pick-demo:hover{border-color:var(--plate);color:var(--text)}
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

/* ---------- v10: chart palette (validated: dataviz validate_palette.js, both modes pass) ---------- */
.wt-root.theme-dark{--viz-w:#9d7ee0;--viz-r:#1f9e76;--viz-grid:#2A2535;--viz-base:#453D57;--viz-up:#3ecf6e;--viz-down:#ef8080;--tag-bw:#1f9e76}
.wt-root.theme-light{--viz-w:#7148b5;--viz-r:#0f8a68;--viz-grid:#EEEAF5;--viz-base:#C9C0DC;--viz-up:#1a7f37;--viz-down:#c93636;--tag-bw:#0f8a68}

/* selected chips: filled, so the label stays readable in dark mode */
.wt-chip.on{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.pad-v{padding:10px 0 2px}

/* ---------- filters: muscle group -> specific muscle -> equipment ---------- */
.wt-filters{display:flex;flex-direction:column;gap:8px}
.wt-subchips{display:flex;gap:6px;flex-wrap:wrap;padding:8px;background:var(--panel2);border:1px solid var(--line);border-radius:12px}
.wt-subchip{background:transparent;border:1px solid transparent;color:var(--text);border-radius:999px;padding:5px 11px;font:inherit;font-size:13px;cursor:pointer}
.wt-subchip:hover{border-color:var(--line)}
.wt-subchip.on{background:var(--panel);border-color:var(--accent-soft);font-weight:600}
.wt-equip-select{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dim)}
.wt-equip-select select{background:var(--panel);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:6px 8px;font:inherit;font-size:13px}
.wt-lib-count{font-size:12px;color:var(--dim);letter-spacing:.04em}
.wt-lib-progress{margin:6px 0 2px;color:var(--accent-soft);font-weight:600}

/* ---------- equipment tags ---------- */
.wt-etag{display:inline-flex;align-items:center;flex:none;font-size:11px;font-weight:600;line-height:1;padding:3px 7px;border-radius:999px;border:1px solid var(--line);color:var(--dim);text-transform:none;letter-spacing:.01em;white-space:nowrap}
.wt-etag.bodyweight{border-color:var(--tag-bw);color:var(--text);background:color-mix(in srgb, var(--tag-bw) 16%, transparent)}
.wt-etag.bodyweight::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--tag-bw);margin-right:5px}
.wt-pick-text{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.wt-pick-text .wt-pick-name{max-width:none}
.wt-pick-meta{display:flex;align-items:center;gap:6px;min-width:0}
.wt-pick-muscle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.wt-card-sub{display:flex;align-items:center;gap:6px;flex-wrap:wrap}

/* ---------- live 1RM while logging ---------- */
.wt-e1-live{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--dim);background:var(--panel2);border-radius:8px;padding:7px 10px;margin-top:2px}
.wt-e1-live strong{color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:16px;margin-left:4px}
.wt-e1-live.pr{box-shadow:inset 3px 0 0 var(--viz-up)}
.wt-e1-badge{color:var(--viz-up);font-weight:700}
.wt-e1-prev{font-size:12px}

/* ---------- progress tab ---------- */
.wt-prog-filters{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}
.wt-prog-ex{display:flex;flex-direction:column;gap:4px;flex:1;min-width:180px}
.wt-prog-ex-label{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.wt-prog-ex select{background:var(--panel);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:10px;font:inherit;font-size:15px;text-transform:capitalize}
.wt-seg{display:flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;flex:none}
.wt-seg-btn{background:var(--panel);border:0;border-left:1px solid var(--line);color:var(--dim);font:inherit;font-weight:600;font-size:13px;padding:10px 13px;cursor:pointer;min-width:44px}
.wt-seg-btn:first-child{border-left:0}
.wt-seg-btn.on{background:var(--accent);color:var(--accent-ink)}
.wt-prog-head{display:flex;align-items:center;gap:10px;margin-top:2px}
.wt-prog-name{font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:700;text-transform:capitalize;flex:1;min-width:0;line-height:1.1}
.wt-empty.small{padding:18px 12px}

.wt-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.wt-kpi{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 10px 9px;min-width:0}
.wt-kpi-label{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wt-kpi-val{font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:700;line-height:1.15;margin:3px 0 2px;white-space:nowrap}
.wt-kpi-val small{font-size:12px;font-weight:600;color:var(--dim)}
.wt-kpi-x{font-size:15px;font-weight:600;color:var(--dim)}
.wt-kpi-sub{font-size:11px;color:var(--dim);line-height:1.35}
.wt-kpi-sub.stack{display:flex;flex-direction:column}
.wt-kpi-delta{font-weight:700;white-space:nowrap}
.wt-kpi-delta.up{color:var(--viz-up)}
.wt-kpi-delta.down{color:var(--viz-down)}
.wt-kpi-delta.flat{color:var(--dim)}

.wt-chart-card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 12px 10px;display:flex;flex-direction:column;gap:10px}
.wt-viz{width:100%}
.wt-viz-svg{display:block;touch-action:pan-y;cursor:crosshair;outline:none;border-radius:6px}
.wt-viz-svg:focus-visible{box-shadow:0 0 0 2px var(--accent-soft)}
.wt-viz-svg text{font-family:'Barlow',-apple-system,'Segoe UI',sans-serif}
.wt-viz-title{fill:var(--text);font-size:12px;font-weight:600}
.wt-viz-tick{fill:var(--dim);font-size:10.5px;font-variant-numeric:tabular-nums}
.wt-viz-grid{stroke:var(--viz-grid);stroke-width:1}
.wt-viz-base{stroke:var(--viz-base);stroke-width:1}
.wt-viz-cross{stroke:var(--dim);stroke-width:1;opacity:.55}
.wt-viz-line{fill:none;stroke:var(--viz-w);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.wt-viz-dot{fill:var(--viz-w);stroke:var(--panel);stroke-width:2}
.wt-viz-wash-top{stop-color:var(--viz-w);stop-opacity:.18}
.wt-viz-wash-bot{stop-color:var(--viz-w);stop-opacity:0}
.wt-viz-bar{fill:var(--viz-r);opacity:.72;transition:opacity .12s}
.wt-viz-bar.sel{opacity:1}
.wt-viz-end{fill:var(--text);font-size:12px;font-weight:700}
.wt-viz-pr{fill:var(--text);font-size:10px;font-weight:800;letter-spacing:.08em}
.wt-viz-key{stroke-width:2;stroke-linecap:round}
.wt-viz-key.w{stroke:var(--viz-w)}
.wt-viz-key-bar{fill:var(--viz-r)}
.wt-chart-note{text-align:center;font-size:13px}

.wt-readout{background:var(--panel2);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.wt-readout-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.wt-readout-date{font-family:'Barlow Condensed',sans-serif;font-size:17px;font-weight:700}
.wt-readout-name{font-size:13px;color:var(--dim);text-transform:capitalize}
.wt-pr-chip{font-size:10px;font-weight:800;letter-spacing:.1em;padding:3px 7px;border-radius:999px;background:var(--accent);color:var(--accent-ink)}
.wt-readout-vals{display:flex;gap:6px 18px;flex-wrap:wrap}
.wt-readout-val{display:flex;align-items:baseline;gap:5px}
.wt-readout-val strong{font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;line-height:1}
.wt-readout-val em{font-style:normal;font-size:12px;color:var(--dim);font-weight:600}
.wt-readout-val span:not(.wt-key){font-size:12px;color:var(--dim)}
.wt-key{display:inline-block;width:12px;height:2px;border-radius:1px;align-self:center;margin-right:2px}
.wt-key.w{background:var(--viz-w)}
.wt-key.r{background:var(--viz-r)}
.wt-readout-sets{font-size:12.5px;color:var(--dim)}
.wt-chart-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.wt-chart-foot .wt-hint{font-size:12px}
.wt-ptable-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px}
.wt-ptable{width:100%;border-collapse:collapse;font-size:12.5px}
.wt-ptable th{text-align:left;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);font-weight:600;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.wt-ptable td{padding:8px 10px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums;vertical-align:top}
.wt-ptable td:first-child,.wt-ptable td:nth-child(2){white-space:nowrap}
.wt-ptable tr:last-child td{border-bottom:0}
.wt-ptable tbody tr{cursor:pointer}
.wt-ptable tr.on td{background:var(--panel2)}

/* ---------- PR estimator ---------- */
.wt-pre{display:flex;flex-direction:column;gap:10px}
.wt-pre-lede{margin:-2px 0 0;font-size:13px}
.wt-pre-inputs{display:flex;align-items:flex-end;gap:10px}
.wt-pre-inputs label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--dim);flex:1;min-width:0}
.wt-pre-inputs input{background:var(--panel2);border:1px solid var(--line);border-radius:10px;color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;padding:8px 12px;width:100%;min-width:0}
.wt-pre-inputs input:focus{outline:2px solid var(--accent);outline-offset:0;border-color:transparent}
.wt-pre-x{font-size:20px;color:var(--dim);padding-bottom:10px}
.wt-pre-hero{display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 8px;background:var(--panel2);border-radius:12px;text-align:center}
.wt-pre-hero-label{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.wt-pre-hero-val{font-family:'Barlow Condensed',sans-serif;font-size:52px;font-weight:700;line-height:1}
.wt-pre-hero-val em{font-style:normal;font-size:20px;color:var(--dim)}
.wt-pre-range{font-size:12px;color:var(--dim)}
.wt-pre-warn{font-size:12.5px;color:var(--text);background:var(--panel2);border-left:3px solid var(--viz-down);border-radius:8px;padding:8px 10px}
.wt-pre-table{width:100%;border-collapse:collapse;font-size:13px}
.wt-pre-table caption{text-align:left;font-size:12px;color:var(--dim);padding-bottom:6px}
.wt-pre-table th{text-align:left;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--line)}
.wt-pre-table td{padding:6px 8px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
.wt-pre-table tr:last-child td{border-bottom:0}
.wt-pre-table tr.on td{background:var(--panel2);font-weight:700}
.wt-pre-src{font-size:12.5px}
.wt-pre-how summary{cursor:pointer;font-size:13px;color:var(--accent-soft);font-weight:600}
.wt-pre-how p{font-size:12.5px;color:var(--dim);margin:6px 0 0;line-height:1.5}
@media (max-width:380px){.wt-kpi-val{font-size:20px}.wt-kpi-x{font-size:13px}}
`;
