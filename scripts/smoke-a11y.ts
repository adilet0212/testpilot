// scripts/smoke-a11y.ts
// Run with: pnpm tsx --tsconfig tsconfig.json scripts/smoke-a11y.ts
// Throwaway check: confirms runAccessibilityAudit finds real violations on a real page.

import { launchBrowser } from "../lib/playwright/browser";
import { runAccessibilityAudit } from "../lib/playwright/a11y";

async function main() {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("https://playwright.dev", { waitUntil: "domcontentloaded" });

    const report = await runAccessibilityAudit(page);
    console.log("url:", report.url);
    console.log("passCount:", report.passCount);
    console.log("violation count:", report.violations.length);
    console.log(JSON.stringify(report.violations.slice(0, 3), null, 2));

    if (report.violations.length === 0 && report.passCount === 0) {
      console.error("✗ Suspicious: no passes AND no violations — audit probably didn't run");
      process.exitCode = 1;
    } else {
      console.log("✓ Audit ran and returned a real report");
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
