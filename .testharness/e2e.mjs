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
for (const t of ["History", "Calendar", "Friends", "Library", "Settings", "Log"]) {
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
