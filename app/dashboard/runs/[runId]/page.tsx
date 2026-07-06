// app/dashboard/runs/[runId]/page.tsx
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { RunDetail } from "@/components/testpilot/run-detail";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const { userId } = await auth();

  const run = await prisma.testRun.findUnique({ where: { id: runId } });
  if (!run || run.userId !== userId) notFound();

  return <RunDetail run={run} />;
}
