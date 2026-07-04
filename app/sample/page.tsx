// app/sample/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { prisma } from "@/lib/db/prisma";
import { TestSuiteSchema } from "@/lib/schemas/test-spec";

// This route is intentionally outside /dashboard so proxy.ts never gates it —
// the seeded run is isPublic:true, so no Clerk session is required to view it.
export default async function SamplePage() {
  const sampleRunId = process.env.SAMPLE_RUN_ID;
  if (!sampleRunId) notFound();

  const run = await prisma.testRun.findUnique({ where: { id: sampleRunId } });
  if (!run || !run.isPublic) notFound();

  const parsed = run.generatedSpec
    ? TestSuiteSchema.safeParse(run.generatedSpec)
    : null;
  const spec = parsed?.success ? parsed.data : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="rounded-md border bg-muted/50 p-4 text-sm">
        <p className="font-medium">This is a live public demo — no sign-in required.</p>
        <p className="text-muted-foreground mt-1">
          Everything below was generated and can be executed for real against{" "}
          <span className="font-mono">{run.targetUrl}</span>.{" "}
          <Link href="/sign-up" className="underline underline-offset-2">
            Sign up
          </Link>{" "}
          to generate a suite for your own site.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{spec?.suiteName ?? "TestPilot sample run"}</CardTitle>
          <CardDescription>{run.targetUrl}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Badge variant={run.status === "COMPLETED" ? "default" : "secondary"}>
              {run.status}
            </Badge>
            {spec && (
              <span className="text-muted-foreground text-sm">
                {spec.testCases.length} generated test case{spec.testCases.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {spec?.notes?.length ? (
            <ul className="text-muted-foreground list-inside list-disc text-sm">
              {spec.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          ) : null}

          <div className="flex gap-2 pt-2">
            <Button asChild size="sm">
              <a href={`/api/download/${run.id}`} download>
                <Download className="mr-2 h-4 w-4" />
                Download Test Suite (.zip)
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-center text-xs">
        Live in-browser execution and the accessibility report will render here once the
        full dashboard experience ships.
      </p>
    </div>
  );
}
