// app/api/scrape/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ScrapeRequestSchema } from "@/lib/schemas/scrape";
import { scrapePage, ScraperError } from "@/lib/playwright/scraper";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: NextRequest) {
  // 1. Auth check — only signed-in users can trigger scrapes
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse and validate request body with Zod
  const body = await req.json().catch(() => null);
  const parsed = ScrapeRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { url, runId } = parsed.data;

  // 3. Verify the run exists and belongs to this user
  const run = await prisma.testRun.findUnique({
    where: { id: runId, userId },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // 4. Update status to SCRAPING so the frontend knows work has started
  await prisma.testRun.update({
    where: { id: runId },
    data: { status: "SCRAPING" },
  });

  try {
    // 5. Run the scraper
    const snapshot = await scrapePage(url);

    // 6. Save the snapshot and advance status to GENERATING (ready for Day 4)
    await prisma.testRun.update({
      where: { id: runId },
      data: {
        domSnapshot: snapshot,
        status: "GENERATING",
      },
    });

    return NextResponse.json({ success: true, snapshot });
  } catch (error) {
    // 7. On failure, mark the run as FAILED and log what went wrong
    await prisma.testRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        executionLog: {
          error:
            error instanceof ScraperError
              ? error.message
              : "Unknown scraper error",
          failedAt: new Date().toISOString(),
        },
      },
    });

    console.error("[scrape] Error:", error);
    return NextResponse.json({ error: "Scraping failed" }, { status: 500 });
  }
}