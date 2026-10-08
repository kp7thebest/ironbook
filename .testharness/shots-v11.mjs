// Screenshots of the v11 UI in both themes. Needs the test preview running on :4178.
import { chromium } from "playwright";
import fs from "fs";
const BASE = "http://localhost:4178";
const SW = new URL("./dist-test/sw.js", import.meta.url);
const original = fs.readFileSync(SW, "utf8");
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
try {
  for (const theme of ["dark", "light"]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.addInitScript((t) => localStorage.setItem("ironbook:theme", JSON.stringify(t)), theme);
    await p.goto(BASE);
    await p.waitForSelector(".wt-tabs", { timeout: 15000 });
    await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 10000 });
    // offline save -> History label
    await p.evaluate(() => { window.__stub.offline = true; });
    await p.locator(".wt-chip", { hasText: /^upper$/ }).first().click();
    await p.locator(".wt-set-row input").nth(0).fill("50");
    await p.locator(".wt-set-row input").nth(1).fill("8");
    await p.locator("button", { hasText: "Finish workout" }).click();
    await p.waitForSelector(".wt-toast");
    await p.waitForTimeout(300);
    await p.screenshot({ path: `.testharness/v11-offline-${theme}.png` });
    // update banner
    fs.writeFileSync(SW, original + `\n// shot ${Date.now()}\n`);
    await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await p.waitForSelector(".wt-update", { timeout: 10000 });
    await p.waitForTimeout(500);
    await p.screenshot({ path: `.testharness/v11-banner-${theme}.png`, clip: { x: 0, y: 0, width: 390, height: 220 } });
    await ctx.close();
  }
} finally { fs.writeFileSync(SW, original); await b.close(); }
console.log("shots saved");
