// components/testpilot/run-detail.tsx
import Link from "next/link";
import type { TestRun } from "@prisma/client";
import { Download, ExternalLink, FileCode2 } from "lucide-react";
import { TestSuiteSchema } from "@/lib/schemas/test-spec";
import { emitTestFiles } from "@/lib/generator/emitter";
import { highlightTypeScript } from "@/lib/highlight";
import { MAX_LIVE_CASES, RUN_STATUS_VARIANT } from "@/lib/constants";
import {
  isLiveExecutionAvailable,
  LIVE_EXECUTION_UNAVAILABLE_MESSAGE,
} from "@/lib/execution-availability";
import type { TestCaseResult } from "@/lib/playwright/executor";
import type { A11yReport } from "@/lib/playwright/a11y";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RunTabs } from "@/components/testpilot/run-tabs";

interface RunDetailProps {
  run: TestRun;
  sampleBanner?: boolean;
}

export async function RunDetail({ run, sampleBanner = false }: RunDetailProps) {
  const parsed = run.generatedSpec
    ? TestSuiteSchema.safeParse(run.generatedSpec)
    : null;
  const spec = parsed?.success ? parsed.data : null;

  if (!spec) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
        This run has no generated test suite
        {run.status === "FAILED" ? " — the pipeline failed" : " yet"}.
      </div>
    );
  }

  const files = emitTestFiles(spec);
  const highlighted = await Promise.all(
    files.map(async (file) => ({
      filename: file.filename,
      html: await highlightTypeScript(file.content),
    }))
  );

  const executionLog = (run.executionLog as unknown as TestCaseResult[] | null) ?? [];
  const a11yReport = (run.a11yReport as unknown as A11yReport | null) ?? null;

  const groups = [...new Set(spec.testCases.map((tc) => tc.group))];
  const criticalCount = spec.testCases.filter((tc) => tc.priority === "critical").length;
  const skippedCount = spec.testCases.filter((tc) => tc.skip).length;

  const overview = (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Suite</CardTitle>
          <CardDescription>{spec.suiteName}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Target</span>
            <a
              href={spec.targetUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex max-w-60 items-center gap-1 truncate hover:underline"
            >
              <span className="truncate">{spec.targetUrl}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Test cases</span>
            <span>
              {spec.testCases.length}
              {skippedCount > 0 && (
                <span className="text-muted-foreground"> ({skippedCount} skipped)</span>
              )}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Critical priority</span>
            <span>{criticalCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Groups</span>
            <span className="text-right">{groups.join(", ")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created</span>
            <span>{run.createdAt.toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generator notes</CardTitle>
          <CardDescription>
            What the AI found, assumed, or skipped on this page
          </CardDescription>
        </CardHeader>
        <CardContent>
          {spec.notes?.length ? (
            <ul className="text-muted-foreground list-inside list-disc space-y-1.5 text-sm">
              {spec.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              No notes — the generator had full confidence in what it found.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const codePreview = (
    <div className="flex flex-col gap-4">
      {highlighted.map((file) => (
        <div key={file.filename} className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <FileCode2 className="text-muted-foreground h-4 w-4" />
            <span className="font-mono text-xs font-medium">{file.filename}</span>
          </div>
          <div
            className="p-4 [&_pre]:!bg-transparent"
            // Server-rendered by shiki from code our own emitter produced.
            dangerouslySetInnerHTML={{ __html: file.html }}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {sampleBanner && (
        <div className="rounded-lg border bg-accent/50 p-4 text-sm">
          <p className="font-medium">
            Live public demo — everything here is real and runs on demand.
          </p>
          <p className="text-muted-foreground mt-1">
            This suite was generated from an actual scrape of{" "}
            <span className="font-mono text-xs">{spec.targetUrl}</span>. Head to
            the Execute tab to watch it run in a real browser, then{" "}
            <Link href="/sign-up" className="text-primary hover:underline">
              sign up
            </Link>{" "}
            to generate one for your own site.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{spec.suiteName}</h1>
            <Badge variant={RUN_STATUS_VARIANT[run.status] ?? "secondary"}>
              {run.status}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{spec.targetUrl}</p>
        </div>
        <Button asChild>
          <a href={`/api/download/${run.id}`} download>
            <Download className="mr-2 h-4 w-4" />
            Download suite
          </a>
        </Button>
      </div>

      <RunTabs
        runId={run.id}
        caseSummaries={spec.testCases.map((tc) => ({ title: tc.title, group: tc.group }))}
        liveCap={MAX_LIVE_CASES}
        initialResults={executionLog}
        initialA11y={a11yReport}
        overview={overview}
        codePreview={codePreview}
        liveExecutionAvailable={isLiveExecutionAvailable()}
        unavailableMessage={LIVE_EXECUTION_UNAVAILABLE_MESSAGE}
      />
    </div>
  );
}
