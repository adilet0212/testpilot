// app/sample/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RunDetail } from "@/components/testpilot/run-detail";
import { prisma } from "@/lib/db/prisma";

// Intentionally outside /dashboard so proxy.ts never gates it — the seeded
// run is isPublic:true, so no Clerk session is required to view or execute it.

// Without this the page gets statically prerendered at build time, freezing
// the DB read — stored execution results would never show up on reload.
export const dynamic = "force-dynamic";

export default async function SamplePage() {
  const sampleRunId = process.env.SAMPLE_RUN_ID;
  if (!sampleRunId) notFound();

  const run = await prisma.testRun.findUnique({ where: { id: sampleRunId } });
  if (!run || !run.isPublic) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              T
            </span>
            TestPilot
          </Link>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Home
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/sign-up">Get started</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <RunDetail run={run} sampleBanner />
      </main>
    </div>
  );
}
