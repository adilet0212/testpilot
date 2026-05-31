// scripts/smoke-test-pipeline.ts

// DEV ONLY — never run this in CI or production.
// Requires DEV_SECRET and a running local dev server.

const BASE_URL = "http://localhost:3000";
const DEV_SECRET = process.env.DEV_SECRET ?? "testpilot-dev-secret";
const CLERK_USER_ID = process.env.CLERK_USER_ID ?? "";
const TARGET_URL = process.env.SMOKE_TARGET_URL ?? "https://example.com";

if (!CLERK_USER_ID) {
  console.error(
    "Missing CLERK_USER_ID.\n" +
    "Get it from dashboard.clerk.com → Users → your user → User ID"
  );
  process.exit(1);
}

async function post(path: string, body: object) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-dev-secret": DEV_SECRET,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();

  if (!res.ok) {
    console.error(`[${path}] HTTP ${res.status}:`, JSON.stringify(json, null, 2));
    process.exit(1);
  }

  return json;
}

async function main() {
  console.log("=== TestPilot Pipeline Smoke Test ===\n");
  console.log(`Target URL: ${TARGET_URL}\n`);

  // Step 1: Create run
  console.log("1. Creating test run...");
  const { runId } = await post(
    "/api/test-utils/create-run",
    { targetUrl: TARGET_URL, userId: CLERK_USER_ID }
  );
  console.log(`   runId: ${runId}\n`);

  // Step 2: Scrape
  console.log("2. Scraping DOM...");
  const scrapeResult = await post("/api/scrape", {
    url: TARGET_URL,
    runId,
    userId: CLERK_USER_ID, // dev bypass reads this from body
  });
  console.log("   Scrape complete.");
  console.log(`   Elements found: ${scrapeResult.snapshot?.interactiveElements?.length ?? "?"}`);
  console.log(`   Forms found: ${scrapeResult.snapshot?.forms?.length ?? "?"}\n`);

  // Step 3: Generate
  console.log("3. Generating test suite (calling Gemini)...");
  console.log("   This takes 10–30 seconds...\n");
  const generateResult = await post("/api/generate", { 
    runId,
    userId: CLERK_USER_ID,
  });
  console.log("   Generation complete.");
  console.log(`   Suite name: ${generateResult.testSuite.suiteName}`);
  console.log(`   Test cases: ${generateResult.testSuite.testCases.length}`);
  console.log(`   Notes: ${generateResult.testSuite.notes?.join(", ") ?? "none"}\n`);

  // Step 4: Summary
  console.log("4. Test case summary:\n");
  for (const tc of generateResult.testSuite.testCases) {
    const skipped = tc.skip ? " [SKIP]" : "";
    console.log(`   [${tc.priority.toUpperCase()}] ${tc.group} > ${tc.title} (${tc.steps.length} steps)${skipped}`);
  }

  console.log("\n=== Smoke test passed ✓ ===");
  console.log(`\nVerify in DB: SELECT "generatedSpec" FROM "TestRun" WHERE id = '${runId}';`);
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});