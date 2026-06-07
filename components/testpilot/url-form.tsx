// components/testpilot/url-form.tsx
"use client";

import { useState, useTransition } from "react";
import { runPipeline, type RunPipelineResult } from "@/app/actions/run-pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function UrlForm() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<RunPipelineResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!url) return;
    setResult(null);
    startTransition(async () => {
      const res = await runPipeline({ url });
      setResult(res);
    });
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <div className="flex gap-2">
        <Input
          type="url"
          placeholder="https://your-site.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isPending}
        />
        <Button onClick={handleSubmit} disabled={isPending || !url}>
          {isPending ? "Running…" : "Generate Tests"}
        </Button>
      </div>

      {isPending && (
        <p className="text-muted-foreground text-sm">
          Scraping page and generating tests — this takes 20–40 seconds…
        </p>
      )}

      {result?.success === true && (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p className="font-medium">Tests generated successfully.</p>
          <p className="mt-1 font-mono text-xs">Run ID: {result.runId}</p>
        </div>
      )}

      {result?.success === false && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Pipeline failed</p>
          <p className="mt-1">{result.error}</p>
          {result.runId && (
            <p className="mt-1 font-mono text-xs">Run ID: {result.runId}</p>
          )}
        </div>
      )}
    </div>
  );
}