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

await page.locator(".wt-tab", { hasText: "Log" }).click();
await page.waitForTimeout(300);
await page.locator(".wt-chip", { hasText: /^upper$/ }).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: ".testharness/shot-log.png", fullPage: false });

await browser.close();

console.log("\n--- console/page errors ---");
if (errors.length === 0) console.log("  none ✓");
else { errors.slice(0, 10).forEach((e) => console.log("  " + e)); failures += errors.length; }

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED ✓" : failures + " CHECK(S) FAILED ✗"}`);
process.exit(failures === 0 ? 0 : 1);
