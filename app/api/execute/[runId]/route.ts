// app/api/execute/[runId]/route.ts

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { Browser } from "@playwright/test";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { TestSuiteSchema } from "@/lib/schemas/test-spec";
import { launchBrowser } from "@/lib/playwright/browser";
import { executeTestCase, type TestCaseResult } from "@/lib/playwright/executor";
import { runAccessibilityAudit } from "@/lib/playwright/a11y";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Live execution is capped so a large generated suite can never blow past
 * Vercel's serverless duration limit mid-stream. The full suite is always
 * available via the ZIP download.
 */
const MAX_LIVE_CASES = 10;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Round-trips through JSON so Prisma's Json column never sees `undefined`. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value));
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
        const truncatedCount = spec.testCases.length - casesToRun.length;

        for (const testCase of casesToRun) {
          if (closed) break;
          const result = await executeTestCase(testCase, browser);
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

        if (truncatedCount > 0) {
          safeEnqueue(sseEvent("truncated", { remaining: truncatedCount }));
        }

        const allPassed = results.every((r) => r.passed || r.skipped);

        await prisma.testRun.update({
          where: { id: runId },
          data: {
            executionLog: toJson(results),
            a11yReport: a11yReport ? toJson(a11yReport) : undefined,
            status: allPassed ? "COMPLETED" : "FAILED",
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
