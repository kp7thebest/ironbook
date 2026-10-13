// Unit tests for pure helpers added in v12+: plate math, rename/merge, last note, warm-ups, series, weekly volume,
// routines, rest timer, cardio, effort.
// Run: node .testharness/unit.mjs
import { platesPerSide, isBarbell } from "../src/lib/plates.js";
import { renameInWorkouts, loggedNames } from "../src/lib/rename.js";
import { lastNote } from "../src/lib/registry.js";
import { bestE1 } from "../src/lib/strength.js";
import { setLine } from "../src/lib/helpers.js";
import { exerciseSeries } from "../src/lib/series.js";
import { weeklySets, weekStart, binOf } from "../src/lib/volume.js";
import { toRoutineEntries, routineToDraftEntries, isMissingTable } from "../src/lib/routines.js";
import { fmtClock, clampRest } from "../src/lib/rest.js";
import { parseDuration, fmtDuration, isCardioName, kindFor, cleanSession, blankSet, paceLine, displayToKm } from "../src/lib/session.js";
import { validEffort, withOptionalColumn, isMissingColumn } from "../src/lib/effort.js";
import { buildWorkbook } from "../src/lib/excel.js";

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}${cond ? "" : "  <-- " + detail}`);
  if (!cond) failures++;
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("\nplates.js");
check("100 kg on a 20 kg bar -> 25 + 15 per side", eq(platesPerSide(100, 20, "kg"), { perSide: [25, 15], leftover: 0 }), JSON.stringify(platesPerSide(100, 20, "kg")));
check("62.5 kg -> 20 + 1.25 per side", eq(platesPerSide(62.5, 20, "kg").perSide, [20, 1.25]));
check("142.5 kg -> 25 25 10 1.25", eq(platesPerSide(142.5, 20, "kg").perSide, [25, 25, 10, 1.25]));
check("63 kg -> 0.25 kg per side can't be loaded", platesPerSide(63, 20, "kg").leftover === 0.25, JSON.stringify(platesPerSide(63, 20, "kg")));
check("225 lb on a 45 lb bar -> 45 + 45 per side", eq(platesPerSide(225, 45, "lbs").perSide, [45, 45]));
check("185 lb -> 45 + 25", eq(platesPerSide(185, 45, "lbs").perSide, [45, 25]));
check("the bar alone -> no plates", eq(platesPerSide(20, 20, "kg"), { perSide: [], leftover: 0 }));
check("lighter than the bar -> flagged", platesPerSide(15, 20, "kg").belowBar === true);
check("no weight -> null", platesPerSide(null, 20, "kg") === null);
check("barbell detection", isBarbell({ equipment: "barbell" }) && !isBarbell({ equipment: "dumbbell" }) && !isBarbell(null));

console.log("\nrename.js");
const W = [
  { id: "a", date: "2026-09-01", name: "upper", entries: [{ exercise: "lat pulldown", muscle: "lats", sets: [{ weight: 50, reps: "8" }] }, { exercise: "chest press", muscle: "chest", sets: [] }] },
  { id: "b", date: "2026-09-03", name: "upper", entries: [{ exercise: "Lat Pulldown ", muscle: "lats", sets: [{ weight: 52, reps: "8" }], note: "seat 4" }] },
  { id: "c", date: "2026-09-05", name: "legs", entries: [{ exercise: "squat", muscle: "quadriceps", sets: [] }] },
];
let ch = renameInWorkouts(W, "lat pulldown", "Wide-grip pulldown");
check("only sessions that use the exercise change", eq(ch.map((c) => c.id), ["a", "b"]));
check("every spelling of the old name is renamed", ch.every((c) => c.data.entries.some((e) => e.exercise === "Wide-grip pulldown")) && !JSON.stringify(ch).includes("ulldown \""));
check("other exercises, sets and notes untouched", ch[0].data.entries[1].exercise === "chest press" && ch[1].data.entries[0].note === "seat 4" && ch[1].data.entries[0].sets[0].weight === 52);
check("session date/name kept", ch[0].data.date === "2026-09-01" && ch[0].data.name === "upper");
ch = renameInWorkouts(W, "lat pulldown", "chest press", "chest");
check("merge into another exercise adopts its muscle", ch[0].data.entries.filter((e) => e.exercise === "chest press").length === 2 && ch[0].data.entries[0].muscle === "chest");
check("no-op rename -> nothing to send", renameInWorkouts(W, "squat", "squat").length === 0);
check("case-only rename is allowed", renameInWorkouts(W, "squat", "Squat").length === 1);
check("blank new name -> nothing", renameInWorkouts(W, "squat", "  ").length === 0);
check("loggedNames excludes the one being renamed", eq(loggedNames(W, "lat pulldown"), ["chest press", "squat"]));

console.log("\nlastNote");
check("most recent non-empty note for that exercise", eq(lastNote(W, "lat pulldown", null), { date: "2026-09-03", note: "seat 4" }));
check("skips the draft being edited", lastNote(W, "lat pulldown", "b") === null);
check("no note -> null", lastNote(W, "squat", null) === null);

console.log("\nwarm-up sets (v13)");
const warm = [{ weight: 100, reps: "10", warmup: true }, { weight: 60, reps: "8" }];
check("warm-ups never give the best estimated 1RM", bestE1(warm).weight === 60);
check("warm-up shown in brackets", setLine(warm[0], "kg") === "(100×10)" && setLine(warm[1], "kg") === "60×8");
const ws = [{ id: "x", date: "2026-10-01", name: "push", entries: [{ exercise: "bench press", muscle: "chest", sets: warm }] }];
const pt = exerciseSeries(ws, "bench press")[0];
check("warm-up isn't the top set, but is still listed", pt.top.weight === 60 && pt.sets.length === 2);
check("a session of only warm-ups isn't plotted", exerciseSeries([{ id: "y", date: "2026-10-02", name: "push", entries: [{ exercise: "bench press", muscle: "chest", sets: [warm[0]] }] }], "bench press").length === 0);

console.log("\nweekly volume (v13)");
check("weeks start on Monday", weekStart("2026-10-13") === "2026-10-12" && weekStart("2026-10-11") === "2026-10-05" && weekStart("2026-10-12") === "2026-10-12");
const VW = [
  { id: 1, date: "2026-10-12", name: "pull", entries: [
    { exercise: "lat pulldown", muscle: "lats", sets: [{ weight: 40, reps: "10", warmup: true }, { weight: 60, reps: "8" }, { weight: 60, reps: "8" }] },
    { exercise: "bicep curl", muscle: "biceps", sets: [{ weight: 12, reps: "10" }, { weight: null, reps: "" }] }] },
  { id: 2, date: "2026-10-13", name: "pull", entries: [{ exercise: "seated rows", muscle: "middle back", sets: [{ weight: 50, reps: "10" }] }] },
  { id: 3, date: "2026-10-04", name: "legs", entries: [{ exercise: "squat", muscle: "quadriceps", sets: [{ weight: 100, reps: "5" }, { weight: 100, reps: "5" }] }] },
  { id: 4, date: "2026-07-01", name: "legs", entries: [{ exercise: "squat", muscle: "quadriceps", sets: [{ weight: 90, reps: "5" }] }] },
];
const v = weeklySets(VW, { weeks: 8, today: "2026-10-13" });
const row = (r) => v.rows.find((x) => x.region === r);
check("8 weeks, oldest first, ending this week", v.weeks.length === 8 && v.weeks[7] === "2026-10-12" && v.weeks[0] === "2026-08-24", JSON.stringify(v.weeks));
check("this week Back = 3 work sets (warm-up excluded, two exercises)", row("Back").counts[7] === 3, JSON.stringify(row("Back").counts));
check("empty sets don't count", row("Arms").counts[7] === 1);
check("Sunday 4 Oct counts in the week of Mon 28 Sep; older-than-range ignored", row("Legs").counts[5] === 2 && row("Legs").counts.reduce((a, b) => a + b, 0) === 2, JSON.stringify(row("Legs").counts));
check("detail lists exercises per cell", JSON.stringify(row("Back").detail[7]) === JSON.stringify({ "lat pulldown": 2, "seated rows": 1 }));
check("totals per week", v.totals[7] === 4 && v.totals[5] === 2 && v.totals[6] === 0, JSON.stringify(v.totals));
check("'Other' row hidden when empty", !v.rows.some((r) => r.region === "Other"));
check("colour bins 0 | 1–5 | 6–10 | … | 21+", [0, 1, 5, 6, 10, 11, 20, 21, 40].map(binOf).join("") === "011223455");

console.log("\nroutines + rest timer (v13)");
const draftEntries = [
  { id: "x1", exercise: "bench press", muscle: "chest", note: "grip 81", sets: [{ weight: 40, reps: "10", warmup: true }, { weight: 80, reps: "6" }] },
  { id: "x2", exercise: "  ", muscle: "chest", sets: [] },
  { id: "x3", exercise: "dips", muscle: "triceps", sets: [] },
];
const re = toRoutineEntries(draftEntries);
check("routine keeps exercises + set count + warm-ups, drops weights/reps/notes/blank names",
  eq(re, [{ exercise: "bench press", muscle: "chest", sets: [{ warmup: true }, {}] }, { exercise: "dips", muscle: "triceps", sets: [{}] }]), JSON.stringify(re));
const de = routineToDraftEntries({ entries: re });
check("starting a routine gives empty sets, warm-ups still marked", de.length === 2 && de[0].sets[0].warmup === true && de[0].sets[1].weight === null && de[0].sets[1].reps === "" && de[0].id);
check("missing-table errors recognised (42P01, PGRST205, message)", isMissingTable({ code: "42P01" }) && isMissingTable({ code: "PGRST205" }) && isMissingTable({ message: 'relation "public.routines" does not exist' }) && !isMissingTable(new TypeError("Failed to fetch")));
check("clock format", fmtClock(90000) === "1:30" && fmtClock(9001) === "0:10" && fmtClock(-5) === "0:00");
check("rest length clamped to 15 s – 10 min", clampRest(5) === 15 && clampRest(105) === 105 && clampRest(5000) === 600);

console.log("\ncardio (v14)");
check("time parsing: 25 / 25:30 / 25.30 / 1:05:00", parseDuration("25") === 1500 && parseDuration("25:30") === 1530 && parseDuration("25.30") === 1530 && parseDuration("1:05:00") === 3900);
check("bad times rejected (25:75, letters, 0, blank)", [parseDuration("25:75"), parseDuration("abc"), parseDuration("0"), parseDuration("")].every((x) => x === null));
check("time formatting", fmtDuration(1530) === "25:30" && fmtDuration(3900) === "1:05:00" && fmtDuration(59) === "0:59" && fmtDuration(null) === "");
check("cardio names detected", ["treadmill", "Running, Treadmill", "stairmaster", "rowing machine", "Stationary bike", "incline walk", "jump rope", "run"].every(isCardioName));
check("…but not strength moves", !["walking lunges", "Farmer's Walk", "seated rows", "upright row", "bicycle crunch", "leg press", "Runner's Stretch"].some(isCardioName));
const KW = [{ id: 1, date: "2026-10-01", name: "x", entries: [{ exercise: "Air Bike", muscle: "abdominals", kind: "cardio", sets: [{ time: 600 }] }, { exercise: "treadmill", muscle: "quadriceps", sets: [{ weight: 10, reps: "10" }] }] }];
check("kind follows what you logged last time (beats the name guess)", kindFor("air bike", KW) === "cardio" && kindFor("treadmill", KW) === "strength" && kindFor("elliptical", KW) === "cardio" && kindFor("squat", KW) === "strength");
const sess = cleanSession({ date: "2026-10-13", name: "conditioning", effort: 8 }, [
  { id: "a", exercise: "treadmill", muscle: "quadriceps", kind: "cardio", note: " easy pace ", sets: [{ tStr: "5", time: 300, warmup: true }, { tStr: "25:30", time: 1530, dStr: "5", distance: 5 }, { tStr: "", time: null }, { tStr: "zz", time: null }] },
  { id: "b", exercise: "squat", muscle: "quadriceps", sets: [{ weight: 100, reps: "5", wStr: "100" }, { weight: null, reps: "" }] },
]);
check("cardio session saved as time/distance; blank and invalid sets dropped; note trimmed",
  eq(sess.entries[0], { exercise: "treadmill", muscle: "quadriceps", kind: "cardio", sets: [{ time: 300, warmup: true }, { time: 1530, distance: 5 }], note: "easy pace" }), JSON.stringify(sess.entries[0]));
check("strength entry unchanged in shape (no kind, no input strings)", eq(sess.entries[1], { exercise: "squat", muscle: "quadriceps", sets: [{ weight: 100, reps: "5" }] }));
check("effort kept when 1–10", sess.effort === 8 && cleanSession({ effort: 0 }, []).effort === null && cleanSession({ effort: 11 }, []).effort === null && cleanSession({}, []).effort === null);
check("blank sets of each kind", eq(blankSet("cardio", true), { time: null, distance: null, warmup: true }) && eq(blankSet(undefined), { weight: null, reps: "" }));
check("pace and miles", paceLine({ time: 1530, distance: 5 }, "kg") === "5:06 /km" && displayToKm("3.1", "lbs") === 4.989 && paceLine({ time: 1530, distance: 0 }, "kg") === "");
const cs = exerciseSeries([{ id: 9, date: "2026-10-10", name: "c", effort: 6, entries: [{ exercise: "treadmill", muscle: "quadriceps", kind: "cardio", sets: [{ time: 300, warmup: true }, { time: 1200, distance: 3 }, { time: 600, distance: 1.5 }] }] }], "treadmill");
check("cardio progress point = work time (warm-up excluded), distance, minutes, effort",
  cs.length === 1 && cs[0].cardio && cs[0].time === 1800 && cs[0].distance === 4.5 && cs[0].top.rv === 30 && cs[0].effort === 6, JSON.stringify(cs[0]));
const vc = weeklySets([{ id: 1, date: "2026-10-12", name: "c", entries: [{ exercise: "treadmill", muscle: "quadriceps", kind: "cardio", sets: [{ time: 1800 }, { time: 300, warmup: true }] }, { exercise: "squat", muscle: "quadriceps", sets: [{ weight: 100, reps: "5" }] }] }], { weeks: 8, today: "2026-10-13" });
check("volume: cardio counted as minutes, not as Legs sets", vc.cardio[7] === 1800 && vc.rows.find((r) => r.region === "Legs").counts[7] === 1, JSON.stringify(vc.cardio));
const wb = buildWorkbook([{ date: "2026-10-12", name: "c", effort: 7, entries: [{ exercise: "treadmill", muscle: "quadriceps", kind: "cardio", sets: [{ time: 1530, distance: 5 }] }] }], "kg");
check("Excel: effort row, then cardio as distance | time", eq(wb[0].data[2], ["effort (1–10)", 7, null]) && eq(wb[0].data[3], ["treadmill", "5 km", "25:30"]), JSON.stringify(wb[0].data));

console.log("\neffort column fallback (v14)");
check("effort validation", validEffort(7) === 7 && validEffort(0) === null && validEffort(10.5) === null && validEffort("7") === null);
check("missing-column errors recognised", isMissingColumn({ code: "42703", message: "column workouts.effort does not exist" }) && isMissingColumn({ code: "PGRST204", message: "Could not find the 'effort' column of 'workouts' in the schema cache" }) && !isMissingColumn({ code: "42703", message: "column workouts.other does not exist" }) && !isMissingColumn(new TypeError("Failed to fetch")));
{
  const st = { has: true }; const calls = [];
  const r = await withOptionalColumn(st, async (withCol) => { calls.push(withCol); if (withCol) throw Object.assign(new Error("column workouts.effort does not exist"), { code: "42703" }); return "rows"; });
  check("column missing: retried without it, and remembered", r === "rows" && eq(calls, [true, false]) && st.has === false);
  const calls2 = []; await withOptionalColumn(st, async (w) => { calls2.push(w); return 1; });
  check("…later calls skip it straight away", eq(calls2, [false]));
  let threw = false; try { await withOptionalColumn({ has: true }, async () => { throw new TypeError("Failed to fetch"); }); } catch { threw = true; }
  check("other errors (offline) still surface for the sync queue", threw);
}

console.log(`\n${failures === 0 ? "ALL UNIT TESTS PASSED ✓" : failures + " UNIT TEST(S) FAILED ✗"}`);
process.exit(failures === 0 ? 0 : 1);
