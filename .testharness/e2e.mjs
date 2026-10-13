// End-to-end check of the paths that were crashing to a blank page.
import { launch } from "./browser.mjs";

const BASE = process.env.BASE || "http://localhost:4178";
const errors = [];
let failures = 0;

const check = (name, cond, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}${cond ? "" : "  <-- " + detail}`);
  if (!cond) failures++;
};

const bodyText = (page) => page.evaluate(() => document.body.innerText.trim());
const notBlank = async (page, where) => {
  const t = await bodyText(page);
  check(`screen not blank after ${where}`, t.length > 40, `body text was ${JSON.stringify(t.slice(0, 80))}`);
  return t;
};

const browser = await launch();

// v12 bottom navigation: Log · History · Progress · Crew (Friends, Calendar) · More (Library, Settings)
async function goTab(p, name) {
  const nested = { Friends: ["Crew", "Friends"], Calendar: ["Crew", "Calendar"], Library: ["More", "Library"], Settings: ["More", "Settings"] };
  if (!nested[name]) return p.locator(".wt-tab", { hasText: name }).click();
  const [tab, sub] = nested[name];
  await p.locator(".wt-tab", { hasText: tab }).click();
  if (tab === "Crew") return p.locator(".wt-crew-seg .wt-seg-btn", { hasText: sub }).click();
  if (await p.locator(".wt-more-back").count()) await p.locator(".wt-more-back").click();
  return p.locator(".wt-more-row", { hasText: sub }).click();
}

const mainCtx = await browser.newContext({ viewport: { width: 420, height: 900 } }); // "the phone"
const page = await mainCtx.newPage();

page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
// Ignore external assets the sandbox proxy blocks (Google Fonts, demo image CDN).
const IGNORE = /fonts\.googleapis|fonts\.gstatic|raw\.githubusercontent|ERR_TUNNEL_CONNECTION_FAILED|Failed to load resource/;
page.on("console", (m) => { if (m.type() === "error" && !IGNORE.test(m.text())) errors.push("console: " + m.text()); });

console.log("\n1. Load app (P1: no fixed 3 s wait)");
const t0 = Date.now();
await page.goto(BASE);
await page.waitForSelector(".wt-tabs", { timeout: 15000 });
const firstLoadMs = Date.now() - t0;
check("first launch (nothing saved yet) opens without the old fixed 3 s wait", firstLoadMs < 2800, `${firstLoadMs} ms`);
await notBlank(page, "initial load");
check("Log tab present", await page.locator(".wt-tab", { hasText: "Log" }).count() > 0);

console.log("\n2. Start an 'upper' workout (should prefill from 14 Sep session)");
await page.locator(".wt-chip", { hasText: /^upper$/ }).first().click();
await page.waitForSelector(".wt-card", { timeout: 5000 });
const cards = await page.locator(".wt-card").count();
check("prefilled 3 exercises from last upper day", cards === 3, `got ${cards}`);
check("prefill banner shown", await page.locator(".wt-prefill-note").count() === 1);
const latCard = page.locator(".wt-card", { hasText: /lat pulldown/i }).first();
check("everyday name 'lat pulldown' gets a demo button via alias", (await latCard.locator(".wt-demo-btn").count()) === 1);
check("...and an equipment tag (Cable)", /cable/i.test(await latCard.locator(".wt-etag").innerText().catch(() => "")));

console.log("\n3. Reorder: grip bar + arrows");
check("grip bars rendered", await page.locator(".wt-grip").count() === 3);
const gripBox = await page.locator(".wt-grip-drag").first().boundingBox();
check("drag surface is a large target (>=44px tall, >150px wide)",
  gripBox.height >= 44 && gripBox.width > 150, `${Math.round(gripBox.width)}x${Math.round(gripBox.height)}`);
const firstTitleBefore = await page.locator(".wt-card-title").first().innerText();
// arrows are [up, down] within each grip; index 1 is "move down"
await page.locator(".wt-grip").first().locator(".wt-grip-btn").nth(1).click();
await page.waitForTimeout(150);
const firstTitleAfter = await page.locator(".wt-card-title").first().innerText();
check("▼ moved the first exercise down", firstTitleBefore !== firstTitleAfter,
  `still ${firstTitleAfter}`);
await notBlank(page, "reorder");

console.log("\n4. Fill a set and FINISH the workout  <-- was blank page");
const w = page.locator(".wt-set-row input").first();
await w.fill("62.25");
check("decimal weight accepted", (await w.inputValue()) === "62.25", await w.inputValue());
const reps = page.locator(".wt-set-row input").nth(1);
await reps.fill("6,6");
check("comma reps accepted", (await reps.inputValue()) === "6,6", await reps.inputValue());
await page.locator("button", { hasText: "Finish workout" }).click();
await page.waitForTimeout(800);
const afterFinish = await notBlank(page, "Finish workout");
check("landed on History after finishing", /sessions on record/i.test(afterFinish));

console.log("\n5. Start another workout then DISCARD  <-- was blank page");
await goTab(page, "Log");
await page.waitForTimeout(300);
await page.locator(".wt-chip", { hasText: /^pull$/ }).first().click();
await page.waitForTimeout(300);
page.once("dialog", (d) => d.accept());
await page.locator("button", { hasText: "Discard" }).click();
await page.waitForTimeout(600);
const afterDiscard = await notBlank(page, "Discard");
check("back on the start screen after discarding", /Ready to lift/i.test(afterDiscard));

console.log("\n6. Tab navigation sanity");
for (const t of ["History", "Progress", "Calendar", "Friends", "Library", "Settings", "Log"]) {
  await goTab(page, t);
  await page.waitForTimeout(400);
  const txt = await bodyText(page);
  check(`${t} tab renders`, txt.length > 40, `blank on ${t}`);
}

console.log("\n6b. N4 — bottom navigation");
{
  const tabs = await page.locator(".wt-tab").allInnerTexts();
  check("five tabs: Log, History, Progress, Crew, More", JSON.stringify(tabs.map((t) => t.trim())) === JSON.stringify(["Log", "History", "Progress", "Crew", "More"]), JSON.stringify(tabs));
  const vp = page.viewportSize();
  const nb = await page.locator(".wt-tabs").boundingBox();
  check("nav is pinned to the bottom of the screen", Math.abs(nb.y + nb.height - vp.height) <= 1, JSON.stringify(nb));
  const boxes = await Promise.all((await page.locator(".wt-tab").all()).map((t) => t.boundingBox()));
  check("every tab is a 44px+ touch target", boxes.every((b) => b.height >= 44 && b.width >= 44), JSON.stringify(boxes.map((b) => [Math.round(b.width), Math.round(b.height)])));
  await goTab(page, "History");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
  const lastRow = await page.locator(".wt-hist").last().boundingBox();
  const nb2 = await page.locator(".wt-tabs").boundingBox();
  check("scrolled to the end, the last session sits above the nav (not under it)", lastRow.y + lastRow.height <= nb2.y + 1,
    `row bottom ${Math.round(lastRow.y + lastRow.height)} vs nav top ${Math.round(nb2.y)}`);
  await goTab(page, "More");
  check("More remembers where you were (Settings, from the tab loop)", (await page.locator(".wt-more-back").count()) === 1);
  await page.locator(".wt-more-back").click();
  check("← More shows the menu: Library and Settings", (await page.locator(".wt-more-row").count()) === 2);
  await goTab(page, "Settings");
  await page.locator(".wt-tab", { hasText: "More" }).click();
  check("tapping More again returns to its menu", (await page.locator(".wt-more-row").count()) === 2);
}

console.log("\n7. Edit an existing session from History");
await goTab(page, "History");
await page.waitForTimeout(300);
await page.locator(".wt-hist-head").first().click();
await page.waitForTimeout(200);
await page.locator("button", { hasText: "Edit session" }).click();
await page.waitForTimeout(500);
await notBlank(page, "opening editor");
check("edit bar shown", await page.locator(".wt-editbar").count() === 1);
await page.locator(".wt-session-actions button", { hasText: "Save changes" }).click();
await page.waitForTimeout(800);
const afterSave = await notBlank(page, "Save changes");
check("returned to History after saving edit", /sessions on record/i.test(afterSave));

console.log("\n8. Progress tab: chart, tiles, interaction");
await goTab(page, "Progress");
await page.waitForSelector(".wt-viz-svg", { timeout: 5000 });
check("3 stat tiles", (await page.locator(".wt-kpi").count()) === 3);
await page.selectOption(".wt-prog-ex select", "lat pulldown");
await page.waitForTimeout(300);
const dots = await page.locator(".wt-viz-dot").count();
const bars = await page.locator(".wt-viz-bar").count();
check("lat pulldown: many sessions plotted", dots >= 8, `${dots} dots`);
check("reps columns line up with weight points", bars === dots, `${bars} bars vs ${dots} dots`);
check("single PR label on the weight panel", (await page.locator(".wt-viz-pr").count()) === 1);
check("no dual-axis: weight and reps are separate panels", (await page.locator(".wt-viz-title").count()) === 2);
const dateBefore = await page.locator(".wt-readout-date").innerText();
const vbox = await page.locator(".wt-viz-svg").boundingBox();
await page.mouse.click(vbox.x + 60, vbox.y + vbox.height / 2);
await page.waitForTimeout(200);
const dateAfter = await page.locator(".wt-readout-date").innerText();
check("tapping the chart selects another session", dateBefore !== dateAfter, `${dateBefore} -> ${dateAfter}`);
await page.locator(".wt-viz-svg").focus();
await page.keyboard.press("End");
await page.waitForTimeout(150);
check("End key returns to the latest session", (await page.locator(".wt-readout-date").innerText()) === dateBefore);
await page.locator("button", { hasText: "Show data table" }).click();
const trows = await page.locator(".wt-ptable tbody tr").count();
check("data table lists every plotted session", trows === dots, `${trows} rows`);
await page.locator(".wt-seg-btn", { hasText: "1M" }).click();
await page.waitForTimeout(300);
check("1M range renders", /No .* sessions in the last month|Top-set weight/i.test(await bodyText(page)));
await page.locator(".wt-seg-btn", { hasText: "All" }).click();
await page.selectOption(".wt-prog-ex select", "pullups");
await page.waitForTimeout(300);
check("bodyweight exercise: reps-only chart",
  (await page.locator(".wt-viz-dot").count()) === 0 && (await page.locator(".wt-viz-bar").count()) > 0);
check("pullups tagged Bodyweight", (await page.locator(".wt-prog-head .wt-etag.bodyweight").count()) === 1);
await notBlank(page, "Progress tab");

console.log("\n9. PR estimator");
const wIn = page.locator(".wt-pre-inputs input").nth(0);
const rIn = page.locator(".wt-pre-inputs input").nth(1);
await wIn.fill("50");
await rIn.fill("8");
await page.waitForTimeout(150);
const hero = (await page.locator(".wt-pre-hero-val").innerText()).trim();
check("50 kg x 8 -> 62.5 kg (avg of Epley 63.3 / Brzycki 62.1)", /^62\.5/.test(hero), hero);
check("rep-max table has 9 rows", (await page.locator(".wt-pre-table tbody tr").count()) === 9);
check("row for 8 reps is highlighted and ~50 kg",
  /^8\s+50(\.0)? kg/.test((await page.locator(".wt-pre-table tr.on").innerText()).replace(/\t/g, " ").trim()),
  await page.locator(".wt-pre-table tr.on").innerText());
await rIn.fill("15");
await page.waitForTimeout(100);
check("high-rep reliability warning", (await page.locator(".wt-pre-warn").count()) === 1);

console.log("\n10. Picker: muscle sub-filters, equipment filter, tags, live 1RM");
await goTab(page, "Log");
await page.waitForTimeout(300);
await page.locator("button", { hasText: "or start empty" }).click();
await page.waitForTimeout(300);
await page.locator("button", { hasText: "+ Add exercise" }).click();
await page.waitForSelector(".wt-modal");
await page.locator(".wt-modal .wt-chip", { hasText: /^Arms$/ }).click();
check("Arms reveals Biceps/Triceps/Forearms", (await page.locator(".wt-modal .wt-subchip").count()) === 4);
await page.locator(".wt-modal .wt-subchip", { hasText: "Forearms" }).click();
await page.waitForTimeout(200);
const fm = await page.locator(".wt-modal .wt-pick-muscle").allInnerTexts();
check("Forearms filter returns only forearm exercises", fm.length >= 10 && fm.every((m) => /forearms/i.test(m)),
  `${fm.length} rows, e.g. ${fm.slice(0, 3)}`);
await page.selectOption(".wt-modal .wt-equip-select select", "bodyweight");
await page.locator(".wt-modal .wt-chip", { hasText: /^All$/ }).click();
await page.waitForTimeout(200);
const bw = await page.locator(".wt-modal .wt-pick-row .wt-etag").allInnerTexts();
check("Bodyweight filter shows only Bodyweight-tagged rows", bw.length > 10 && bw.every((t) => t.trim() === "Bodyweight"), `${bw.length} tags`);
await page.selectOption(".wt-modal .wt-equip-select select", "any");
await page.locator(".wt-modal .wt-search").fill("bench press");
await page.waitForTimeout(200);
check("logged 'bench press' inherits a DB equipment tag",
  (await page.locator(".wt-modal .wt-pick-row", { hasText: /^bench press/i }).first().locator(".wt-etag").count()) === 1);
await page.locator(".wt-modal .wt-pick-row", { hasText: /^bench press/i }).first().click();
await page.waitForTimeout(300);
const inp = page.locator(".wt-card .wt-set-row input");
await inp.nth(0).fill("100");
await inp.nth(1).fill("5");
await page.waitForTimeout(150);
const live = await page.locator(".wt-e1-live").innerText();
check("live 1RM while logging: 100 x 5 -> 114.5", /114\.5/.test(live), live);
check("beats prior best (80 x 7) -> New PR badge", (await page.locator(".wt-e1-badge").count()) === 1);
page.once("dialog", (d) => d.accept());
await page.locator("button", { hasText: "Discard" }).click();
await page.waitForTimeout(400);

console.log("\n11. Library: filters + deep link to Progress");
await goTab(page, "Library");
await page.waitForTimeout(400);
await page.locator(".wt-chip", { hasText: /^Arms$/ }).click();
await page.locator(".wt-subchip", { hasText: "Forearms" }).click();
await page.waitForTimeout(200);
const libCount = await page.locator(".wt-lib-count").innerText();
check("Library can list all forearm exercises (>= 25)", parseInt(libCount, 10) >= 25, libCount);
await page.locator(".wt-chip", { hasText: /^All$/ }).click();
await page.locator(".wt-pane > .wt-search").fill("lat pulldown");
await page.waitForTimeout(200);
await page.locator(".wt-lib-row").first().click();
await page.locator("button", { hasText: "View progress chart" }).click();
await page.waitForSelector(".wt-prog-name", { timeout: 3000 });
check("'View progress chart' opens that exercise", /lat pulldown/i.test(await page.locator(".wt-prog-name").innerText()));
await notBlank(page, "deep link");

// ---------- v11 ----------
const stub = (fn, arg) => page.evaluate(fn, arg);
const serverRows = () => stub(() => window.__stub.server());
const toastText = async () => (await page.waitForSelector(".wt-toast", { timeout: 6000 })).innerText();
const waitToastGone = () => page.waitForSelector(".wt-toast", { state: "detached", timeout: 6000 }).catch(() => {});
const goOnline = async () => { await stub(() => { window.__stub.offline = false; window.dispatchEvent(new Event("online")); }); };
// Start an "upper" session, rename it, fill one set, finish.
async function logSession(name) {
  await goTab(page, "Log");
  await page.locator(".wt-chip", { hasText: /^upper$/ }).first().click();
  await page.waitForSelector(".wt-card");
  await page.locator(".wt-session-name").fill(name);
  await page.locator(".wt-set-row input").nth(0).fill("50");
  await page.locator(".wt-set-row input").nth(1).fill("8");
  await waitToastGone();
  await page.locator("button", { hasText: "Finish workout" }).click();
}
const histRow = (name) => page.locator(".wt-hist-head", { hasText: name }).first();

console.log("\n12. F2 — save while offline, edit while offline, then reconnect");
const before = (await serverRows()).length;
await stub(() => { window.__stub.offline = true; });
await logSession("offline test");
check("finish offline -> 'Saved on this phone' toast", /saved offline|saved on this phone/i.test(await toastText()));
check("history shows it as waiting to sync", /waiting to sync/i.test(await histRow("offline test").innerText()));
check("History opens at the top, new session in view", (await page.evaluate(() => window.scrollY)) === 0 && await histRow("offline test").isVisible());
check("nothing reached the server yet", (await serverRows()).length === before);
await histRow("offline test").click();
await page.locator("button", { hasText: "Edit session" }).click();
await page.locator(".wt-session-name").fill("offline test edited");
await waitToastGone();
await page.locator(".wt-session-actions button", { hasText: "Save changes" }).click();
check("edit offline -> kept on the phone", /saved offline|saved on this phone/i.test(await toastText()));
check("edited name shown while offline", (await histRow("offline test edited").count()) === 1);
await waitToastGone();
await goOnline();
check("reconnect -> 'Offline changes synced' toast", /offline changes synced/i.test(await toastText()));
let rows = await serverRows();
check("server now has exactly one copy, with the edit",
  rows.filter((w) => /^offline test/.test(w.name)).length === 1 && rows.some((w) => w.name === "offline test edited"),
  JSON.stringify(rows.filter((w) => /^offline test/.test(w.name)).map((w) => w.name)));
check("'waiting to sync' label cleared", !/waiting to sync/i.test(await histRow("offline test edited").innerText()));
check("queue emptied on the phone", (await stub(() => localStorage.getItem("ironbook:queue:user-me"))) === null);

console.log("\n13. F2 — save reaches the server but the reply is lost (the duplicate case)");
await waitToastGone();
await stub(() => { window.__stub.loseNextReply = 1; });
await logSession("lost reply test");
check("lost reply -> treated as not yet synced", /saved offline|saved on this phone/i.test(await toastText()));
check("...though the server did save it once", (await serverRows()).filter((w) => w.name === "lost reply test").length === 1);
await waitToastGone();
await goOnline();
await page.waitForTimeout(600);
check("retry does NOT create a second copy", (await serverRows()).filter((w) => w.name === "lost reply test").length === 1);
check("label cleared after retry", !/waiting to sync/i.test(await histRow("lost reply test").innerText()));

console.log("\n14. F2 — delete while offline");
await waitToastGone();
await stub(() => { window.__stub.offline = true; });
await histRow("lost reply test").click();
page.once("dialog", (d) => d.accept());
await page.locator("button", { hasText: "Delete session" }).click();
check("delete offline -> kept on the phone", /saved offline|saved on this phone/i.test(await toastText()));
check("row gone from the list right away", (await histRow("lost reply test").count()) === 0);
check("server still has it until reconnect", (await serverRows()).some((w) => w.name === "lost reply test"));
await waitToastGone();
await goOnline();
await page.waitForTimeout(600);
check("after reconnect the server deleted it", !(await serverRows()).some((w) => w.name === "lost reply test"));

console.log("\n14b. P4 — Excel export (write-excel-file) downloads a real .xlsx");
{
  await goTab(page, "History");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), page.locator(".wt-export").click()]);
  const file = await dl.path();
  const fs = await import("fs");
  const buf = fs.readFileSync(file);
  check("export file name", /^ironbook-karthik-\d{4}-\d{2}-\d{2}\.xlsx$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  check("export is a zip-based .xlsx with one sheet per day type",
    buf.slice(0, 2).toString() === "PK" && buf.length > 5000 && (buf.toString("latin1").match(/xl\/worksheets\/sheet\d+\.xml/g) || []).length >= 5,
    `${buf.length} bytes`);
}

console.log("\n15. F3 — Import history removed");
await goTab(page, "Settings");
await page.waitForTimeout(300);
check("Settings has no Import history", !/import history|import spreadsheet/i.test(await bodyText(page)));

console.log("\n16. F4 — no update banner on a normal launch");
check("no banner without a new version", (await page.locator(".wt-update").count()) === 0);

await goTab(page, "Log");
await page.waitForTimeout(300);
await page.locator(".wt-chip", { hasText: /^upper$/ }).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: ".testharness/shot-log.png", fullPage: false });

console.log("\n16b. P5 — crew data is cached between tab switches");
await goTab(page, "Friends");
await page.waitForSelector(".wt-friend-row");
const readsBefore = await stub(() => window.__stub.reads);
await goTab(page, "History");
await stub(() => { window.__stub.offline = true; });
await goTab(page, "Friends");
check("Friends shows the crew instantly from cache, even offline", (await page.locator(".wt-friend-row").count()) >= 1);
await stub(() => { window.__stub.offline = false; });
check("...and still refreshes in the background", (await stub(() => window.__stub.reads)) > readsBefore);
await goTab(page, "Log");

console.log("\n16c. P1 — reopening opens instantly from the saved copy, even offline");
{
  const p5 = await mainCtx.newPage(); // same phone: shares localStorage with the main page
  p5.on("pageerror", (e) => errors.push("pageerror(p5): " + e.message));
  await p5.addInitScript(() => { window.__stub = { offline: true }; });
  const t1 = Date.now();
  await p5.goto(BASE);
  await p5.waitForSelector(".wt-tabs", { timeout: 15000 });
  const ms = Date.now() - t1;
  check("offline relaunch opens the app (not the error screen)", (await p5.locator(".wt-tabs").count()) === 1 && !/couldn’t load your log/i.test(await bodyText(p5)));
  check("relaunch is quick (no fixed wait)", ms < 2800, `${ms} ms`);
  check("offline relaunch says it is showing the saved log", /showing the log saved on this phone/i.test(await (await p5.waitForSelector(".wt-toast", { timeout: 5000 })).innerText()));
  await goTab(p5, "History");
  check("History lists the saved sessions offline", /offline test edited/i.test(await bodyText(p5)));
  await goTab(p5, "Progress");
  await p5.waitForTimeout(500);
  check("exercise database still loads after first paint (equipment tag on Progress)", (await p5.locator(".wt-prog-head .wt-etag").count()) >= 1);
  await p5.evaluate(() => { window.__stub.offline = false; });
  await goTab(p5, "Settings");
  await p5.locator("button", { hasText: "Sign out" }).click();
  await p5.waitForSelector(".wt-form.auth", { timeout: 5000 });
  check("sign-out removes the saved copy of the log", (await p5.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("ironbook:cache:")).length)) === 0);
  await p5.close();
}

console.log("\n20. v12 — exercise notes (N2) and plate math (N5)");
const exCount = (rows, name) => rows.reduce((n, w) => n + w.entries.filter((e) => e.exercise.trim().toLowerCase() === name).length, 0);
async function startEmptyWith(name) {
  await goTab(page, "Log");
  if (await page.locator("button", { hasText: "Discard" }).count()) {
    page.once("dialog", (d) => d.accept());
    await page.locator("button", { hasText: "Discard" }).click();
  }
  await page.locator("button", { hasText: "or start empty" }).click();
  await page.locator("button", { hasText: "+ Add exercise" }).click();
  await page.locator(".wt-modal .wt-search").fill(name);
  await page.waitForTimeout(200);
  await page.locator(".wt-modal .wt-pick-row", { hasText: new RegExp("^" + name, "i") }).first().click();
  await page.waitForSelector(".wt-card");
}
{
  await startEmptyWith("bench press");
  const card = page.locator(".wt-card").first();
  await card.locator(".wt-set-row input").nth(0).fill("100");
  await card.locator(".wt-set-row input").nth(1).fill("5");
  await card.locator("button", { hasText: "Plates" }).click();
  const plateText = async () => (await card.locator(".wt-plates-row").first().locator(".wt-plate-chip").allInnerTexts()).join(" ");
  check("barbell exercise: Plates shows 25 + 15 per side for 100 kg on a 20 kg bar", (await plateText()) === "25 15", await plateText());
  await card.locator(".wt-plates .wt-seg-btn", { hasText: "15 kg bar" }).click();
  check("switching to a 15 kg bar -> 25 + 15 + 2.5", (await plateText()) === "25 15 2.5", await plateText());
  await card.locator(".wt-plates .wt-seg-btn", { hasText: "20 kg bar" }).click();
  await card.locator("button", { hasText: "+ Note" }).click();
  await card.locator(".wt-note-input").fill("grip at the rings, 81 cm");
  await waitToastGone();
  await page.locator("button", { hasText: "Finish workout" }).click();
  await toastText();
  const saved = (await serverRows()).find((w) => w.entries.some((e) => e.note === "grip at the rings, 81 cm"));
  check("note is saved with the session", Boolean(saved));
  await page.locator(".wt-hist-head").first().click();
  check("History shows the note under the exercise", /grip at the rings, 81 cm/.test(await page.locator(".wt-hist-body").first().innerText()));
  await startEmptyWith("bench press");
  check("next time, the card shows the last note", /grip at the rings, 81 cm/.test(await page.locator(".wt-card .wt-lastnote").first().innerText().catch(() => "")));
  page.once("dialog", (d) => d.accept());
  await page.locator("button", { hasText: "Discard" }).click();
  await startEmptyWith("lat pulldown");
  check("non-barbell exercise (lat pulldown) has no Plates button", (await page.locator(".wt-card button", { hasText: "Plates" }).count()) === 0);
  page.once("dialog", (d) => d.accept());
  await page.locator("button", { hasText: "Discard" }).click();
}

console.log("\n21. v12 — rename and merge across my log (N3)");
{
  const before = await serverRows();
  const nBench = exCount(before, "bench press");
  await goTab(page, "Library");
  await page.locator(".wt-pane > .wt-search").fill("bench press");
  await page.waitForTimeout(200);
  await page.locator(".wt-lib-row", { hasText: /^bench press/i }).first().click();
  await page.locator("button", { hasText: "Rename across my log" }).click();
  check("rename form says how many sessions change", new RegExp(`Updates ${nBench} session`).test(await page.locator(".wt-rename").innerText()), await page.locator(".wt-rename").innerText());
  await page.locator(".wt-rename input").fill("Flat barbell bench");
  await waitToastGone();
  await page.locator(".wt-rename button", { hasText: /^Rename$/ }).click();
  check("toast reports the sessions renamed", new RegExp(`Renamed in ${nBench} session`).test(await toastText()));
  let after = await serverRows();
  check("server: old name gone, new name on every session", exCount(after, "bench press") === 0 && exCount(after, "flat barbell bench") === nBench, `${exCount(after, "bench press")} / ${exCount(after, "flat barbell bench")}`);
  const openNames = await page.locator(".wt-lib-item.open .wt-pick-name").allInnerTexts();
  check("library now opens the renamed exercise", openNames.length === 1 && openNames[0].trim().toLowerCase() === "flat barbell bench", JSON.stringify(openNames) + " search=" + await page.locator(".wt-pane > .wt-search").inputValue());

  const nRev = exCount(after, "reverse curl"), nBay = exCount(after, "bayesian curl");
  await page.locator(".wt-pane > .wt-search").fill("reverse curl");
  await page.waitForTimeout(200);
  await page.locator(".wt-lib-row", { hasText: /^reverse curl/i }).first().click();
  await page.locator("button", { hasText: "Rename across my log" }).click();
  await page.locator(".wt-rename input").fill("Bayesian Curl");
  check("typing an existing exercise offers a merge", /Merges into/.test(await page.locator(".wt-rename").innerText()) && (await page.locator(".wt-rename button", { hasText: /^Merge$/ }).count()) === 1);
  await waitToastGone();
  page.once("dialog", (d) => d.accept());
  await page.locator(".wt-rename button", { hasText: /^Merge$/ }).click();
  await toastText();
  after = await serverRows();
  check("merge: one history with both sets of sessions", exCount(after, "reverse curl") === 0 && exCount(after, "bayesian curl") === nRev + nBay, `${nRev}+${nBay} -> ${exCount(after, "bayesian curl")}`);
  check("merge keeps the existing spelling (no stray capitalisation)", after.every((w) => w.entries.every((e) => e.exercise !== "Bayesian Curl")));
}

console.log("\n22. v13 — warm-up sets (N7)");
{
  await startEmptyWith("lat pulldown");
  const card = page.locator(".wt-card").first();
  const inp = card.locator(".wt-set-row input");
  await inp.nth(0).fill("40"); await inp.nth(1).fill("12");
  await inp.nth(2).fill("60"); await inp.nth(3).fill("8");
  await card.locator(".wt-set-n").first().click();
  check("tapping the set number marks a warm-up (shows W)", (await card.locator(".wt-set-n").first().innerText()).trim() === "W" && (await card.locator(".wt-set-n.warm").count()) === 1);
  check("live 1RM ignores the warm-up (60×8 -> 75)", /\b75\b/.test(await card.locator(".wt-e1-live").innerText()), await card.locator(".wt-e1-live").innerText());
  await waitToastGone();
  await page.locator("button", { hasText: "Finish workout" }).click();
  await toastText();
  const saved = (await serverRows()).find((w) => w.entries.some((e) => e.exercise === "lat pulldown" && e.sets.some((x) => x.warmup)));
  check("warm-up flag saved with the set", Boolean(saved) && saved.entries[0].sets[0].warmup === true && !saved.entries[0].sets[1].warmup);
  await page.locator(".wt-hist-head").first().click();
  check("History shows the warm-up in brackets", /\(40×12\)/.test(await page.locator(".wt-hist-body").first().innerText()));
}

console.log("\n23. v13 — weekly volume heatmap (N8)");
{
  await goTab(page, "Progress");
  await page.locator(".wt-prog-mode .wt-seg-btn", { hasText: "Weekly volume" }).click();
  await page.waitForSelector(".wt-vol-table");
  check("heatmap has 8 week columns", (await page.locator(".wt-vol-table thead th").count()) === 9);
  // expected this-week Back sets, computed independently from the server rows
  const now = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const mon = new Date(now.getTime() - ((now.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
  const BACK = ["lats", "middle back", "lower back", "traps"];
  const expBack = (await serverRows()).filter((w) => w.date >= mon).reduce((n, w) => n + w.entries.filter((e) => BACK.includes(e.muscle))
    .reduce((m, e) => m + e.sets.filter((x) => !x.warmup && (x.weight != null || (x.reps && String(x.reps).trim()))).length, 0), 0);
  const backRow = page.locator(".wt-vol-table tbody tr", { hasText: "Back" });
  const backNow = (await backRow.locator(".wt-vol-cell").last().innerText()).trim();
  check("this week's Back cell = work sets logged (warm-ups excluded)", Number(backNow || 0) === expBack, `${backNow} vs ${expBack}`);
  await backRow.locator(".wt-vol-cell").last().click();
  check("tapping a cell lists its exercises", /lat pulldown/i.test(await page.locator(".wt-vol-readout").innerText()));
  check("cells have screen-reader labels", /Back, week of .*: \d+ work sets?/.test(await backRow.locator(".wt-vol-cell").last().getAttribute("aria-label")));
  await page.locator(".wt-prog-mode .wt-seg-btn", { hasText: "By exercise" }).click();
}

console.log("\n24. v13 — compare with a crew member (N9)");
{
  await page.selectOption(".wt-prog-ex select", "lat pulldown");
  await page.waitForSelector(".wt-compare-pick select");
  const srijanId = await page.locator(".wt-compare-pick option", { hasText: "Srijan" }).getAttribute("value");
  await page.selectOption(".wt-compare-pick select", srijanId);
  await page.waitForSelector(".wt-cmp", { timeout: 5000 });
  check("compare chart: legend shows You and Srijan", (await page.locator(".wt-cmp-key").allInnerTexts()).map((t) => t.trim()).join("|") === "You|Srijan");
  check("Srijan's 5 sessions plotted", (await page.locator(".wt-cmp-dot.them").count()) === 5);
  check("latest readout: Srijan 67.5×6 -> est. 1RM 79.5 kg (warm-up ignored)", /Srijan: 79\.5 kg/.test(await page.locator(".wt-cmp-readout").innerText()), await page.locator(".wt-cmp-readout").innerText());
  await page.locator(".wt-cmp svg").scrollIntoViewIfNeeded();
  const box = await page.locator(".wt-cmp svg").boundingBox();
  await page.mouse.click(box.x + box.width - 50, box.y + 60);
  check("tapping the chart picks a session", /·/.test(await page.locator(".wt-cmp-readout").innerText()) && (await page.locator(".wt-cmp-dot[r='6']").count()) === 1);
  await page.locator(".wt-cmp button", { hasText: "Show table" }).click();
  check("table view lists every plotted session", (await page.locator(".wt-cmp-table tbody tr").count()) === (await page.locator(".wt-cmp-dot").count()));
  await page.selectOption(".wt-prog-ex select", "squat");
  await page.waitForTimeout(200);
  check("exercise they haven't logged -> plain message, no chart", /hasn’t logged/.test(await page.locator(".wt-compare").innerText()) && (await page.locator(".wt-cmp").count()) === 0);
  await page.selectOption(".wt-compare-pick select", "");
}

console.log("\n25. v13 — rest timer (N1)");
{
  await startEmptyWith("lat pulldown");
  const card = page.locator(".wt-card").first();
  const inp = card.locator(".wt-set-row input");
  await inp.nth(0).fill("50"); await inp.nth(1).fill("10");
  await inp.nth(2).click(); // leaving the reps box = set done
  await page.waitForSelector(".wt-rest", { timeout: 3000 }).catch(() => {});
  check("entering a set's reps starts the rest timer", (await page.locator(".wt-rest").count()) === 1 && /lat pulldown/i.test(await page.locator(".wt-rest").innerText()));
  check("default rest 1:30", /1:(30|29|28)/.test(await page.locator(".wt-rest-clock").innerText()), await page.locator(".wt-rest-clock").innerText());
  await page.locator(".wt-rest-btn", { hasText: "+15" }).click();
  check("+15 adds 15 s", /1:4[2-5]/.test(await page.locator(".wt-rest-clock").innerText()), await page.locator(".wt-rest-clock").innerText());
  check("...and that exercise now remembers 105 s", (await stub(() => JSON.parse(localStorage.getItem("ironbook:restsec"))["lat pulldown"])) === 105);
  await goTab(page, "History");
  check("timer stays visible on other tabs", (await page.locator(".wt-rest").count()) === 1);
  const rb = await page.locator(".wt-rest-row").boundingBox(), nb = await page.locator(".wt-tabs").boundingBox();
  check("timer sits above the bottom nav, not over it", rb.y + rb.height <= nb.y + 1, `${Math.round(rb.y + rb.height)} vs ${Math.round(nb.y)}`);
  await page.locator(".wt-rest-btn.close").click();
  check("✕ stops it", (await page.locator(".wt-rest").count()) === 0);
  await goTab(page, "Settings");
  await page.locator("button[role=switch][aria-label='Rest timer']").click();
  await goTab(page, "Log");
  await page.locator(".wt-card .wt-set-row input").nth(3).fill("8");
  await page.locator(".wt-card .wt-set-row input").nth(0).click();
  await page.waitForTimeout(300);
  check("switched off in Settings -> no timer", (await page.locator(".wt-rest").count()) === 0);
  await goTab(page, "Settings");
  await page.locator("button[role=switch][aria-label='Rest timer']").click();
  await goTab(page, "Log");
  page.once("dialog", (d) => d.accept());
  await page.locator("button", { hasText: "Discard" }).click();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p6 = await ctx.newPage();
  p6.on("pageerror", (e) => errors.push("pageerror(p6): " + e.message));
  await p6.clock.install();
  await p6.goto(BASE);
  await p6.waitForSelector(".wt-tabs", { timeout: 15000 });
  await p6.locator("button", { hasText: "or start empty" }).click();
  await p6.locator("button", { hasText: "+ Add exercise" }).click();
  await p6.locator(".wt-modal .wt-search").fill("squat");
  await p6.waitForTimeout(200);
  await p6.locator(".wt-modal .wt-pick-row", { hasText: /^squat/i }).first().click();
  const i6 = p6.locator(".wt-card .wt-set-row input");
  await i6.nth(0).fill("100"); await i6.nth(1).fill("5"); await i6.nth(0).click();
  await p6.waitForSelector(".wt-rest");
  await p6.clock.fastForward(91000);
  await p6.waitForTimeout(400);
  check("after 90 s: 'Rest over — next set'", (await p6.locator(".wt-rest.done").count()) === 1 && /rest over/i.test(await p6.locator(".wt-rest").innerText()));
  await p6.reload();
  await p6.waitForSelector(".wt-tabs");
  check("a finished rest is still shown after reopening (briefly)", (await p6.locator(".wt-rest.done").count()) === 1);
  await p6.clock.fastForward(25000);
  await p6.waitForTimeout(400);
  check("...and clears itself 20 s after it ended", (await p6.locator(".wt-rest").count()) === 0);
  await ctx.close();
}

console.log("\n26. v13 — saved routines (N6)");
{
  await goTab(page, "Log");
  await page.locator(".wt-chip", { hasText: /^upper$/ }).first().click();
  await page.waitForSelector(".wt-card");
  const nCards = await page.locator(".wt-card").count();
  // first set = warm-up in the routine (it may already be one: pre-loading keeps warm-up positions)
  check("pre-loading a split keeps which sets were warm-ups", (await page.locator(".wt-card").first().locator(".wt-set-n.warm").count()) === 1);
  if (!(await page.locator(".wt-card").first().locator(".wt-set-n").first().getAttribute("class")).includes("warm")) {
    await page.locator(".wt-card .wt-set-n").first().click();
  }
  await page.locator("button", { hasText: "Save as routine" }).click();
  await page.locator(".wt-routine-form input").fill("Upper A");
  await waitToastGone();
  await page.locator(".wt-routine-form button", { hasText: "Save routine" }).click();
  check("saving a routine", /Routine “Upper A” saved/.test(await toastText()));
  const rs = await stub(() => window.__stub.routines());
  check("routine stores the exercises and sets, not weights", rs.length === 1 && rs[0].entries.length === nCards && rs[0].entries[0].sets[0].warmup === true && !("weight" in rs[0].entries[0].sets[0]));
  page.once("dialog", (d) => d.accept());
  await page.locator("button", { hasText: "Discard" }).click();
  check("start screen lists the routine", (await page.locator(".wt-routine-start", { hasText: "Upper A" }).count()) === 1);
  await page.locator(".wt-routine-start", { hasText: "Upper A" }).click();
  await page.waitForSelector(".wt-card");
  check("starting it loads the same exercises", (await page.locator(".wt-card").count()) === nCards && (await page.locator(".wt-session-name").inputValue()) === "Upper A");
  check("...says it came from the routine", /Started from your Upper A routine/.test(await page.locator(".wt-prefill-note").innerText()));
  check("...and keeps the warm-up set", (await page.locator(".wt-card").first().locator(".wt-set-n.warm").count()) === 1);
  page.once("dialog", (d) => d.accept());
  await page.locator("button", { hasText: "Discard" }).click();
  await goTab(page, "History");
  await page.locator(".wt-hist-head").first().click();
  await page.locator(".wt-hist-body button", { hasText: "Save as routine" }).click();
  check("History: name defaults to the session's name", (await page.locator(".wt-routine-form input").inputValue()).length > 0);
  await page.locator(".wt-routine-form input").fill("From history");
  await waitToastGone();
  await page.locator(".wt-routine-form button", { hasText: "Save routine" }).click();
  await toastText();
  check("History: saved as a second routine", (await stub(() => window.__stub.routines())).length === 2);
  await goTab(page, "Log");
  await page.locator(".wt-routines button", { hasText: "Manage" }).click();
  page.once("dialog", (d) => d.accept());
  await page.locator(".wt-routine-row", { hasText: "Upper A" }).locator("button", { hasText: "Delete" }).click();
  await page.waitForTimeout(300);
  check("Manage → Delete removes it", (await stub(() => window.__stub.routines())).map((r) => r.name).join() === "From history");
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p7 = await ctx.newPage();
  p7.on("pageerror", (e) => errors.push("pageerror(p7): " + e.message));
  await p7.addInitScript(() => { window.__stub = { noRoutinesTable: true }; });
  await p7.goto(BASE);
  await p7.waitForSelector(".wt-tabs", { timeout: 15000 });
  await goTab(p7, "History");
  await p7.locator(".wt-hist-head").first().click();
  await p7.locator(".wt-hist-body button", { hasText: "Save as routine" }).click();
  check("before patch_routines.sql is run: explains what to do", /patch_routines\.sql/.test(await p7.locator(".wt-routine-form").innerText()));
  await ctx.close();
}

console.log("\n27. Layout on a small phone (360 px), both themes");
for (const theme of ["dark", "light"]) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const p8 = await ctx.newPage();
  p8.on("pageerror", (e) => errors.push("pageerror(p8): " + e.message));
  await p8.addInitScript((t) => localStorage.setItem("ironbook:theme", JSON.stringify(t)), theme);
  await p8.goto(BASE);
  await p8.waitForSelector(".wt-tabs", { timeout: 15000 });
  const overflow = [];
  for (const t of ["Log", "History", "Progress", "Friends", "Calendar", "Library", "Settings"]) {
    await goTab(p8, t);
    await p8.waitForTimeout(250);
    const wide = await p8.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (wide > 1) overflow.push(`${t} +${wide}px`);
  }
  check(`${theme}: no screen scrolls sideways`, overflow.length === 0, overflow.join(", "));
  const boxes = await p8.evaluate(() => [...document.querySelectorAll(".wt-header .wt-title, .wt-header button")].map((el) => {
    const r = el.getBoundingClientRect(); return [el.className, Math.round(r.left), Math.round(r.right)];
  }));
  check(`${theme}: wordmark, theme, kg/lbs and your initial all fit in the header`, boxes.length >= 5 && boxes.every(([, l, r]) => l >= 0 && r <= 360), JSON.stringify(boxes));
  await goTab(p8, "Log");
  await p8.locator(".wt-chip", { hasText: /^upper$/ }).first().click();
  await p8.waitForSelector(".wt-card");
  const row = await p8.locator(".wt-set-row").first().boundingBox();
  check(`${theme}: set row fits (plate, weight, reps, remove)`, row.x >= 0 && row.x + row.width <= 360, JSON.stringify(row));
  await p8.locator(".wt-me").click();
  check(`${theme}: tapping your initial opens Settings`, (await p8.locator(".wt-settings-title", { hasText: "Profile" }).count()) === 1);
  await ctx.close();
}

console.log("\n28. v14 — effort 1–10");
{
  await goTab(page, "Log");
  if (await page.locator("button", { hasText: "Discard" }).count()) { page.once("dialog", (d) => d.accept()); await page.locator("button", { hasText: "Discard" }).click(); }
  await page.locator(".wt-chip", { hasText: /^legs$/ }).first().click();
  await page.waitForSelector(".wt-card");
  check("effort picker on the workout, 10 options, optional", (await page.locator(".wt-effort-btn").count()) === 10 && /Optional/.test(await page.locator(".wt-effort-val").innerText()));
  await page.locator(".wt-effort-btn", { hasText: /^7$/ }).click();
  check("picking 7 shows 7/10 · Hard and fills 1–7", /7\/10 · Hard/.test(await page.locator(".wt-effort-val").innerText()) && (await page.locator(".wt-effort-btn.fill").count()) === 7);
  await page.locator(".wt-effort-btn", { hasText: /^7$/ }).click();
  check("tapping it again clears it", /Optional/.test(await page.locator(".wt-effort-val").innerText()));
  await page.locator(".wt-effort-btn", { hasText: /^8$/ }).click();
  await page.locator(".wt-card").first().locator(".wt-set-row input").nth(0).fill("100");
  await page.locator(".wt-card").first().locator(".wt-set-row input").nth(1).fill("5");
  await page.locator(".wt-session-name").fill("effort test");
  await waitToastGone();
  await page.locator("button", { hasText: "Finish workout" }).click();
  await toastText();
  const saved = (await serverRows()).find((w) => w.name === "effort test");
  check("effort saved with the workout", saved && saved.effort === 8, JSON.stringify(saved && saved.effort));
  check("History shows 8/10", /8\/10/.test(await histRow("effort test").innerText()));
  await histRow("effort test").click();
  await page.locator("button", { hasText: "Edit session" }).click();
  check("editing shows the saved effort", (await page.locator(".wt-effort-btn.on").innerText()).trim() === "8");
  await page.locator(".wt-effort-btn", { hasText: /^6$/ }).click();
  await waitToastGone();
  await page.locator(".wt-session-actions button", { hasText: "Save changes" }).click();
  await toastText();
  check("changing it in an edit is saved", (await serverRows()).find((w) => w.name === "effort test").effort === 6);
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p9 = await ctx.newPage();
  p9.on("pageerror", (e) => errors.push("pageerror(p9): " + e.message));
  await p9.addInitScript(() => { window.__stub = { noEffortColumn: true }; });
  await p9.goto(BASE);
  await p9.waitForSelector(".wt-tabs", { timeout: 15000 });
  await p9.locator("button", { hasText: "or start empty" }).click();
  check("before patch_workout_effort.sql: picker says effort won't be saved yet", /patch_workout_effort\.sql/.test(await p9.locator(".wt-effort").innerText()));
  await ctx.close();
}

console.log("\n29. v14 — cardio: time instead of weight × reps");
{
  await startEmptyWith("running, treadmill");
  if (await page.locator(".wt-rest").count()) await page.locator(".wt-rest-btn.close").click(); // left over from section 28
  const card = page.locator(".wt-card").first();
  check("Running, Treadmill opens as time + distance", /Time \(min:sec\)/.test(await card.locator(".wt-sets-head").innerText()) && /Distance \(km\)/.test(await card.locator(".wt-sets-head").innerText()));
  const inp = card.locator(".wt-set-row input");
  await inp.nth(0).fill("25.30"); await inp.nth(1).fill("5");
  check("time typed as 25.30 (number pad) reads as 25:30; set plate fills", (await card.locator(".wt-set-n.done").count()) === 1);
  check("total and pace shown", /25:30/.test(await card.locator(".wt-e1-live").innerText()) && /5:06 \/km/.test(await card.locator(".wt-e1-live").innerText()), await card.locator(".wt-e1-live").innerText());
  await inp.nth(1).blur();
  check("no rest timer, plates, 1RM or 'similar' on cardio", (await page.locator(".wt-rest").count()) === 0 && (await card.locator("button", { hasText: "Plates" }).count()) === 0 && (await card.locator(".wt-similar").count()) === 0);
  await inp.nth(0).fill("25:99");
  check("an impossible time is flagged", (await inp.nth(0).getAttribute("aria-invalid")) === "true");
  await inp.nth(0).fill("25:30");
  await page.locator("button", { hasText: "+ Add exercise" }).click();
  await page.locator(".wt-modal .wt-search").fill("bench press");
  await page.waitForTimeout(200);
  await page.locator(".wt-modal .wt-pick-row", { hasText: /bench/i }).first().click();
  const bench = page.locator(".wt-card").nth(1);
  check("bench press still weight × reps", /Weight \(kg\)/.test(await bench.locator(".wt-sets-head").innerText()));
  await bench.locator("button", { hasText: "Use time" }).click();
  check("'Use time' switches any exercise to time", /Time \(min:sec\)/.test(await bench.locator(".wt-sets-head").innerText()));
  await bench.locator("button", { hasText: "Use weight × reps" }).click();
  await page.locator(".wt-session-name").fill("cardio test");
  await waitToastGone();
  await page.locator("button", { hasText: "Finish workout" }).click();
  await toastText();
  const saved = (await serverRows()).find((w) => w.name === "cardio test");
  const tm = saved && saved.entries.find((e) => e.exercise.toLowerCase() === "running, treadmill");
  check("saved as cardio with seconds and km", tm && tm.kind === "cardio" && tm.sets[0].time === 1530 && tm.sets[0].distance === 5, JSON.stringify(tm));
  await page.locator(".wt-hist-head").first().click();
  check("History shows 25:30 · 5 km", /25:30 · 5 km/.test(await page.locator(".wt-hist-body").first().innerText()));
  await page.locator(".wt-unit-btn", { hasText: "lbs" }).click();
  check("…and miles when using lbs", /25:30 · 3\.11 mi/.test(await page.locator(".wt-hist-body").first().innerText()));
  await page.locator(".wt-unit-btn", { hasText: "kg" }).click();
  await startEmptyWith("running, treadmill");
  check("next time: last time shows the cardio session", /25:30 · 5 km/.test(await page.locator(".wt-card").first().locator(".wt-lasttime").innerText()));
  page.once("dialog", (d) => d.accept());
  await page.locator("button", { hasText: "Discard" }).click();
  await goTab(page, "Progress");
  await page.locator(".wt-prog-mode .wt-seg-btn", { hasText: "By exercise" }).click();
  await page.selectOption(".wt-prog-ex select", "running, treadmill");
  await page.waitForTimeout(200);
  check("Progress for cardio: time tiles and minutes chart, no PR estimator",
    /Longest/.test(await page.locator(".wt-kpis").innerText()) && /Minutes/.test(await page.locator(".wt-viz-svg").innerHTML()) && (await page.locator(".wt-pre-hero-val").count()) === 0);
  await page.locator(".wt-prog-mode .wt-seg-btn", { hasText: "Weekly volume" }).click();
  check("weekly volume: cardio shown as minutes, separately", /Cardio/.test(await page.locator(".wt-vol-cardio").innerText()) && /26/.test(await page.locator(".wt-vol-cardio").innerText()));
  await page.locator(".wt-prog-mode .wt-seg-btn", { hasText: "By exercise" }).click();
}

console.log("\n30. v14 — colour schemes");
{
  await goTab(page, "Settings");
  check("seven schemes offered", (await page.locator(".wt-scheme").count()) === 7);
  check("Violet is selected by default", (await page.locator(".wt-scheme.on .wt-scheme-name").innerText()).trim() === "Violet");
  await page.locator(".wt-scheme", { hasText: "Pool" }).click();
  check("picking Pool recolours the app", (await page.locator(".wt-root").getAttribute("class")).includes("scheme-pool")
    && (await page.evaluate(() => getComputedStyle(document.querySelector(".wt-root")).getPropertyValue("--accent").trim().toUpperCase())) === "#34DDE5");
  await page.reload();
  await page.waitForSelector(".wt-tabs");
  check("…and it's remembered on this phone", (await page.locator(".wt-root").getAttribute("class")).includes("scheme-pool"));
  await goTab(page, "Settings");
  await page.locator(".wt-scheme", { hasText: "Violet" }).click();
  check("back to Violet", !(await page.locator(".wt-root").getAttribute("class")).includes("scheme-"));
}

console.log("\n17. F2 — a v10-format offline queue is migrated and sent on launch");
{
  const p2 = await browser.newPage({ viewport: { width: 420, height: 900 } });
  p2.on("pageerror", (e) => errors.push("pageerror(p2): " + e.message));
  await p2.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("ironbook:queue:user-me", JSON.stringify([
      { date: "2026-10-01", name: "legacy queued", entries: [{ exercise: "squat", muscle: "quadriceps", sets: [{ weight: 100, reps: "5" }] }] },
    ]));
  });
  await p2.goto(BASE);
  await p2.waitForSelector(".wt-tabs", { timeout: 15000 });
  const r2 = await p2.evaluate(() => window.__stub.server());
  check("legacy queued session saved once", r2.filter((w) => w.name === "legacy queued").length === 1);
  check("legacy queue cleared", (await p2.evaluate(() => localStorage.getItem("ironbook:queue:user-me"))) === null);
  await p2.close();
}

console.log("\n18. F1 — sign-up needs the invite code");
{
  const p3 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p3.on("pageerror", (e) => errors.push("pageerror(p3): " + e.message));
  await p3.goto(BASE + "/?signedout=1");
  await p3.waitForSelector(".wt-form.auth", { timeout: 15000 });
  await p3.locator("button", { hasText: "Create an account" }).click();
  check("sign-up form has an Invite code field", (await p3.locator("label", { hasText: "Invite code" }).count()) === 1);
  const field = (label) => p3.locator("label", { hasText: label }).locator("input");
  await field("Display name").fill("Nitant");
  await field("Email").fill("nitant@example.com");
  await field("Password").fill("secret123");
  await p3.locator("button", { hasText: "Create account" }).click();
  check("missing code -> asks for it", /enter the invite code/i.test(await p3.locator(".wt-err").innerText()));
  await field("Invite code").fill("let-me-in");
  await p3.locator("button", { hasText: "Create account" }).click();
  await p3.waitForTimeout(200);
  check("wrong code -> readable error, not 'Database error'",
    /invite code didn’t work/i.test(await p3.locator(".wt-err").innerText()) && !/database error/i.test(await bodyText(p3)));
  await p3.screenshot({ path: ".testharness/v11-signup.png" });
  await field("Invite code").fill("lift-together");
  await p3.locator("button", { hasText: "Create account" }).click();
  await p3.waitForSelector(".wt-tabs", { timeout: 15000 }).catch(() => {});
  check("right code -> account created, app opens", (await p3.locator(".wt-tabs").count()) === 1);
  await p3.close();
}

console.log("\n19. F4 — new version: banner, Later, auto-refresh on reopen (not while editing)");
{
  const fs = await import("fs");
  const SW = new URL("./dist-test/sw.js", import.meta.url);
  const original = fs.readFileSync(SW, "utf8");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p4 = await ctx.newPage();
  p4.on("pageerror", (e) => errors.push("pageerror(p4): " + e.message));
  try {
    await p4.goto(BASE);
    await p4.waitForSelector(".wt-tabs", { timeout: 15000 });
    await p4.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 10000 });
    await p4.waitForTimeout(300);
    check("first install shows no banner", (await p4.locator(".wt-update").count()) === 0);
    // Ship a "new version" of the service worker, then bring the app to the foreground.
    let n = 0;
    const shipNewVersion = () => fs.writeFileSync(SW, original + `\n// test build ${Date.now()}-${n++}\n`);
    const resume = () => p4.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    shipNewVersion();
    await resume();
    await p4.waitForSelector(".wt-update", { timeout: 10000 }).catch(() => {});
    check("app resume finds the new version -> banner", (await p4.locator(".wt-update").count()) === 1);
    await p4.screenshot({ path: ".testharness/v11-update-banner.png" });
    await p4.locator(".wt-update-later").click();
    check("Later hides the banner", (await p4.locator(".wt-update").count()) === 0);
    // While a past session is open for editing, reopening must NOT reload.
    await p4.evaluate(() => { window.__marker = 1; });
    await goTab(p4, "History");
    await p4.locator(".wt-hist-head").first().click();
    await p4.locator("button", { hasText: "Edit session" }).click();
    await resume();
    await p4.waitForTimeout(800);
    check("no auto-refresh while editing a past session", (await p4.evaluate(() => window.__marker)) === 1);
    await p4.locator(".wt-editbar button", { hasText: "Cancel" }).click();
    await resume();
    await p4.waitForFunction(() => !window.__marker, null, { timeout: 8000 }).catch(() => {});
    check("reopening the app after that refreshes it", (await p4.evaluate(() => window.__marker)) !== 1);
    await p4.waitForSelector(".wt-tabs", { timeout: 15000 });
    check("after refresh: app loads, no banner", (await p4.locator(".wt-update").count()) === 0);
  } finally {
    fs.writeFileSync(SW, original);
    await ctx.close();
  }
}

await browser.close();

console.log("\n--- console/page errors ---");
if (errors.length === 0) console.log("  none ✓");
else { errors.slice(0, 10).forEach((e) => console.log("  " + e)); failures += errors.length; }

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED ✓" : failures + " CHECK(S) FAILED ✗"}`);
process.exit(failures === 0 ? 0 : 1);
