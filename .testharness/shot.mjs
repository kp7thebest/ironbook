import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 420, height: 980 } });
await p.goto("http://localhost:4178");
await p.waitForSelector(".wt-tabs", { timeout: 15000 });
await p.locator(".wt-chip", { hasText: /^upper$/ }).first().click();
await p.waitForSelector(".wt-grip", { timeout: 5000 });
await p.waitForTimeout(400);
await p.screenshot({ path: ".testharness/shot-grip.png" });
// light mode too
await p.locator(".wt-theme-btn").first().click();
await p.waitForTimeout(400);
await p.screenshot({ path: ".testharness/shot-grip-light.png" });
await b.close();
console.log("shots saved");
