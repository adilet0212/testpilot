// app/actions/run-pipeline.ts
"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { scrapePage } from "@/lib/playwright/scraper";
import { generateTestSpec } from "@/lib/llm/generator";

const InputSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
});

export type RunPipelineResult =
  | { success: true; runId: string }
  | { success: false; error: string };

export async function runPipeline(
  input: { url: string }
): Promise<RunPipelineResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthenticated" };

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { url } = parsed.data;

  const run = await prisma.testRun.create({
    data: { userId, targetUrl: url, status: "PENDING" },
  });

  try {
    await prisma.testRun.update({
      where: { id: run.id },
      data: { status: "SCRAPING" },
    });

    const domSnapshot = await scrapePage(url);

    await prisma.testRun.update({
      where: { id: run.id },
      data: { domSnapshot, status: "GENERATING" },
    });

    const generatedSpec = await generateTestSpec(domSnapshot);

    await prisma.testRun.update({
      where: { id: run.id },
      data: {
        generatedSpec,
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    revalidatePath("/dashboard");
    return { success: true, runId: run.id };
  } catch (err) {
    await prisma.testRun.update({
      where: { id: run.id },
      data: { status: "FAILED" },
    });

    return {
      success: false,
      error: err instanceof Error ? err.message : "Pipeline failed",
    };
  }
}