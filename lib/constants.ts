// lib/constants.ts

/**
 * Live SSE execution is capped so a large generated suite can never blow past
 * Vercel's serverless duration limit mid-stream. The full suite is always
 * available via the ZIP download. Shared by the execute route (enforcement)
 * and the run-detail UI (progress math + truncation notice).
 */
export const MAX_LIVE_CASES = 10;

/**
 * Shared TestRun.status -> Badge variant mapping. Single source of truth so
 * the run-history list and the run-detail page never render different
 * colored badges for the same status value.
 */
export const RUN_STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  COMPLETED: "default",
  FAILED: "destructive",
  PENDING: "secondary",
  SCRAPING: "secondary",
  GENERATING: "secondary",
  EXECUTING: "secondary",
};
