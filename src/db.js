import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && anonKey);
export const supabase = configured ? createClient(url, anonKey) : null;

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
export async function signUp(email, password, displayName) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
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

// ---------- workouts ----------
export async function fetchWorkouts(userId) {
  const { data, error } = await supabase
    .from("workouts")
    .select("id, date, name, entries")
    .eq("user_id", userId)
    .order("date", { ascending: false });
  if (error) throw error;
  return data;
}
export async function insertWorkout(userId, w) {
  const { data, error } = await supabase
    .from("workouts")
    .insert({ user_id: userId, date: w.date, name: w.name, entries: w.entries })
    .select("id, date, name, entries")
    .single();
  if (error) throw error;
  return data;
}
export async function deleteWorkout(id) {
  const { error } = await supabase.from("workouts").delete().eq("id", id);
  if (error) throw error;
}

// ---------- custom exercises ----------
export async function fetchCustom(userId) {
  const { data, error } = await supabase
    .from("custom_exercises")
    .select("name, muscle, equipment")
    .eq("user_id", userId);
  if (error) throw error;
  return data.map((c) => ({ ...c, source: "custom" }));
}
export async function insertCustom(userId, c) {
  const { error } = await supabase
    .from("custom_exercises")
    .upsert({ user_id: userId, name: c.name, muscle: c.muscle, equipment: c.equipment || "" }, { onConflict: "user_id,name" });
  if (error) throw error;
}
