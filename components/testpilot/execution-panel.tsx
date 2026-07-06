// components/testpilot/execution-panel.tsx
"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Circle,
  Download,
  Loader2,
  Play,
  RotateCw,
  SkipForward,
  X,
} from "lucide-react";
import type { TestCaseResult } from "@/lib/playwright/executor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface CaseSummary {
  title: string;
  group: string;
}

interface ExecutionPanelProps {
  runId: string;
  caseSummaries: CaseSummary[];
  liveCap: number;
  results: TestCaseResult[];
  executing: boolean;
  done: boolean;
  streamError: string | null;
  onExecute: () => void;
}

export function ExecutionPanel({
  runId,
  caseSummaries,
  liveCap,
  results,
  executing,
  done,
  streamError,
  onExecute,
}: ExecutionPanelProps) {
  const expectedLive = Math.min(caseSummaries.length, liveCap);
  const passed = results.filter((r) => r.passed && !r.skipped).length;
  const failed = results.filter((r) => !r.passed).length;
  const skipped = results.filter((r) => r.skipped).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button onClick={onExecute} disabled={executing}>
            {executing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running…
              </>
            ) : done || results.length > 0 ? (
              <>
                <RotateCw className="mr-2 h-4 w-4" />
                Re-run suite
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run suite live
              </>
            )}
          </Button>
          {results.length > 0 && (
            <div className="text-muted-foreground flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1 text-emerald-600">
                <Check className="h-3.5 w-3.5" />
                {passed}
              </span>
              {failed > 0 && (
                <span className="text-destructive flex items-center gap-1">
                  <X className="h-3.5 w-3.5" />
                  {failed}
                </span>
              )}
              {skipped > 0 && (
                <span className="flex items-center gap-1">
                  <SkipForward className="h-3.5 w-3.5" />
                  {skipped}
                </span>
              )}
            </div>
          )}
        </div>
        {executing && (
          <div className="flex min-w-40 flex-1 items-center gap-2 sm:max-w-60">
            <Progress value={(results.length / expectedLive) * 100} />
            <span className="text-muted-foreground font-mono text-xs whitespace-nowrap">
              {results.length}/{expectedLive}
            </span>
          </div>
        )}
      </div>

      {streamError && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-lg border p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {streamError}
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {caseSummaries.map((summary, i) => {
          const result = results[i];
          const isRunning = executing && !result && i === results.length;
          return (
            <ResultRow
              key={`${summary.title}-${i}`}
              summary={summary}
              result={result}
              running={isRunning}
            />
          );
        })}
      </ul>

      <div className="flex justify-center pt-1">
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/download/${runId}`} download>
            <Download className="mr-2 h-3.5 w-3.5" />
            Download full suite
          </a>
        </Button>
      </div>
    </div>
  );
}

function ResultRow({
  summary,
  result,
  running,
}: {
  summary: CaseSummary;
  result: TestCaseResult | undefined;
  running: boolean;
}) {
  const [open, setOpen] = useState(false);
  const failedStep = result?.steps.find((s) => !s.passed);
  // Every non-skipped, executed result carries a proof screenshot (final
  // state on success, failure state on failure) plus its step list.
  const expandable = !!result && !result.skipped;

  return (
    <li className="overflow-hidden rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left",
          expandable && "hover:bg-muted/50 cursor-pointer"
        )}
      >
        <StatusIcon result={result} running={running} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{summary.title}</p>
          <p className="text-muted-foreground text-xs">
            {summary.group}
            {result?.skipped && result.skipReason ? ` — ${result.skipReason}` : ""}
          </p>
        </div>
        {result && !result.skipped && (
          <span className="text-muted-foreground font-mono text-xs">
            {(result.durationMs / 1000).toFixed(1)}s
          </span>
        )}
        {expandable && (
          <ChevronDown
            className={cn(
              "text-muted-foreground h-4 w-4 transition-transform",
              open && "rotate-180"
            )}
          />
        )}
      </button>

      {open && expandable && result && (
        <div className="border-t px-4 py-3">
          <ol className="flex flex-col gap-1.5">
            {result.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {step.passed ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <X className="text-destructive mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
                <span className={cn(!step.passed && "text-destructive")}>
                  {step.description}
                </span>
              </li>
            ))}
          </ol>
          {failedStep?.error && (
            <pre className="bg-muted text-muted-foreground mt-3 overflow-x-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
              {failedStep.error}
            </pre>
          )}
          {result.screenshotBase64 && (
            <div className="mt-3">
              <p className="text-muted-foreground mb-1.5 text-xs font-medium">
                {result.passed ? "Screenshot after test completed" : "Screenshot at failure"}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URI, next/image adds nothing here */}
              <img
                src={`data:image/jpeg;base64,${result.screenshotBase64}`}
                alt={
                  result.passed
                    ? `Final page state for ${summary.title}`
                    : `Failure screenshot for ${summary.title}`
                }
                className="max-h-96 w-full rounded-md border object-contain object-top"
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function StatusIcon({
  result,
  running,
}: {
  result: TestCaseResult | undefined;
  running: boolean;
}) {
  if (running) {
    return (
      <span className="text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </span>
    );
  }
  if (!result) {
    return (
      <span className="text-muted-foreground/50 flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
        <Circle className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (result.skipped) {
    return (
      <Badge variant="secondary" className="shrink-0 gap-1">
        <SkipForward className="h-3 w-3" />
        skipped
      </Badge>
    );
  }
  if (result.passed) {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span className="bg-destructive/10 text-destructive flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
      <X className="h-3.5 w-3.5" />
    </span>
  );
}
