// Launch Chromium wherever the harness runs:
//  - CHROME_PATH env var, if set;
//  - the Claude sandbox's preinstalled Chromium, if present;
//  - otherwise Playwright's own download (`npx playwright install chromium`, as in GitHub Actions).
import fs from "fs";
import { chromium } from "playwright";

const SANDBOX = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
export function launch() {
  const executablePath = process.env.CHROME_PATH || (fs.existsSync(SANDBOX) ? SANDBOX : undefined);
  return chromium.launch(executablePath ? { executablePath } : {});
}
