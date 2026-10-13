import { createClient } from "@supabase/supabase-js";
import { withOptionalColumn } from "./lib/effort.js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && anonKey);

// Persist the session so you stay signed in across app restarts / PWA cold starts.
// Supabase issues a long-lived refresh token; these options make sure it's stored
// durably in localStorage and silently refreshed in the background.
export const supabase = configured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: "ironbook-auth",
        flowType: "pkce",
      },
    })
  : null;

// ---------- auth ----------
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
// The invite code is checked (and then removed from the user's metadata) by the database trigger
// in supabase/patch_invite_code.sql. A wrong code makes Supabase answer
// "Database error saving new user", which AuthScreen turns into a readable message.
export async function signUp(email, password, displayName, inviteCode) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName, invite_code: inviteCode } },
  });
  if (error) throw error;
}
export async function signOut() {
  await supabase.auth.signOut();
}
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/?reset=1",
  });
  if (error) throw error;
}

// ---------- profiles ----------
export async function fetchMyProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}
export async function fetchProfiles() {
  const { data, error } = await supabase.from("profiles").select("*").order("display_name");
  if (error) throw error;
  return data;
}
export async function updateUnit(userId, unit) {
  const { error } = await supabase.from("profiles").update({ unit }).eq("id", userId);
  if (error) throw error;
}
export async function updatePrivacy(userId, isPrivate) {
  const { error } = await supabase.from("profiles").update({ is_private: isPrivate }).eq("id", userId);
  if (error) throw error;
}
export async function updateDisplayName(userId, displayName) {
  const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", userId);
  if (error) throw error;
  // keep auth metadata in sync (used as the fallback on new signups)
  await supabase.auth.updateUser({ data: { display_name: displayName } });
}
export async function updateEmail(newEmail) {
  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) throw error;
}

// ---------- workouts ----------
// v14: `effort` (1–10) lives in a column added by supabase/patch_workout_effort.sql. Until it exists,
// withOptionalColumn() notices the "missing column" error once and leaves effort out from then on.
const effortCol = { has: true };
export const hasEffortColumn = () => effortCol.has;
const cols = (withEffort) => (withEffort ? "id, date, name, entries, effort" : "id, date, name, entries");

export async function fetchWorkouts(userId) {
  return withOptionalColumn(effortCol, async (withEffort) => {
    const { data, error } = await supabase
      .from("workouts")
      .select(cols(withEffort))
      .eq("user_id", userId)
      .order("date", { ascending: false });
    if (error) throw error;
    return data;
  });
}
// `w.id` is a UUID made on the phone (src/sync.js). Re-sending the same id fails with code 23505,
// which the sync queue treats as "already saved" — so retries never create duplicates.
export async function insertWorkout(userId, w) {
  return withOptionalColumn(effortCol, async (withEffort) => {
    const row = { user_id: userId, date: w.date, name: w.name, entries: w.entries };
    if (w.id) row.id = w.id;
    if (withEffort && w.effort != null) row.effort = w.effort;
    const { data, error } = await supabase.from("workouts").insert(row).select(cols(withEffort)).single();
    if (error) throw error;
    return data;
  });
}
export async function updateWorkout(id, w) {
  return withOptionalColumn(effortCol, async (withEffort) => {
    const patch = { date: w.date, name: w.name, entries: w.entries };
    if (withEffort) patch.effort = w.effort ?? null; // null clears it
    const { data, error } = await supabase.from("workouts").update(patch).eq("id", id).select(cols(withEffort)).single();
    if (error) throw error;
    return data;
  });
}
export async function deleteWorkout(id) {
  const { error } = await supabase.from("workouts").delete().eq("id", id);
  if (error) throw error;
}

// ---------- custom exercises ----------
// My own customs (used to build the exercise registry for logging/last-time).
export async function fetchCustom(userId) {
  const { data, error } = await supabase
    .from("custom_exercises")
    .select("id, name, muscle, equipment")
    .eq("user_id", userId);
  if (error) throw error;
  return data.map((c) => ({ ...c, source: "custom" }));
}
// Everyone's customs with author display name — for the Library management view.
export async function fetchAllCustom() {
  const { data, error } = await supabase
    .from("custom_exercises")
    .select("id, name, muscle, equipment, user_id, profiles(display_name)")
    .order("name");
  if (error) throw error;
  return data.map((c) => ({
    id: c.id, name: c.name, muscle: c.muscle, equipment: c.equipment,
    user_id: c.user_id, author: c.profiles ? c.profiles.display_name : "Unknown", source: "custom",
  }));
}
export async function insertCustom(userId, c) {
  const { error } = await supabase
    .from("custom_exercises")
    .upsert({ user_id: userId, name: c.name, muscle: c.muscle, equipment: c.equipment || "" }, { onConflict: "user_id,name" });
  if (error) throw error;
}
export async function updateCustom(id, c) {
  const { error } = await supabase
    .from("custom_exercises")
    .update({ name: c.name, muscle: c.muscle, equipment: c.equipment || "" })
    .eq("id", id);
  if (error) throw error;
}
export async function deleteCustom(id) {
  const { error } = await supabase.from("custom_exercises").delete().eq("id", id);
  if (error) throw error;
}

// ---------- routines (v13; needs supabase/patch_routines.sql) ----------
export async function fetchRoutines(userId) {
  const { data, error } = await supabase.from("routines").select("id, name, entries").eq("user_id", userId).order("name");
  if (error) throw error;
  return data;
}
// Saving under an existing name replaces that routine.
export async function saveRoutine(userId, r) {
  const { data, error } = await supabase
    .from("routines")
    .upsert({ user_id: userId, name: r.name, entries: r.entries, updated_at: new Date().toISOString() }, { onConflict: "user_id,name" })
    .select("id, name, entries")
    .single();
  if (error) throw error;
  return data;
}
export async function deleteRoutine(id) {
  const { error } = await supabase.from("routines").delete().eq("id", id);
  if (error) throw error;
}
