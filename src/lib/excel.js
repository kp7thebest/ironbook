import { distUnit, fmtDuration, kgToDisplay, kmToDisplay, norm, todayStr } from "./helpers.js";

// ============ EXCEL EXPORT ============
// Same layout as Srijan's original spreadsheet: one sheet per day type (upper, lower, …), one column
// pair (weight, reps) per session date, one row per set. Since v12 the file is written with
// write-excel-file (small, maintained) instead of the old npm "xlsx" 0.18.5, which SheetJS no
// longer updates on npm. The layout is unchanged — .testharness/excel-check.mjs compares both.

// Pure: workouts -> [{ sheet, data: rows of cells, columns: [{ width }] }]
export function buildWorkbook(workouts, unit) {
  const byDay = {};
  [...workouts].sort((a, b) => a.date.localeCompare(b.date)).forEach((w) => {
    (byDay[w.name] = byDay[w.name] || []).push(w);
  });
  const used = new Set();
  const sheets = [];
  for (const [day, sessions] of Object.entries(byDay)) {
    const dates = sessions.map((s) => s.date);
    const exOrder = []; const maxSets = {};
    sessions.forEach((s) => s.entries.forEach((e) => {
      const k = norm(e.exercise);
      if (maxSets[k] === undefined) { exOrder.push({ k, name: e.exercise }); maxSets[k] = 0; }
      maxSets[k] = Math.max(maxSets[k], e.sets.length);
    }));
    const header1 = ["exercise"]; const header2 = [null];
    dates.forEach((d) => { header1.push(d, null); header2.push(`weight (${unit})`, "reps"); });
    const rows = [header1, header2];
    // v14: effort row (only when any session in this sheet has one)
    if (sessions.some((s) => s.effort)) rows.push(["effort (1–10)", ...sessions.flatMap((s) => [s.effort || null, null])]);
    exOrder.forEach(({ k, name }) => {
      for (let i = 0; i < maxSets[k]; i++) {
        const row = [name];
        sessions.forEach((s) => {
          const e = s.entries.find((x) => norm(x.exercise) === k);
          const set = e && e.sets[i];
          // warm-up sets keep their numbers; the reps cell says "w" so they can be told apart.
          // cardio sets (v14): distance in the weight column, time in the reps column.
          if (set && set.time > 0) {
            row.push(set.distance != null ? `${kmToDisplay(set.distance, unit)} ${distUnit(unit)}` : null, fmtDuration(set.time) + (set.warmup ? " w" : ""));
          } else {
            row.push(set && set.weight != null ? kgToDisplay(set.weight, unit) : null, set && set.reps ? String(set.reps) + (set.warmup ? " w" : "") : null);
          }
        });
        rows.push(row);
      }
    });
    // Excel sheet names: max 31 chars, no \ / ? * [ ] :, unique (case-insensitive)
    let name = day.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "workout";
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${name.slice(0, 28)} ${n}`;
    used.add(name.toLowerCase());
    sheets.push({ sheet: name, data: rows, columns: [{ width: 26 }, ...dates.flatMap(() => [{ width: 11 }, { width: 7 }])] });
  }
  return sheets;
}

export const exportFileName = (who) => `ironbook-${who.toLowerCase().replace(/\s+/g, "-")}-${todayStr()}.xlsx`;

export async function exportToExcel(workouts, unit, who) {
  const sheets = buildWorkbook(workouts, unit);
  if (!sheets.length) throw new Error("Nothing to export yet");
  const { default: writeExcelFile } = await import("write-excel-file/universal"); // loaded on demand
  const blob = await writeExcelFile(sheets).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = exportFileName(who);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
