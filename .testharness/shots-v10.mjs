import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.goto("http://localhost:4178");
await p.waitForSelector(".wt-tabs", { timeout: 15000 });

// Progress: lat pulldown, dark
await p.locator(".wt-tab", { hasText: "Progress" }).click();
await p.waitForSelector(".wt-viz-svg");
await p.selectOption(".wt-prog-ex select", "lat pulldown");
await p.waitForTimeout(400);
await p.screenshot({ path: ".testharness/v10-progress-dark.png", fullPage: true });

// select a mid session to show crosshair + readout
const box = await p.locator(".wt-viz-svg").boundingBox();
await p.mouse.click(box.x + box.width * 0.45, box.y + 120);
await p.waitForTimeout(200);
await p.locator(".wt-chart-card").screenshot({ path: ".testharness/v10-chart-selected.png" });

// bodyweight exercise
await p.selectOption(".wt-prog-ex select", "pullups");
await p.waitForTimeout(300);
await p.locator(".wt-chart-card").screenshot({ path: ".testharness/v10-chart-bodyweight.png" });

// light mode
await p.selectOption(".wt-prog-ex select", "bench press");
await p.locator(".wt-theme-btn").first().click();
await p.waitForTimeout(400);
await p.screenshot({ path: ".testharness/v10-progress-light.png", fullPage: true });
await p.locator(".wt-theme-btn").first().click(); // back to dark

// picker filters + tags
await p.locator(".wt-tab", { hasText: "Log" }).click();
await p.waitForTimeout(300);
await p.locator("button", { hasText: "or start empty" }).click();
await p.waitForTimeout(300);
await p.locator("button", { hasText: "+ Add exercise" }).click();
await p.waitForSelector(".wt-modal");
await p.locator(".wt-modal .wt-chip", { hasText: /^Arms$/ }).click();
await p.locator(".wt-modal .wt-subchip", { hasText: "Forearms" }).click();
await p.waitForTimeout(300);
await p.screenshot({ path: ".testharness/v10-picker-forearms.png" });
await p.selectOption(".wt-modal .wt-equip-select select", "bodyweight");
await p.locator(".wt-modal .wt-chip", { hasText: /^All$/ }).click();
await p.waitForTimeout(300);
await p.screenshot({ path: ".testharness/v10-picker-bodyweight.png" });

// logging card: tag + live 1RM
await p.selectOption(".wt-modal .wt-equip-select select", "any");
await p.locator(".wt-modal .wt-search").fill("bench press");
await p.waitForTimeout(200);
await p.locator(".wt-modal .wt-pick-row", { hasText: /^bench press/i }).first().click();
await p.waitForTimeout(300);
const inp = p.locator(".wt-card .wt-set-row input");
await inp.nth(0).fill("100"); await inp.nth(1).fill("5");
await p.waitForTimeout(200);
await p.locator(".wt-card").first().screenshot({ path: ".testharness/v10-logcard.png" });
await b.close();
console.log("shots saved");
