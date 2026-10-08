// End-to-end check of the paths that were crashing to a blank page.
import { chromium } from "playwright";

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

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
// Ignore external assets the sandbox proxy blocks (Google Fonts, demo image CDN).
const IGNORE = /fonts\.googleapis|fonts\.gstatic|raw\.githubusercontent|ERR_TUNNEL_CONNECTION_FAILED|Failed to load resource/;
page.on("console", (m) => { if (m.type() === "error" && !IGNORE.test(m.text())) errors.push("console: " + m.text()); });

console.log("\n1. Load app (3s min loading screen)");
await page.goto(BASE);
await page.waitForSelector(".wt-tabs", { timeout: 15000 });
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
await page.locator(".wt-tab", { hasText: "Log" }).click();
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
  await page.locator(".wt-tab", { hasText: t }).click();
  await page.waitForTimeout(400);
  const txt = await bodyText(page);
  check(`${t} tab renders`, txt.length > 40, `blank on ${t}`);
}

console.log("\n7. Edit an existing session from History");
await page.locator(".wt-tab", { hasText: "History" }).click();
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
await page.locator(".wt-tab", { hasText: "Progress" }).click();
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
await page.locator(".wt-tab", { hasText: "Log" }).click();
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
await page.locator(".wt-tab", { hasText: "Library" }).click();
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
  await page.locator(".wt-tab", { hasText: "Log" }).click();
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

console.log("\n15. F3 — Import history removed");
await page.locator(".wt-tab", { hasText: "Settings" }).click();
await page.waitForTimeout(300);
check("Settings has no Import history", !/import history|import spreadsheet/i.test(await bodyText(page)));

console.log("\n16. F4 — no update banner on a normal launch");
check("no banner without a new version", (await page.locator(".wt-update").count()) === 0);

await page.locator(".wt-tab", { hasText: "Log" }).click();
await page.waitForTimeout(300);
await page.locator(".wt-chip", { hasText: /^upper$/ }).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: ".testharness/shot-log.png", fullPage: false });

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
    await p4.locator(".wt-tab", { hasText: "History" }).click();
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
