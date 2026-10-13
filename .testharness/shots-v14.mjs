// v14 screenshots: every colour scheme in both themes (Log with effort + Progress), plus the cardio card.
// Needs the test preview running on :4178. Writes .testharness/v14-*.png
import { launch } from "./browser.mjs";
const BASE = "http://localhost:4178";
const SCHEMES = ["violet", "rust", "turf", "pool", "oxblood", "neon", "chalk"];
const b = await launch();
try {
  for (const scheme of SCHEMES) for (const theme of ["light", "dark"]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.addInitScript(([t, s]) => { localStorage.setItem("ironbook:theme", JSON.stringify(t)); localStorage.setItem("ironbook:scheme", JSON.stringify(s)); }, [theme, scheme]);
    await p.goto(BASE);
    await p.waitForSelector(".wt-tabs");
    await p.locator("button", { hasText: "or start empty" }).click();
    await p.locator(".wt-session-name").fill("push");
    await p.locator("button", { hasText: "+ Add exercise" }).click();
    await p.locator(".wt-modal .wt-search").fill("bench press");
    await p.waitForTimeout(200);
    await p.locator(".wt-modal .wt-pick-row", { hasText: /^bench press/i }).first().click();
    const card = p.locator(".wt-card").first();
    const inp = card.locator(".wt-set-row input");
    await inp.nth(0).fill("100"); await inp.nth(1).fill("5");
    await card.locator("button", { hasText: "+ Add set" }).click();
    await inp.nth(2).fill("102.5"); await inp.nth(3).fill("5");
    await p.locator(".wt-effort button", { hasText: /^7$/ }).click();
    if (await p.locator(".wt-rest").count()) await p.locator(".wt-rest-btn.close").click();
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(250);
    await p.screenshot({ path: `.testharness/v14-${scheme}-${theme}-log.png` });
    if (scheme === "violet") {
      await p.locator(".wt-effort").scrollIntoViewIfNeeded();
      await p.locator(".wt-effort").screenshot({ path: `.testharness/v14-effort-${theme}.png` });
      await p.locator("button", { hasText: "+ Add exercise" }).click();
      await p.locator(".wt-modal .wt-search").fill("running, treadmill");
      await p.waitForTimeout(200);
      await p.locator(".wt-modal .wt-pick-row", { hasText: /^running, treadmill/i }).first().click();
      const c2 = p.locator(".wt-card").nth(1);
      await c2.locator(".wt-set-row input").nth(0).fill("25.30");
      await c2.locator(".wt-set-row input").nth(1).fill("5");
      await c2.scrollIntoViewIfNeeded();
      await c2.screenshot({ path: `.testharness/v14-cardio-${theme}.png` });
    }
    await p.locator(".wt-tab", { hasText: "Progress" }).click();
    await p.waitForSelector(".wt-viz-svg");
    await p.selectOption(".wt-prog-ex select", "lat pulldown");
    await p.waitForTimeout(400);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({ path: `.testharness/v14-${scheme}-${theme}-progress.png` });
    if (scheme === "violet" && theme === "light") {
      await p.locator(".wt-tab", { hasText: "More" }).click();
      await p.locator(".wt-more-row", { hasText: "Settings" }).click();
      await p.waitForTimeout(200);
      await p.locator(".wt-schemes").scrollIntoViewIfNeeded();
      await p.locator(".wt-schemes").screenshot({ path: `.testharness/v14-picker-${theme}.png` });
    }
    await ctx.close();
  }
} finally { await b.close(); }
console.log("shots saved");
