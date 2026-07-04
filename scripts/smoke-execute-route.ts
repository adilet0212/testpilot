// scripts/smoke-execute-route.ts
// Run with: pnpm tsx --tsconfig tsconfig.json scripts/smoke-execute-route.ts
// Requires: `pnpm dev` running in another terminal.
// Throwaway end-to-end check for the SSE execute route + isPublic access path:
// creates a real isPublic TestRun row, streams /api/execute/[runId] with plain
// fetch (no auth needed since isPublic:true), prints each event as it arrives
// with a timestamp (proving incremental streaming, not one big batch), then
// re-reads the DB row to confirm executionLog/a11yReport/status persisted.

import { prisma } from "../lib/db/prisma";
import type { TestSuite } from "../lib/schemas/test-spec";

const BASE_URL = "http://localhost:3000";

const SAMPLE_SPEC: TestSuite = {
  suiteName: "Smoke Route Suite",
  targetUrl: "https://playwright.dev",
  baseUrl: "https://playwright.dev",
  testCases: [
    {
      title: "Home page has correct title",
      group: "Smoke",
      priority: "critical",
      skip: false,
      steps: [
        { description: "Navigate", action: "navigate", value: "https://playwright.dev", optional: false },
        {
          description: "Title assertion (passes)",
          action: "waitForTimeout",
          value: "500",
          optional: false,
          assertion: {
            type: "toHaveTitle",
            expected: "Fast and reliable end-to-end testing for modern web apps | Playwright",
            not: false,
          },
        },
      ],
    },
    {
      title: "Deliberate failure for screenshot check",
      group: "Smoke",
      priority: "low",
      skip: false,
      steps: [
        { description: "Navigate", action: "navigate", value: "https://playwright.dev", optional: false },
        {
          description: "Title assertion (fails on purpose)",
          action: "waitForTimeout",
          value: "500",
          optional: false,
          assertion: { type: "toHaveTitle", expected: "NOPE NOT THIS", not: false },
        },
      ],
    },
  ],
};

async function main() {
  const userId = "smoke-test-user";
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: "smoke-test@example.com" },
  });

  const run = await prisma.testRun.create({
    data: {
      userId,
      targetUrl: SAMPLE_SPEC.targetUrl,
      status: "COMPLETED",
      generatedSpec: SAMPLE_SPEC,
      isPublic: true,
    },
  });

  console.log("Created run:", run.id);
  console.log("Streaming /api/execute/" + run.id + " …\n");

  const start = Date.now();
  const res = await fetch(`${BASE_URL}/api/execute/${run.id}`);

  if (!res.ok || !res.body) {
    console.error("✗ Request failed:", res.status, await res.text());
    process.exit(1);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventCount = 0;
  let sawResult = false;
  let sawFailureScreenshot = false;
  let sawA11y = false;
  let sawDone = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      eventCount++;
      const t = ((Date.now() - start) / 1000).toFixed(2);
      console.log(`[t=${t}s] ${raw.replace(/\n/g, " | ").slice(0, 200)}`);

      if (raw.includes("event: result")) {
        sawResult = true;
        if (raw.includes("screenshotBase64")) sawFailureScreenshot = true;
      }
      if (raw.includes("event: a11y")) sawA11y = true;
      if (raw.includes("event: done")) sawDone = true;
    }
  }

  console.log(`\nTotal events: ${eventCount}`);
  console.log("saw result event:", sawResult);
  console.log("saw failure screenshot:", sawFailureScreenshot);
  console.log("saw a11y event:", sawA11y);
  console.log("saw done event:", sawDone);

  const updated = await prisma.testRun.findUnique({ where: { id: run.id } });
  console.log("\nDB row after execution:");
  console.log("  status:", updated?.status);
  console.log("  executionLog present:", updated?.executionLog !== null);
  console.log("  a11yReport present:", updated?.a11yReport !== null);
  console.log("  completedAt:", updated?.completedAt);

  const ok =
    sawResult &&
    sawFailureScreenshot &&
    sawA11y &&
    sawDone &&
    updated?.executionLog !== null &&
    updated?.a11yReport !== null &&
    updated?.completedAt !== null;

  if (!ok) {
    console.error("\n✗ Smoke test FAILED — see flags above");
    process.exitCode = 1;
  } else {
    console.log("\n✓ Full SSE execution route smoke test passed");
  }

  // Cleanup
  await prisma.testRun.delete({ where: { id: run.id } });
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
