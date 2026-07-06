// components/testpilot/url-form.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Globe, Loader2, Sparkles, Wand2 } from "lucide-react";
import { startRun, processRun, getRunStatus } from "@/app/actions/run-pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Phase = "idle" | "scraping" | "generating" | "error";

const steps = [
  { key: "scraping", label: "Scraping page", icon: Globe },
  { key: "generating", label: "Generating tests", icon: Wand2 },
] as const;

export function UrlForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks the last non-error phase so the step indicator knows which step
  // to mark red on failure — `phase` itself is just "error" by then, and
  // steps.findIndex(s => s.key === "error") would return -1 for every step.
  const [lastActiveStep, setLastActiveStep] = useState<"scraping" | "generating">("scraping");

  // Clear the poll interval if the user navigates away mid-run.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const running = phase === "scraping" || phase === "generating";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url || running) return;

    const started = await startRun({ url });
    if (!started.success) {
      toast.error(started.error);
      return;
    }

    setPhase("scraping");
    setLastActiveStep("scraping");

    // Poll real DB status so the step indicator reflects actual progress,
    // not a simulated timer.
    pollRef.current = setInterval(async () => {
      const status = await getRunStatus(started.runId);
      if (status === "GENERATING") {
        setPhase("generating");
        setLastActiveStep("generating");
      }
    }, 1500);

    const result = await processRun(started.runId);

    if (pollRef.current) clearInterval(pollRef.current);

    if (result.success) {
      toast.success("Test suite generated");
      router.push(`/dashboard/runs/${result.runId}`);
    } else {
      setPhase("error");
      toast.error(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xl flex-col gap-5">
      <div className="flex gap-2">
        <Input
          type="url"
          placeholder="https://your-site.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={running}
          className="h-11"
        />
        <Button type="submit" size="lg" disabled={running || !url}>
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate
            </>
          )}
        </Button>
      </div>

      {(running || phase === "error") && (
        <ol className="flex flex-col gap-2.5 rounded-xl border bg-card p-4">
          {steps.map((step, i) => {
            const stepIndex = steps.findIndex(
              (s) => s.key === (phase === "error" ? lastActiveStep : phase)
            );
            const state =
              phase === "error"
                ? i <= stepIndex
                  ? "error"
                  : "pending"
                : i < stepIndex
                  ? "done"
                  : i === stepIndex
                    ? "active"
                    : "pending";
            return (
              <li key={step.key} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border",
                    state === "done" &&
                      "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
                    state === "active" && "border-primary/40 bg-primary/10 text-primary",
                    state === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
                    state === "pending" && "text-muted-foreground/50"
                  )}
                >
                  {state === "done" ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : state === "active" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <step.icon className="h-3.5 w-3.5" />
                  )}
                </span>
                <span
                  className={cn(
                    state === "pending" && "text-muted-foreground/60",
                    state === "active" && "font-medium"
                  )}
                >
                  {step.label}
                  {state === "active" && step.key === "generating" && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      — usually 15–30s
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {phase === "error" && (
        <p className="text-muted-foreground text-sm">
          Something went wrong — check the URL is publicly reachable and try again.
        </p>
      )}
    </form>
  );
}
