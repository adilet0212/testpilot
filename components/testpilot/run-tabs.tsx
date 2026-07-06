// components/testpilot/run-tabs.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { TestCaseResult } from "@/lib/playwright/executor";
import type { A11yReport } from "@/lib/playwright/a11y";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ExecutionPanel, type CaseSummary } from "@/components/testpilot/execution-panel";
import { A11yPanel } from "@/components/testpilot/a11y-panel";

interface RunTabsProps {
  runId: string;
  caseSummaries: CaseSummary[];
  liveCap: number;
  initialResults: TestCaseResult[];
  initialA11y: A11yReport | null;
  overview: ReactNode;
  codePreview: ReactNode;
}

export function RunTabs({
  runId,
  caseSummaries,
  liveCap,
  initialResults,
  initialA11y,
  overview,
  codePreview,
}: RunTabsProps) {
  const [results, setResults] = useState<TestCaseResult[]>(initialResults);
  const [a11y, setA11y] = useState<A11yReport | null>(initialA11y);
  const [executing, setExecuting] = useState(false);
  const [done, setDone] = useState(initialResults.length > 0);
  const [streamError, setStreamError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  // Close any open stream when the component unmounts (client navigated away).
  useEffect(() => {
    return () => sourceRef.current?.close();
  }, []);

  const execute = useCallback(() => {
    sourceRef.current?.close();
    setResults([]);
    setA11y(null);
    setStreamError(null);
    setDone(false);
    setExecuting(true);

    const source = new EventSource(`/api/execute/${runId}`);
    sourceRef.current = source;

    source.addEventListener("result", (e) => {
      setResults((prev) => [...prev, JSON.parse(e.data) as TestCaseResult]);
    });

    source.addEventListener("a11y", (e) => {
      setA11y(JSON.parse(e.data) as A11yReport);
    });

    source.addEventListener("error", (e: MessageEvent) => {
      // Server-sent named "error" event (execution failed server-side).
      if (e.data) {
        setStreamError((JSON.parse(e.data) as { error: string }).error);
      }
      source.close();
      setExecuting(false);
    });

    source.addEventListener("done", () => {
      // Close explicitly — EventSource would otherwise auto-reconnect when the
      // server ends the stream, silently re-running the entire suite.
      source.close();
      setExecuting(false);
      setDone(true);
    });

    // Transport-level failure (network drop, non-2xx). EventSource fires the
    // generic onerror with no data in that case.
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) return;
      source.close();
      setExecuting(false);
      setStreamError((prev) => prev ?? "Connection to the execution stream was lost.");
    };
  }, [runId]);

  const failedCount = results.filter((r) => !r.passed).length;

  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="code">Generated Tests</TabsTrigger>
        <TabsTrigger value="execute" className="gap-1.5">
          Execute
          {results.length > 0 && (
            <Badge
              variant={failedCount > 0 ? "destructive" : "secondary"}
              className="h-4 px-1.5 text-[10px]"
            >
              {results.length - failedCount}/{results.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="a11y" className="gap-1.5">
          Accessibility
          {a11y && (
            <Badge
              variant={a11y.violations.length > 0 ? "destructive" : "secondary"}
              className="h-4 px-1.5 text-[10px]"
            >
              {a11y.violations.length}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-4">
        {overview}
      </TabsContent>
      <TabsContent value="code" className="mt-4">
        {codePreview}
      </TabsContent>
      <TabsContent value="execute" className="mt-4">
        <ExecutionPanel
          runId={runId}
          caseSummaries={caseSummaries}
          liveCap={liveCap}
          results={results}
          executing={executing}
          done={done}
          streamError={streamError}
          onExecute={execute}
        />
      </TabsContent>
      <TabsContent value="a11y" className="mt-4">
        <A11yPanel report={a11y} executing={executing} />
      </TabsContent>
    </Tabs>
  );
}
