// lib/llm/generator.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

import { DomSnapshotSchema } from "@/lib/schemas/scrape";
import { TestSuiteSchema } from "@/lib/schemas/test-spec";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/llm/prompts";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const MODEL = "gemini-2.5-flash";

// ─── Gemini client ────────────────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

// ─── Types ────────────────────────────────────────────────────────────────────

export type TestSuite = z.infer<typeof TestSuiteSchema>;

type AttemptResult =
  | { success: true; testSuite: TestSuite }
  | { success: false; error: string };

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

// ─── Single attempt ───────────────────────────────────────────────────────────

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
      generationConfig: { responseMimeType: "application/json" },
    });

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();

    const json = raw.startsWith("```")
      ? raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()
      : raw;

    const validated = TestSuiteSchema.safeParse(JSON.parse(json));

    if (!validated.success) {
      const errorSummary = validated.error.issues
        .slice(0, 5)
        .map((i) => `- ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      return { success: false, error: errorSummary };
    }

    return { success: true, testSuite: validated.data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Trims the DOM snapshot, calls Gemini with retry logic, and returns a
 * validated TestSuite. Throws if all attempts fail.
 */
export async function generateTestSpec(
  snapshot: unknown,
  runId = "unknown"
): Promise<TestSuite> {
  const trimmed = trimSnapshot(snapshot);
  const userPrompt = buildUserPrompt(trimmed as Parameters<typeof buildUserPrompt>[0]);

  let lastError = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await attemptGeneration(userPrompt, lastError, attempt);
    if (result.success) return result.testSuite;

    lastError = result.error;
    console.warn(`[generator] runId=${runId} attempt=${attempt + 1} failed: ${lastError}`);
  }

  throw new Error(
    `LLM validation failed after ${MAX_RETRIES + 1} attempts. Last error: ${lastError}`
  );
}