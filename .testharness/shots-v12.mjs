// Screenshots of the v12 UI in both themes. Needs the test preview running on :4178.
import { launch } from "./browser.mjs";
const BASE = "http://localhost:4178";
const b = await launch();
try {
  for (const theme of ["dark", "light"]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.addInitScript((t) => localStorage.setItem("ironbook:theme", JSON.stringify(t)), theme);
    await p.goto(BASE);
    await p.waitForSelector(".wt-tabs");
    await p.waitForTimeout(400);
    await p.screenshot({ path: `.testharness/v12-nav-${theme}.png` });
    // card: bench press with note + plates
    await p.locator("button", { hasText: "or start empty" }).click();
    await p.locator("button", { hasText: "+ Add exercise" }).click();
    await p.locator(".wt-modal .wt-search").fill("bench press");
    await p.waitForTimeout(200);
    await p.locator(".wt-modal .wt-pick-row", { hasText: /^bench press/i }).first().click();
    const card = p.locator(".wt-card").first();
    await card.locator(".wt-set-row input").nth(0).fill("102.5");
    await card.locator(".wt-set-row input").nth(1).fill("5");
    await card.locator("button", { hasText: "+ Add set" }).click();
    await card.locator(".wt-set-row input").nth(2).fill("107.5");
    await card.locator(".wt-set-row input").nth(3).fill("3");
    await card.locator("button", { hasText: "+ Note" }).click();
    await card.locator(".wt-note-input").fill("grip at the rings, 81 cm");
    await card.locator("button", { hasText: "Plates" }).click();
    await p.waitForTimeout(200);
    await card.screenshot({ path: `.testharness/v12-card-${theme}.png` });
    // crew + more
    await p.locator(".wt-tab", { hasText: "Crew" }).click();
    await p.waitForTimeout(300);
    await p.screenshot({ path: `.testharness/v12-crew-${theme}.png` });
    await p.locator(".wt-tab", { hasText: "More" }).click();
    await p.waitForTimeout(200);
    await p.screenshot({ path: `.testharness/v12-more-${theme}.png` });
    await p.locator(".wt-more-row", { hasText: "Library" }).click();
    await p.locator(".wt-pane > .wt-search").fill("reverse curl");
    await p.waitForTimeout(200);
    await p.locator(".wt-lib-row", { hasText: /^reverse curl/i }).first().click();
    await p.locator("button", { hasText: "Rename across my log" }).click();
    await p.locator(".wt-rename input").fill("bayesian curl");
    await p.waitForTimeout(200);
    await p.locator(".wt-lib-item.open").screenshot({ path: `.testharness/v12-rename-${theme}.png` });
    await ctx.close();
  }
} finally { await b.close(); }
console.log("shots saved");
