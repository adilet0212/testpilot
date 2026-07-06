// components/testpilot/a11y-panel.tsx
"use client";

import { useState } from "react";
import { Accessibility, ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import type { A11yReport, A11yViolation } from "@/lib/playwright/a11y";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const IMPACT_ORDER = ["critical", "serious", "moderate", "minor", null] as const;

const impactStyles: Record<string, string> = {
  critical: "bg-red-500/10 text-red-700 border border-red-500/30",
  serious: "bg-orange-500/10 text-orange-700 border border-orange-500/30",
  moderate: "bg-amber-500/10 text-amber-700 border border-amber-500/30",
  minor: "bg-sky-500/10 text-sky-700 border border-sky-500/30",
};

interface A11yPanelProps {
  report: A11yReport | null;
  executing: boolean;
}

export function A11yPanel({ report, executing }: A11yPanelProps) {
  if (!report) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center text-sm">
        {executing ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            The accessibility scan runs after the functional tests — results will
            appear here shortly.
          </>
        ) : (
          <>
            <Accessibility className="h-5 w-5" />
            Run the suite to generate a WCAG 2.1 accessibility report for this page.
          </>
        )}
      </div>
    );
  }

  const sorted = [...report.violations].sort(
    (a, b) => IMPACT_ORDER.indexOf(a.impact) - IMPACT_ORDER.indexOf(b.impact)
  );
  const counts = IMPACT_ORDER.filter((i) => i !== null).map((impact) => ({
    impact: impact as string,
    count: report.violations.filter((v) => v.impact === impact).length,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {counts.map(({ impact, count }) => (
          <span
            key={impact}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              count > 0 ? impactStyles[impact] : "bg-muted text-muted-foreground"
            )}
          >
            {count} {impact}
          </span>
        ))}
        <span className="text-muted-foreground ml-auto text-xs">
          {report.passCount} checks passed · scanned{" "}
          {new Date(report.scannedAt).toLocaleString()}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-6 text-center text-sm text-emerald-700">
          No WCAG violations detected on this page — nice.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((violation) => (
            <ViolationRow key={violation.id} violation={violation} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ViolationRow({ violation }: { violation: A11yViolation }) {
  const [open, setOpen] = useState(false);
  const impact = violation.impact ?? "minor";

  return (
    <li className="overflow-hidden rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted/50 flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
      >
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
            impactStyles[impact]
          )}
        >
          {impact}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{violation.help}</p>
          <p className="text-muted-foreground font-mono text-xs">{violation.id}</p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {violation.nodes.length} element{violation.nodes.length === 1 ? "" : "s"}
        </Badge>
        <ChevronDown
          className={cn(
            "text-muted-foreground h-4 w-4 shrink-0 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm">
          <p className="text-muted-foreground">{violation.description}</p>
          {violation.wcagTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {violation.wcagTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="font-mono text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            {violation.nodes.slice(0, 3).map((node, i) => (
              <pre
                key={i}
                className="bg-muted overflow-x-auto rounded-md p-2.5 font-mono text-xs"
              >
                {node.html}
              </pre>
            ))}
            {violation.nodes.length > 3 && (
              <p className="text-muted-foreground text-xs">
                +{violation.nodes.length - 3} more element
                {violation.nodes.length - 3 === 1 ? "" : "s"}
              </p>
            )}
          </div>
          <a
            href={violation.helpUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
          >
            How to fix this
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </li>
  );
}
