// lib/playwright/a11y.ts

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

export interface A11yViolationNode {
  html: string;
  target: string[];
  failureSummary?: string;
}

export interface A11yViolation {
  id: string;
  impact: "critical" | "serious" | "moderate" | "minor" | null;
  description: string;
  help: string;
  helpUrl: string;
  /** WCAG success-criterion tags, e.g. "wcag2a", "wcag143" */
  wcagTags: string[];
  nodes: A11yViolationNode[];
}

export interface A11yReport {
  url: string;
  violations: A11yViolation[];
  passCount: number;
  scannedAt: string;
}

/**
 * Runs an axe-core accessibility scan against the page's current state.
 * Expects the page to already be navigated to the URL being audited.
 */
export async function runAccessibilityAudit(page: Page): Promise<A11yReport> {
  const results = await new AxeBuilder({ page }).analyze();

  const violations: A11yViolation[] = results.violations.map((v) => ({
    id: v.id,
    impact: (v.impact ?? null) as A11yViolation["impact"],
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    wcagTags: v.tags.filter((t) => t.startsWith("wcag")),
    nodes: v.nodes.map((n) => ({
      html: n.html,
      target: n.target.map(String),
      failureSummary: n.failureSummary,
    })),
  }));

  return {
    url: page.url(),
    violations,
    passCount: results.passes.length,
    scannedAt: new Date().toISOString(),
  };
}
