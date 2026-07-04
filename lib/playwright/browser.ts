// lib/playwright/browser.ts

import type { Browser } from "playwright-core";

/**
 * Launches Chromium, switching between a local dev binary
 * (PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) and the serverless-optimized
 * @sparticuz/chromium binary in production. Shared by scraper.ts and executor.ts.
 */
export async function launchBrowser(): Promise<Browser> {
  const { chromium: playwrightChromium } = await import("playwright-core");
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

  if (executablePath) {
    return playwrightChromium.launch({
      headless: true,
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  const chromium = await import("@sparticuz/chromium");
  return playwrightChromium.launch({
    args: chromium.default.args,
    executablePath: await chromium.default.executablePath(),
    headless: true,
  });
}
