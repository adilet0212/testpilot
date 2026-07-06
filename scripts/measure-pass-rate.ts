// scripts/measure-pass-rate.ts
// Throwaway: executes the seeded sample run's spec directly (no HTTP) and
// reports pass/fail per case — used to validate prompt/executor improvements.
// Run: pnpm tsx --tsconfig tsconfig.json scripts/measure-pass-rate.ts

import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });
  config({ path: ".env" });

  const { prisma } = await import("../lib/db/prisma");
  const { TestSuiteSchema } = await import("../lib/schemas/test-spec");
  const { launchBrowser, executeTestCase } = await import("../lib/playwright/executor");
  const { MAX_LIVE_CASES } = await import("../lib/constants");

  const runId = process.env.SAMPLE_RUN_ID;
  if (!runId) throw new Error("SAMPLE_RUN_ID not set");

  const run = await prisma.testRun.findUnique({ where: { id: runId } });
  const spec = TestSuiteSchema.parse(run?.generatedSpec);
  console.log(`Suite: ${spec.suiteName} — ${spec.testCases.length} cases, running first ${Math.min(MAX_LIVE_CASES, spec.testCases.length)}\n`);

  const browser = await launchBrowser();
  let passed = 0, failed = 0, skipped = 0;

  try {
    for (const tc of spec.testCases.slice(0, MAX_LIVE_CASES)) {
      const r = await executeTestCase(tc, browser);
      const mark = r.skipped ? "SKIP" : r.passed ? "PASS" : "FAIL";
      if (r.skipped) skipped++; else if (r.passed) passed++; else failed++;
      console.log(`[${mark}] ${r.title} (${(r.durationMs / 1000).toFixed(1)}s)`);
      if (!r.passed && !r.skipped) {
        const bad = r.steps.find((s) => !s.passed);
        console.log(`       ${bad?.error?.split("\n")[0] ?? "unknown error"}`);
      }
    }
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed, ${skipped} skipped`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
