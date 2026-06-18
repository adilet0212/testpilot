// scripts/smoke-executor.ts
// Run with: pnpm tsx --tsconfig tsconfig.json scripts/smoke-executor.ts
// Uses relative imports so tsx doesn't need path-alias resolution.

import { launchBrowser, executeTestCase } from "../lib/playwright/executor";
import type { TestCase } from "../lib/schemas/test-spec";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PASSING_CASE: TestCase = {
  title: "Playwright home page has expected heading",
  group: "Smoke",
  priority: "critical",
  skip: false,
  steps: [
    {
      description: "Navigate to playwright.dev",
      action: "navigate",
      value: "https://playwright.dev",
      optional: false,
    },
    {
      description: "Assert the page title contains Playwright",
      action: "waitForTimeout",
      value: "1000",
      optional: false,
      assertion: {
        type: "toHaveTitle",
        expected: /Playwright/i as unknown as string, // regex accepted by toHaveTitle
        not: false,
      },
    },
  ],
};

const FAILING_CASE: TestCase = {
  title: "Deliberate failure — wrong title assertion",
  group: "Smoke",
  priority: "low",
  skip: false,
  steps: [
    {
      description: "Navigate to playwright.dev",
      action: "navigate",
      value: "https://playwright.dev",
      optional: false,
    },
    {
      description: "Assert the page title is something it is not",
      action: "waitForTimeout",
      value: "500",
      optional: false,
      assertion: {
        type: "toHaveTitle",
        expected: "THIS TITLE DOES NOT EXIST ANYWHERE",
        not: false,
      },
    },
  ],
};

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("Launching browser…");
  const browser = await launchBrowser();

  try {
    // ── Passing case ──────────────────────────────────────────────────────────
    console.log("\n[1/2] Running PASSING case…");
    const passResult = await executeTestCase(PASSING_CASE, browser);
    console.log("  passed:", passResult.passed);
    console.log("  skipped:", passResult.skipped);
    console.log("  durationMs:", passResult.durationMs);
    console.log("  steps:", passResult.steps);
    console.log(
      "  screenshotBase64 present:",
      passResult.screenshotBase64 !== undefined
    );

    if (!passResult.passed) {
      console.error("  ✗ UNEXPECTED FAILURE — passing case should have passed");
      process.exitCode = 1;
    } else {
      console.log("  ✓ Pass case passed as expected");
    }

    // ── Failing case ──────────────────────────────────────────────────────────
    console.log("\n[2/2] Running FAILING case…");
    const failResult = await executeTestCase(FAILING_CASE, browser);
    console.log("  passed:", failResult.passed);
    console.log("  skipped:", failResult.skipped);
    console.log("  durationMs:", failResult.durationMs);
    console.log("  steps:", JSON.stringify(failResult.steps, null, 2));
    console.log(
      "  screenshotBase64 length:",
      failResult.screenshotBase64?.length ?? 0
    );

    if (failResult.passed) {
      console.error(
        "  ✗ UNEXPECTED PASS — failing case should have returned passed:false"
      );
      process.exitCode = 1;
    } else if (!failResult.screenshotBase64) {
      console.error("  ✗ No screenshot captured for failing case");
      process.exitCode = 1;
    } else {
      console.log("  ✓ Fail case returned passed:false with a screenshot");
    }
  } finally {
    await browser.close();
    console.log("\nBrowser closed.");
  }
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
