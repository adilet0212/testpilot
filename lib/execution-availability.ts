// lib/execution-availability.ts
//
// SERVER-ONLY — reads non-public env vars. Call this from server components and
// route handlers, then pass the boolean down to client components as a prop.

/**
 * Whether this deployment can actually launch a real browser.
 *
 * Running Chromium inside a serverless function is at the edge of what the
 * platform supports: Vercel's file tracer doesn't reliably ship playwright-core's
 * runtime data files, and even when it does there are memory and cold-start
 * ceilings. Rather than let users hit a raw module-resolution stack trace, the
 * UI checks this first and explains the constraint instead.
 *
 * Resolution order:
 *   1. LIVE_EXECUTION_ENABLED=true|false — explicit override, always wins.
 *   2. Otherwise: available when a local Chromium binary is configured, which
 *      is true in local dev and false on the serverless deployment.
 */
export function isLiveExecutionAvailable(): boolean {
  const override = process.env.LIVE_EXECUTION_ENABLED;
  if (override === "true") return true;
  if (override === "false") return false;
  return Boolean(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH);
}

/** Shown wherever live execution would otherwise be offered. */
export const LIVE_EXECUTION_UNAVAILABLE_MESSAGE =
  "Live in-browser execution needs a persistent browser runtime, which serverless functions can't provide. The results below come from a real run against this page — clone the repo to execute the suite against your own URLs.";

/** Shown where a brand-new suite would be generated (scraping also needs a browser). */
export const GENERATION_UNAVAILABLE_MESSAGE =
  "Generating a new suite scrapes the target page with a real browser, which this serverless deployment can't run. Clone the repo to generate suites against your own URLs — or explore the sample run to see real output end to end.";
