// In-memory stand-in for db.js so the UI can be driven end-to-end without Supabase.
// Used only by the test build (vite.test.config.js aliases ./db.js to this file).

const ME = "user-me";
let profiles = [
  { id: ME, display_name: "Karthik", unit: "kg", is_private: false },
  { id: "user-friend", display_name: "Srijan", unit: "kg", is_private: false },
];
let workouts = {
  [ME]: [
    {
      id: "w1", date: "2026-09-14", name: "upper",
      entries: [
        { exercise: "lat pulldown", muscle: "lats", sets: [{ weight: 86, reps: "8" }, { weight: 86, reps: "6" }] },
        { exercise: "chest press", muscle: "chest", sets: [{ weight: 45, reps: "8" }] },
        { exercise: "lateral raise", muscle: "shoulders", sets: [{ weight: 25, reps: "8,8" }] },
      ],
    },
  ],
  "user-friend": [],
};
let customs = { [ME]: [] };

const ok = (v) => Promise.resolve(v);
const uid = () => "id-" + Math.random().toString(36).slice(2, 8);

export const configured = true;
export const supabase = {
  auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    updateUser: () => ok({}),
  },
};
export const getSession = () => ok({ user: { id: ME, email: "me@example.com" } });
export const signIn = () => ok({});
export const signUp = () => ok({});
export const signOut = () => ok({});
export const updatePassword = () => ok({});
export const sendPasswordReset = () => ok({});

export const fetchMyProfile = (id) => ok(profiles.find((p) => p.id === id));
export const fetchProfiles = () => ok(profiles);
export const updateUnit = (id, unit) => { profiles = profiles.map((p) => (p.id === id ? { ...p, unit } : p)); return ok({}); };
export const updatePrivacy = () => ok({});
export const updateDisplayName = () => ok({});
export const updateEmail = () => ok({});

export const fetchWorkouts = (id) => ok([...(workouts[id] || [])].sort((a, b) => b.date.localeCompare(a.date)));
export const insertWorkout = (id, w) => {
  const row = { id: uid(), date: w.date, name: w.name, entries: w.entries };
  workouts[id] = [row, ...(workouts[id] || [])];
  return ok(row);
};
export const updateWorkout = (wid, w) => {
  workouts[ME] = workouts[ME].map((x) => (x.id === wid ? { ...x, ...w } : x));
  return ok(workouts[ME].find((x) => x.id === wid));
};
export const deleteWorkout = (wid) => { workouts[ME] = workouts[ME].filter((x) => x.id !== wid); return ok({}); };

export const fetchCustom = (id) => ok(customs[id] || []);
export const fetchAllCustom = () => ok([]);
export const insertCustom = (id, c) => { customs[id] = [...(customs[id] || []), { ...c, id: uid() }]; return ok({}); };
export const updateCustom = () => ok({});
export const deleteCustom = () => ok({});
