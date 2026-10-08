// In-memory stand-in for db.js so the UI can be driven end-to-end without Supabase.
// Used only by the test build (vite.test.config.js aliases ./db.js to this file).
// "Me" gets the real spreadsheet history (41 sessions) so progress charts have realistic data.
//
// Test controls (set from Playwright via page.evaluate):
//   window.__stub.offline = true      every write/read throws a network error ("Failed to fetch")
//   window.__stub.loseNextReply = n   the next n writes reach the "server" but the reply is lost
//   window.__stub.server()            snapshot of my workouts as the server has them
// Open the app with ?signedout=1 to start on the sign-in screen. The valid invite code is "lift-together".
import { SEED } from "./seed.js";

const ME = "user-me";
const INVITE = "lift-together";
let profiles = [
  { id: ME, display_name: "Karthik", unit: "kg", is_private: false },
  { id: "user-friend", display_name: "Srijan", unit: "kg", is_private: false },
];
const uuid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2, 10));
let workouts = {
  [ME]: [
    {
      id: uuid(), date: "2026-09-14", name: "upper",
      entries: [
        { exercise: "lat pulldown", muscle: "lats", sets: [{ weight: 86, reps: "8" }, { weight: 86, reps: "6" }] },
        { exercise: "chest press", muscle: "chest", sets: [{ weight: 45, reps: "8" }] },
        { exercise: "lateral raise", muscle: "shoulders", sets: [{ weight: 25, reps: "8,8" }] },
      ],
    },
    ...SEED.map((w) => ({ id: uuid(), date: w.date, name: w.name, entries: w.entries })),
  ],
  "user-friend": [],
};
let customs = { [ME]: [] };

const S = (typeof window !== "undefined" ? (window.__stub = window.__stub || {}) : {});
S.offline = false;
S.loseNextReply = 0;
S.server = () => JSON.parse(JSON.stringify(workouts[ME]));
S.calls = [];

const netErr = () => new TypeError("Failed to fetch");
const ok = (v) => Promise.resolve(v);
const online = () => (S.offline ? Promise.reject(netErr()) : null);
// Run a write on the "server"; optionally lose the reply afterwards.
const write = (name, fn) => {
  S.calls.push(name);
  if (S.offline) return Promise.reject(netErr());
  try {
    const v = fn();
    if (S.loseNextReply > 0) { S.loseNextReply--; return Promise.reject(netErr()); }
    return ok(v);
  } catch (e) { return Promise.reject(e); }
};
const sortDesc = (rows) => [...rows].sort((a, b) => b.date.localeCompare(a.date));

// ---- auth ----
const signedOutStart = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("signedout") === "1";
let session = signedOutStart ? null : { user: { id: ME, email: "me@example.com" } };
let authCb = null;

export const configured = true;
export const supabase = {
  auth: {
    onAuthStateChange: (cb) => { authCb = cb; return { data: { subscription: { unsubscribe() { authCb = null; } } } }; },
    updateUser: () => ok({}),
  },
};
export const getSession = () => ok(session);
export const signIn = () => { session = { user: { id: ME, email: "me@example.com" } }; authCb && authCb("SIGNED_IN", session); return ok({}); };
// Mirrors patch_invite_code.sql: a wrong code makes Supabase answer "Database error saving new user".
export const signUp = (email, password, displayName, inviteCode) => {
  if (inviteCode !== INVITE) return Promise.reject(new Error("Database error saving new user"));
  session = { user: { id: ME, email } };
  setTimeout(() => authCb && authCb("SIGNED_IN", session), 0);
  return ok({});
};
export const signOut = () => { session = null; authCb && authCb("SIGNED_OUT", null); return ok({}); };
export const updatePassword = () => ok({});
export const sendPasswordReset = () => ok({});

// ---- profiles ----
export const fetchMyProfile = (id) => online() || ok(profiles.find((p) => p.id === id));
export const fetchProfiles = () => online() || ok(profiles);
export const updateUnit = (id, unit) => { profiles = profiles.map((p) => (p.id === id ? { ...p, unit } : p)); return ok({}); };
export const updatePrivacy = () => ok({});
export const updateDisplayName = () => ok({});
export const updateEmail = () => ok({});

// ---- workouts (same contract as db.js, including Postgres error codes) ----
export const fetchWorkouts = (id) => online() || ok(sortDesc(workouts[id] || []));
export const insertWorkout = (id, w) => write("insert", () => {
  const list = workouts[id] || [];
  if (w.id && list.some((x) => x.id === w.id)) {
    const e = new Error('duplicate key value violates unique constraint "workouts_pkey"'); e.code = "23505"; throw e;
  }
  const row = { id: w.id || uuid(), date: w.date, name: w.name, entries: w.entries };
  workouts[id] = [row, ...list];
  return row;
});
export const updateWorkout = (wid, w) => write("update", () => {
  const cur = workouts[ME].find((x) => x.id === wid);
  if (!cur) { const e = new Error("JSON object requested, multiple (or no) rows returned"); e.code = "PGRST116"; throw e; }
  workouts[ME] = workouts[ME].map((x) => (x.id === wid ? { ...x, date: w.date, name: w.name, entries: w.entries } : x));
  return workouts[ME].find((x) => x.id === wid);
});
export const deleteWorkout = (wid) => write("delete", () => { workouts[ME] = workouts[ME].filter((x) => x.id !== wid); return {}; });

// ---- custom exercises ----
export const fetchCustom = (id) => online() || ok(customs[id] || []);
export const fetchAllCustom = () => ok([]);
export const insertCustom = (id, c) => { customs[id] = [...(customs[id] || []), { ...c, id: uuid() }]; return ok({}); };
export const updateCustom = () => ok({});
export const deleteCustom = () => ok({});
