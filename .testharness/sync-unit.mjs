// Unit tests for src/sync.js (the offline queue). Run: node .testharness/sync-unit.mjs
import { makeOp, migrateQueue, enqueue, settle, applyOps, flushOps, newId } from "../src/sync.js";

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}${cond ? "" : "  <-- " + detail}`);
  if (!cond) failures++;
};
const D = (date, name = "upper") => ({ date, name, entries: [{ exercise: "squat", muscle: "quadriceps", sets: [{ weight: 100, reps: "5" }] }] });
const netErr = () => new TypeError("Failed to fetch");
const pgErr = (code) => Object.assign(new Error("pg " + code), { code });

console.log("\nsync.js");
check("newId is a v4 UUID", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(newId()));

// migration of the v10 queue format
const legacy = migrateQueue([D("2026-10-01"), D("2026-10-02")]);
check("v10 queue entries become insert ops with UUIDs", legacy.length === 2 && legacy.every((o) => o.kind === "insert" && o.id && o.opId && o.data.date));
check("already-migrated ops pass through unchanged", JSON.stringify(migrateQueue(legacy)) === JSON.stringify(legacy));
check("garbage queue -> empty", migrateQueue("nope").length === 0 && migrateQueue([null, 3]).length === 0);

// enqueue
const ins = makeOp("insert", "w1", D("2026-10-03"));
const up1 = makeOp("update", "w1", D("2026-10-03", "upper A"));
const up2 = makeOp("update", "w1", D("2026-10-03", "upper B"));
let q = enqueue(enqueue(enqueue([], ins), up1), up2);
check("a newer edit replaces an older edit, insert kept", q.length === 2 && q[0] === ins && q[1] === up2);
q = enqueue(q, makeOp("delete", "w1"));
check("delete replaces pending ops for that workout and is always sent", q.length === 1 && q[0].kind === "delete");

// applyOps
const rows = [{ id: "a", ...D("2026-09-01") }, { id: "b", ...D("2026-08-01") }];
const shown = applyOps(rows, [makeOp("insert", "c", D("2026-09-15")), makeOp("update", "b", D("2026-08-01", "legs")), makeOp("delete", "a")]);
check("applyOps: insert shown, sorted newest first", shown[0].id === "c" && shown[0].pendingSync === true);
check("applyOps: update applied and flagged", shown.find((w) => w.id === "b").name === "legs" && shown.find((w) => w.id === "b").pendingSync);
check("applyOps: delete removes", !shown.some((w) => w.id === "a"));
check("applyOps: insert twice shows once", applyOps(rows, [makeOp("insert", "a", D("2026-09-01"))]).length === 2);

// flushOps against a fake server
function server({ offlineAfter = Infinity, loseReplies = 0, refuse = [] } = {}) {
  const db = new Map(); let n = 0; let lost = loseReplies;
  const step = (fn) => { if (n++ >= offlineAfter) throw netErr(); const v = fn(); if (lost > 0) { lost--; throw netErr(); } return v; };
  return {
    db,
    api: {
      insertWorkout: async (id, data) => step(() => { if (refuse.includes(id)) throw pgErr("42501"); if (db.has(id)) throw pgErr("23505"); db.set(id, data); }),
      updateWorkout: async (id, data) => step(() => { if (!db.has(id)) throw pgErr("PGRST116"); db.set(id, data); }),
      deleteWorkout: async (id) => step(() => { db.delete(id); }),
    },
  };
}

{
  const s = server();
  const ops = [makeOp("insert", "x", D("2026-10-01")), makeOp("update", "x", D("2026-10-01", "pull")), makeOp("insert", "y", D("2026-10-02"))];
  const r = await flushOps(ops, s.api);
  check("online: every op sent in order", r.sent.length === 3 && s.db.get("x").name === "pull" && s.db.has("y"));
  check("settle() empties the queue", settle(ops, r.sent).length === 0);
}
{
  const s = server({ loseReplies: 1 });
  const op = makeOp("insert", "x", D("2026-10-01"));
  const r1 = await flushOps([op], s.api);
  check("lost reply: op stays queued", r1.offline && r1.sent.length === 0 && s.db.size === 1);
  const r2 = await flushOps([op], s.api);
  check("retry after lost reply: counted as saved, still ONE copy", r2.sent.length === 1 && s.db.size === 1);
}
{
  const s = server({ offlineAfter: 1 });
  const ops = [makeOp("insert", "x", D("2026-10-01")), makeOp("update", "x", D("2026-10-01", "B")), makeOp("insert", "y", D("2026-10-02"))];
  const r = await flushOps(ops, s.api);
  check("goes offline mid-flush: stops, later ops wait (order kept)", r.offline && r.sent.length === 1 && settle(ops, r.sent)[0].kind === "update");
}
{
  const s = server({ refuse: ["bad"] });
  const ops = [makeOp("insert", "bad", D("2026-10-01")), makeOp("update", "bad", D("2026-10-01", "B")), makeOp("insert", "ok", D("2026-10-02"))];
  const r = await flushOps(ops, s.api);
  const left = settle(ops, r.sent);
  check("refused insert is kept (not dropped) and holds back its edit", r.failed === 1 && left.length === 2 && left.every((o) => o.id === "bad"));
  check("...while other workouts still sync", s.db.has("ok"));
}
{
  const s = server();
  const r = await flushOps([makeOp("update", "gone", D("2026-10-01")), makeOp("delete", "never-existed")], s.api);
  check("edit of a deleted row / delete of a missing row: cleared, no error", r.sent.length === 2 && r.failed === 0);
}
{
  // A change made while a flush is running must survive settle().
  const s = server();
  const first = makeOp("insert", "x", D("2026-10-01"));
  let queue = [first];
  const running = flushOps(queue, s.api);
  queue = enqueue(queue, makeOp("update", "x", D("2026-10-01", "edited mid-flight")));
  const r = await running;
  queue = settle(queue, r.sent);
  check("edit made during a flush is kept for the next one", queue.length === 1 && queue[0].kind === "update");
  await flushOps(queue, s.api);
  check("...and lands on the server", s.db.get("x").name === "edited mid-flight");
}
{
  const s = server();
  let queue = [makeOp("insert", "x", D("2026-10-01"))];
  const running = flushOps(queue, s.api);
  queue = enqueue(queue, makeOp("delete", "x")); // delete while its insert is in flight
  const r = await running;
  queue = settle(queue, r.sent);
  await flushOps(queue, s.api);
  check("delete during an in-flight insert still removes it from the server", !s.db.has("x"));
}

console.log(`\n${failures === 0 ? "ALL SYNC TESTS PASSED ✓" : failures + " SYNC TEST(S) FAILED ✗"}`);
process.exit(failures === 0 ? 0 : 1);
