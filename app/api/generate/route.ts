// app/api/generate/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { prisma } from "@/lib/db/prisma";
import { DomSnapshotSchema } from "@/lib/schemas/scrape";
import { TestSuiteSchema } from "@/lib/schemas/test-spec";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/llm/prompts";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const MODEL = "gemini-2.5-flash";

// ─── Request schema ───────────────────────────────────────────────────────────

const GenerateRequestSchema = z.object({
  runId: z.string().cuid(),
});

// ─── Gemini client ────────────────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

// ─── Snapshot trimmer ─────────────────────────────────────────────────────────

function trimSnapshot(raw: unknown): unknown {
  const snapshot = DomSnapshotSchema.parse(raw);

  return {
    ...snapshot,
    interactiveElements: snapshot.interactiveElements.slice(0, 60).map((el) => ({
      tag: el.tag,
      type: el.type,
      text: el.text?.slice(0, 80),
      placeholder: el.placeholder?.slice(0, 80),
      href: el.href?.slice(0, 200),
      ariaLabel: el.ariaLabel?.slice(0, 80),
      id: el.id,
      testId: el.testId,
      name: el.name,
    })),
    headings: snapshot.headings.slice(0, 20).map((h) => ({
      level: h.level,
      text: h.text.slice(0, 100),
    })),
  };
}

// ─── LLM call with retry ──────────────────────────────────────────────────────

type AttemptResult =
  | { success: true; testSuite: z.infer<typeof TestSuiteSchema> }
  | { success: false; error: string };

async function callGeminiWithRetry(
  snapshot: unknown,
  runId: string
): Promise<z.infer<typeof TestSuiteSchema>> {
  const trimmed = trimSnapshot(snapshot);
  const userPrompt = buildUserPrompt(
    trimmed as Parameters<typeof buildUserPrompt>[0]
  );

  let lastError = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await attemptGeneration(userPrompt, lastError, attempt);

    if (result.success) return result.testSuite;

    lastError = result.error;
    console.warn(
      `[generate] runId=${runId} attempt=${attempt + 1} failed: ${lastError}`
    );
  }

  throw new Error(
    `LLM validation failed after ${MAX_RETRIES + 1} attempts. Last error: ${lastError}`
  );
}

async function attemptGeneration(
  userPrompt: string,
  previousError: string,
  attempt: number
): Promise<AttemptResult> {
  const prompt =
    attempt === 0
      ? userPrompt
      : `${userPrompt}

## Correction required (attempt ${attempt + 1})

Your previous response failed validation with this error:
${previousError}

Fix the issue and return only the corrected JSON object.`;

  try {
    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        // Forces Gemini to return valid JSON — equivalent to Anthropic's text mode
        // but more reliable for structured output
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();

    // Strip markdown fences just in case
    const json = raw.startsWith("```")
      ? raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()
      : raw;

    const parsed = JSON.parse(json);
    const validated = TestSuiteSchema.safeParse(parsed);

    if (!validated.success) {
      const errorSummary = validated.error.issues
        .slice(0, 5)
        .map((i) => `- ${i.path.join(".")}: ${i.message}`)
        .join("\n");

      return { success: false, error: errorSummary };
    }

    return { success: true, testSuite: validated.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth check — Clerk in prod, dev secret bypass for smoke tests
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

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = GenerateRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { runId } = parsed.data;

  const run = await prisma.testRun.findUnique({ where: { id: runId } });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (run.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!run.domSnapshot) {
    return NextResponse.json(
      { error: "No DOM snapshot found. Run /api/scrape first." },
      { status: 422 }
    );
  }
  if (run.status === "COMPLETED" && run.generatedSpec) {
    return NextResponse.json(
      { error: "Test suite already generated" },
      { status: 409 }
    );
  }

  await prisma.testRun.update({
    where: { id: runId },
    data: { status: "GENERATING" },
  });

  try {
    const testSuite = await callGeminiWithRetry(run.domSnapshot, runId);

    await prisma.testRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        generatedSpec: testSuite as object,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ runId, testSuite }, { status: 200 });
  } catch (err) {
    await prisma.testRun.update({
      where: { id: runId },
      data: { status: "FAILED" },
    });

    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[generate] runId=${runId} fatal: ${message}`);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}