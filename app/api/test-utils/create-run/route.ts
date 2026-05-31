// app/api/test-utils/create-run/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

if (process.env.NODE_ENV === "production") {
  throw new Error("test-utils routes must not be deployed to production.");
}

const Schema = z.object({
  targetUrl: z.string().url(),
  userId: z.string(), // pass your Clerk userId directly in dev
});

export async function POST(req: NextRequest) {
  // Guard with a simple dev secret instead of Clerk session
  const devSecret = req.headers.get("x-dev-secret");
  if (devSecret !== process.env.DEV_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = Schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  // Upsert user first to satisfy foreign key constraint
  await prisma.user.upsert({
    where: { id: body.data.userId },
    update: {},
    create: {
      id: body.data.userId,
      email: `${body.data.userId}@dev.testpilot.local`,
    },
  });

  const run = await prisma.testRun.create({
    data: {
      userId: body.data.userId,
      targetUrl: body.data.targetUrl,
      status: "PENDING",
    },
  });

  return NextResponse.json({ runId: run.id });
}