// app/api/generate/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { generateTestSpec } from "@/lib/llm/generator";

const GenerateRequestSchema = z.object({
  runId: z.string().cuid(),
});

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  let rawBody: unknown = null;

  const devSecret = req.headers.get("x-dev-secret");
  if (
    process.env.NODE_ENV !== "production" &&
    devSecret === process.env.DEV_SECRET
  ) {
    rawBody = await req.json().catch(() => null);
    userId = (rawBody as Record<string, string>)?.userId ?? null;
  } else {
    const { userId: clerkUserId } = await auth();
    userId = clerkUserId;
    rawBody = await req.json().catch(() => null);
  }

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = GenerateRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }

  const { runId } = parsed.data;

  const run = await prisma.testRun.findUnique({ where: { id: runId } });
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  if (run.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!run.domSnapshot) {
    return NextResponse.json({ error: "No DOM snapshot. Run /api/scrape first." }, { status: 422 });
  }
  if (run.status === "COMPLETED" && run.generatedSpec) {
    return NextResponse.json({ error: "Already generated" }, { status: 409 });
  }

  await prisma.testRun.update({ where: { id: runId }, data: { status: "GENERATING" } });

  try {
    const testSuite = await generateTestSpec(run.domSnapshot, runId);

    await prisma.testRun.update({
      where: { id: runId },
      data: { status: "COMPLETED", generatedSpec: testSuite as object, completedAt: new Date() },
    });

    return NextResponse.json({ runId, testSuite }, { status: 200 });
  } catch (err) {
    await prisma.testRun.update({ where: { id: runId }, data: { status: "FAILED" } });
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[generate] runId=${runId} fatal: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}