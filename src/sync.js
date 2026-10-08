// Offline-safe write queue for workouts (v11).
//
// Every change to a workout (finish, edit, delete) becomes an "op" that is saved on the phone
// first, applied to the screen at once, then sent to Supabase. If the phone is offline the op
// waits and is retried when the connection returns (see MainApp: launch, `online`, app resume).
//
//   { opId, kind: "insert", id, data: { date, name, entries } }
//   { opId, kind: "update", id, data: { date, name, entries } }
//   { opId, kind: "delete", id }
//
// Inserts carry a workout UUID made on the phone, so a retry after a lost reply can't create a
// second copy: Supabase rejects the repeat with a unique-key error (23505), which counts as saved.
//
// Ops are never merged into an earlier op that might already be on its way to the server — a
// newer edit replaces an older *edit*, and a delete is always sent — so a change made while a
// sync is running can't be lost. `opId` lets the queue drop exactly the ops that were sent.
//
// This file has no React and no storage access, so it can be unit-tested in plain Node.

export function newId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // RFC 4122 v4 from getRandomValues (older iOS without randomUUID)
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const makeOp = (kind, id, data) => (data ? { opId: newId(), kind, id, data } : { opId: newId(), kind, id });

// v10 and earlier stored the queue as a plain array of new sessions. Turn those into insert ops.
export function migrateQueue(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      if (!x.kind) return makeOp("insert", newId(), { date: x.date, name: x.name, entries: x.entries || [] });
      return x.opId ? x : { ...x, opId: newId() };
    });
}

// Add an op to the queue.
export function enqueue(ops, op) {
  if (op.kind === "update") return [...ops.filter((o) => !(o.id === op.id && o.kind === "update")), op];
  if (op.kind === "delete") return [...ops.filter((o) => o.id !== op.id), op];
  return [...ops.filter((o) => !(o.id === op.id && o.kind === "insert")), op];
}

// After a flush: drop the ops that were sent, keep everything else (including ops added meanwhile).
export const settle = (ops, sentOpIds) => ops.filter((o) => !sentOpIds.includes(o.opId));

const byDateDesc = (a, b) => (b.date || "").localeCompare(a.date || "");

// Apply ops to a list of workouts (what the screen shows). Rows touched by an op are marked pendingSync.
export function applyOps(rows, ops) {
  let out = rows.slice();
  for (const op of ops) {
    if (op.kind === "insert") {
      if (!out.some((w) => w.id === op.id)) out.push({ id: op.id, ...op.data, pendingSync: true });
    } else if (op.kind === "update") {
      out = out.map((w) => (w.id === op.id ? { ...w, ...op.data, pendingSync: true } : w));
    } else if (op.kind === "delete") {
      out = out.filter((w) => w.id !== op.id);
    }
  }
  return out.sort(byDateDesc); // stable sort keeps same-date order
}

export function isNetworkError(e) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (e instanceof TypeError) return true;
  const msg = String((e && (e.message || e.details)) || e || "");
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed|timed? ?out|offline/i.test(msg);
}

// Send ops in order. Stops at the first network error (everything after it waits too, so an
// edit is never sent before the insert it depends on).
//   api = { insertWorkout(id, data), updateWorkout(id, data), deleteWorkout(id) }
// Returns { sent: [opId…], failed, offline }.
export async function flushOps(ops, api) {
  const sent = [];
  let failed = 0;
  let offline = false;
  const blockedIds = new Set(); // a refused op holds back later ops for the same workout
  for (const op of ops) {
    if (blockedIds.has(op.id)) continue;
    try {
      if (op.kind === "insert") await api.insertWorkout(op.id, op.data);
      else if (op.kind === "update") await api.updateWorkout(op.id, op.data);
      else if (op.kind === "delete") await api.deleteWorkout(op.id);
      sent.push(op.opId);
    } catch (e) {
      const code = e && e.code;
      if (op.kind === "insert" && code === "23505") { sent.push(op.opId); continue; } // already saved
      if (op.kind === "update" && code === "PGRST116") { sent.push(op.opId); continue; } // row was deleted
      if (isNetworkError(e)) { offline = true; break; }
      // Refused for another reason: keep it (never silently drop a workout) and carry on with others.
      failed++;
      blockedIds.add(op.id);
    }
  }
  return { sent, failed, offline };
}
