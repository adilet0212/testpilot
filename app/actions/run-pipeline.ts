// app/actions/run-pipeline.ts
"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { scrapePage } from "@/lib/playwright/scraper";
import { generateTestSpec } from "@/lib/llm/generator";

const InputSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
});

export type StartRunResult =
  | { success: true; runId: string }
  | { success: false; error: string };

export type ProcessRunResult =
  | { success: true; runId: string }
  | { success: false; error: string; runId: string };

/**
 * Step 1: validate input and create the TestRun row, returning its id
 * immediately so the client can poll status while step 2 runs.
 */
export async function startRun(input: { url: string }): Promise<StartRunResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthenticated" };

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  // Ensure the User row exists — Clerk sign-up doesn't touch our DB, and
  // TestRun.userId has a foreign key, so a first-ever run would otherwise fail.
  const user = await currentUser();
  const email =
    user?.emailAddresses[0]?.emailAddress ?? `${userId}@unknown.testpilot`;
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email },
  });

  const run = await prisma.testRun.create({
    data: { userId, targetUrl: parsed.data.url, status: "PENDING" },
  });

  return { success: true, runId: run.id };
}

/**
 * Step 2: the long part — scrape then generate, updating status along the way
 * so getRunStatus polling reflects real progress.
 */
export async function processRun(runId: string): Promise<ProcessRunResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthenticated", runId };

  const run = await prisma.testRun.findUnique({ where: { id: runId } });
  if (!run || run.userId !== userId) {
    return { success: false, error: "Run not found", runId };
  }

  try {
    await prisma.testRun.update({
      where: { id: runId },
      data: { status: "SCRAPING" },
    });

    const domSnapshot = await scrapePage(run.targetUrl);

    await prisma.testRun.update({
      where: { id: runId },
      data: { domSnapshot, status: "GENERATING" },
    });

    const generatedSpec = await generateTestSpec(domSnapshot, runId);

    await prisma.testRun.update({
      where: { id: runId },
      data: { generatedSpec, status: "COMPLETED", completedAt: new Date() },
    });

    revalidatePath("/dashboard");
    return { success: true, runId };
  } catch (err) {
    await prisma.testRun.update({
      where: { id: runId },
      data: { status: "FAILED" },
    });
    return {
      success: false,
      error: err instanceof Error ? err.message : "Pipeline failed",
      runId,
    };
  }
}

/** Lightweight status read for the client-side progress indicator. */
export async function getRunStatus(runId: string): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const run = await prisma.testRun.findUnique({
    where: { id: runId },
    select: { status: true, userId: true },
  });
  if (!run || run.userId !== userId) return null;
  return run.status;
}
