// Every main screen, both themes, phone size. Usage: node .testharness/shots-all.mjs <outdir>
// Needs the test preview running on :4178.
import fs from "fs";
import { launch } from "./browser.mjs";
const OUT = process.argv[2] || ".testharness/shots";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:4178";
const b = await launch();
const shot = async (p, name, opts = {}) => { await p.waitForTimeout(350); await p.screenshot({ path: `${OUT}/${name}.png`, ...opts }); };
try {
  for (const theme of ["dark", "light"]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.addInitScript((t) => localStorage.setItem("ironbook:theme", JSON.stringify(t)), theme);
    // sign-in
    const a = await ctx.newPage();
    await a.goto(BASE + "/?signedout=1"); await a.waitForSelector(".wt-form.auth");
    await shot(a, `${theme}-01-signin`); await a.close();

    await p.goto(BASE); await p.waitForSelector(".wt-tabs");
    await shot(p, `${theme}-02-log-start`);
    // active workout
    await p.locator(".wt-chip", { hasText: /^upper$/ }).first().click();
    await p.waitForSelector(".wt-card");
    const c = p.locator(".wt-card").first();
    const i = c.locator(".wt-set-row input");
    await i.nth(0).fill("40"); await i.nth(1).fill("12"); await c.locator(".wt-set-n").first().click();
    await i.nth(2).fill("86"); await i.nth(3).fill("8");
    await c.locator("button", { hasText: "+ Note" }).click(); await c.locator(".wt-note-input").fill("seat 4, pin 7");
    await p.locator(".wt-session-name").click();
    await shot(p, `${theme}-03-log-active`);
    await shot(p, `${theme}-04-log-active-full`, { fullPage: true });
    // save routine + finish
    await p.locator("button", { hasText: "Finish workout" }).click();
    await p.waitForSelector(".wt-hist-head");
    await p.locator(".wt-hist-head").first().click();
    await shot(p, `${theme}-05-history`);
    // progress
    await p.locator(".wt-tab", { hasText: "Progress" }).click();
    await p.selectOption(".wt-prog-ex select", "lat pulldown");
    await shot(p, `${theme}-06-progress`, { fullPage: true });
    const sid = await p.locator(".wt-compare-pick option", { hasText: "Srijan" }).getAttribute("value");
    await p.selectOption(".wt-compare-pick select", sid);
    await p.waitForSelector(".wt-cmp");
    await p.locator(".wt-compare").screenshot({ path: `${OUT}/${theme}-07-compare.png` });
    await p.locator(".wt-prog-mode .wt-seg-btn", { hasText: "Weekly volume" }).click();
    await p.waitForSelector(".wt-vol-table");
    await p.locator(".wt-vol-table tbody tr").nth(1).locator(".wt-vol-cell").last().click();
    await shot(p, `${theme}-08-volume`, { fullPage: true });
    // crew
    await p.locator(".wt-tab", { hasText: "Crew" }).click();
    await shot(p, `${theme}-09-friends`);
    await p.locator(".wt-crew-seg .wt-seg-btn", { hasText: "Calendar" }).click();
    await shot(p, `${theme}-10-calendar`);
    // more
    await p.locator(".wt-tab", { hasText: "More" }).click();
    await shot(p, `${theme}-11-more`);
    await p.locator(".wt-more-row", { hasText: "Library" }).click();
    await shot(p, `${theme}-12-library`);
    await p.locator(".wt-more-back").click();
    await p.locator(".wt-more-row", { hasText: "Settings" }).click();
    await shot(p, `${theme}-13-settings`, { fullPage: true });
    // rest timer + log start with routine
    await p.locator(".wt-tab", { hasText: "Log" }).click();
    await p.locator("button", { hasText: "or start empty" }).click();
    await p.locator("button", { hasText: "+ Add exercise" }).click();
    await shot(p, `${theme}-14-picker`);
    await p.locator(".wt-modal .wt-search").fill("bench press");
    await p.waitForTimeout(200);
    await p.locator(".wt-modal .wt-pick-row", { hasText: /^bench press/i }).first().click();
    const c2 = p.locator(".wt-card").first();
    await c2.locator(".wt-set-row input").nth(0).fill("100"); await c2.locator(".wt-set-row input").nth(1).fill("5");
    await c2.locator(".wt-set-row input").nth(2).click();
    await c2.locator("button", { hasText: "Plates" }).click();
    await shot(p, `${theme}-15-rest-plates`);
    await ctx.close();
  }
} finally { await b.close(); }
console.log("saved to", OUT);
