// scripts/seed-sample-run.ts
// One-off script — NOT part of app runtime. Run with:
//   pnpm tsx --tsconfig tsconfig.json scripts/seed-sample-run.ts
//
// Creates (or refreshes) the single public "View Live Sample" run shown at
// /sample. Runs the real pipeline (scrape -> Gemini generate) against a
// demo-friendly target and saves it as an isPublic TestRun under a sentinel
// user. The Execute & Results tab runs live via the existing SSE route each
// time a visitor opens /sample — this script does not pre-run execution.
//
// After running, copy the printed runId into SAMPLE_RUN_ID in .env(.local).
//
// dotenv is loaded and awaited BEFORE the other modules are imported (via
// dynamic import) — lib/llm/generator.ts reads process.env.GEMINI_API_KEY at
// module-eval time, and static ES imports are hoisted ahead of any top-level
// statement in this file, so a static import here would run generator.ts
// before dotenv had a chance to populate process.env.

import { config } from "dotenv";

const SAMPLE_TARGET_URL = "https://playwright.dev";
const SAMPLE_USER_ID = "sample-demo-user";

async function main() {
  config({ path: ".env.local" });
  config({ path: ".env" });

  const { Prisma } = await import("@prisma/client");
  const { prisma } = await import("../lib/db/prisma");
  const { scrapePage } = await import("../lib/playwright/scraper");
  const { generateTestSpec } = await import("../lib/llm/generator");

  await prisma.user.upsert({
    where: { id: SAMPLE_USER_ID },
    update: {},
    create: { id: SAMPLE_USER_ID, email: "sample-demo@testpilot.local" },
  });

  console.log(`Scraping ${SAMPLE_TARGET_URL}…`);
  const domSnapshot = await scrapePage(SAMPLE_TARGET_URL);

  console.log("Generating test spec via Gemini…");
  const generatedSpec = await generateTestSpec(domSnapshot, "seed-sample-run");

  // Reuse an existing sample run if one exists so re-running this script
  // updates in place instead of accumulating rows every time it's re-seeded.
  const existing = await prisma.testRun.findFirst({
    where: { userId: SAMPLE_USER_ID, isPublic: true },
  });

  const run = existing
    ? await prisma.testRun.update({
        where: { id: existing.id },
        data: {
          targetUrl: SAMPLE_TARGET_URL,
          domSnapshot,
          generatedSpec,
          status: "COMPLETED",
          // Explicitly clear stale results from a previous seeding — the spec
          // just changed, so any old execution/a11y data no longer matches it.
          executionLog: Prisma.JsonNull,
          a11yReport: Prisma.JsonNull,
          completedAt: new Date(),
        },
      })
    : await prisma.testRun.create({
        data: {
          userId: SAMPLE_USER_ID,
          targetUrl: SAMPLE_TARGET_URL,
          domSnapshot,
          generatedSpec,
          status: "COMPLETED",
          isPublic: true,
          completedAt: new Date(),
        },
      });

  console.log(`\n✓ Sample run ready: ${run.id}`);
  console.log(`  Add this to .env / .env.local:`);
  console.log(`  SAMPLE_RUN_ID=${run.id}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Seed script failed:", err);
  process.exit(1);
});
