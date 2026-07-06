// app/api/execute/[runId]/route.ts

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { Browser } from "@playwright/test";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { TestSuiteSchema, type TestCase } from "@/lib/schemas/test-spec";
import { launchBrowser } from "@/lib/playwright/browser";
import { executeTestCase, type TestCaseResult } from "@/lib/playwright/executor";
import { runAccessibilityAudit } from "@/lib/playwright/a11y";
import { MAX_LIVE_CASES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Round-trips through JSON so Prisma's Json column never sees `undefined`. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Bounds a single test case's wall-clock cost. Without this, a pathological
 * case (several steps each hitting the per-action timeout) can run well past
 * the loop-level budget check below — which only runs BETWEEN cases — and
 * drag the whole request past Vercel's maxDuration, hard-killing the stream
 * with no `done`/`error` event ever reaching the client and the DB row stuck
 * at status EXECUTING forever.
 */
function withCaseTimeout(
  promise: Promise<TestCaseResult>,
  testCase: TestCase,
  ms: number
): Promise<TestCaseResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        title: testCase.title,
        group: testCase.group,
        passed: false,
        skipped: false,
        steps: [
          {
            description: "Execution time budget",
            passed: false,
            error: `This test case exceeded ${ms / 1000}s and was aborted to keep the live run within its time budget.`,
          },
        ],
        durationMs: ms,
      });
    }, ms);
    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      () => {
        clearTimeout(timer);
        resolve({
          title: testCase.title,
          group: testCase.group,
          passed: false,
          skipped: false,
          steps: [{ description: "Execution error", passed: false, error: "Unexpected executor error." }],
          durationMs: ms,
        });
      }
    );
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const { userId } = await auth();

  const run = await prisma.testRun.findUnique({ where: { id: runId } });
  if (!run) {
    return new Response("Run not found", { status: 404 });
  }
  if (!run.isPublic && run.userId !== userId) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!run.generatedSpec) {
    return new Response("No generated spec for this run", { status: 400 });
  }

  const parsed = TestSuiteSchema.safeParse(run.generatedSpec);
  if (!parsed.success) {
    return new Response("Stored spec is invalid", { status: 500 });
  }
  const spec = parsed.data;

  const encoder = new TextEncoder();
  let browser: Browser | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed (client disconnected) — drop the event.
        }
      };

      const onAbort = () => {
        closed = true;
      };
      req.signal.addEventListener("abort", onAbort);

      try {
        await prisma.testRun.update({
          where: { id: runId },
          data: { status: "EXECUTING" },
        });

        browser = await launchBrowser();

        const results: TestCaseResult[] = [];
        const casesToRun = spec.testCases.slice(0, MAX_LIVE_CASES);

        // Wall-clock budget: maxDuration is 60s on Vercel, and a11y scan +
        // persistence still have to happen after this loop. Stop starting new
        // cases past the budget rather than letting the platform kill the
        // stream mid-flight. Cases beyond the cap/budget render as "not run"
        // rows client-side (see components/testpilot/execution-panel.tsx).
        const startedAt = Date.now();
        const CASE_BUDGET_MS = 40_000;
        const PER_CASE_TIMEOUT_MS = 25_000;

        for (const testCase of casesToRun) {
          if (closed) break;
          if (Date.now() - startedAt > CASE_BUDGET_MS) break;
          const result = await withCaseTimeout(
            executeTestCase(testCase, browser),
            testCase,
            PER_CASE_TIMEOUT_MS
          );
          results.push(result);
          safeEnqueue(sseEvent("result", result));
        }

        let a11yReport = null;
        if (!closed) {
          try {
            const context = await browser.newContext();
            const page = await context.newPage();
            await page.goto(spec.targetUrl, {
              waitUntil: "domcontentloaded",
              timeout: 30_000,
            });
            a11yReport = await runAccessibilityAudit(page);
            await context.close();
            safeEnqueue(sseEvent("a11y", a11yReport));
          } catch (err) {
            safeEnqueue(
              sseEvent("a11y-error", {
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        }

        const allPassed = results.every((r) => r.passed || r.skipped);

        // A failing TEST is a normal, useful result — the run itself still
        // COMPLETED. FAILED is reserved for pipeline/execution crashes.
        // a11yReport uses Prisma.JsonNull (not `undefined`) when the scan
        // failed — `undefined` tells Prisma to leave the column untouched,
        // which would let a prior successful run's a11y data silently
        // persist as if it were current.
        await prisma.testRun.update({
          where: { id: runId },
          data: {
            executionLog: toJson(results),
            a11yReport: a11yReport ? toJson(a11yReport) : Prisma.JsonNull,
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });

        safeEnqueue(sseEvent("done", { passed: allPassed }));
      } catch (err) {
        safeEnqueue(
          sseEvent("error", {
            error: err instanceof Error ? err.message : "Execution failed",
          })
        );
        await prisma.testRun
          .update({ where: { id: runId }, data: { status: "FAILED" } })
          .catch(() => {});
      } finally {
        req.signal.removeEventListener("abort", onAbort);
        await browser?.close();
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
