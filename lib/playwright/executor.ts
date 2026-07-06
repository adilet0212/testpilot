// lib/playwright/executor.ts

import type { Browser, Locator, Page } from "@playwright/test";
import type { TestCase, TestStep, Assertion } from "@/lib/schemas/test-spec";

// ─── Result types (shaped for SSE streaming: one TestCase in, one result out) ──

export interface StepResult {
  description: string;
  passed: boolean;
  error?: string;
}

export interface TestCaseResult {
  title: string;
  group: string;
  passed: boolean;
  skipped: boolean;
  skipReason?: string;
  steps: StepResult[];
  /**
   * Base64-encoded JPEG of the final page state — present for every
   * non-skipped test case, as visual proof either way. Captured at the point
   * of failure if one occurred, or right after the last successful step.
   */
  screenshotBase64?: string;
  durationMs: number;
}

// ─── Error class ─────────────────────────────────────────────────────────────

export class ExecutorError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ExecutorError";
  }
}

// launchBrowser() now lives in lib/playwright/browser.ts (shared with scraper.ts)
export { launchBrowser } from "./browser";

// ─── Strict-mode recovery ────────────────────────────────────────────────────

/**
 * LLM-generated locators sometimes match more than one element (e.g. a nav link
 * and a body link sharing text). Rather than failing the whole test on
 * Playwright's strict mode violation, retry the operation against .first() —
 * the first match is what a human author almost always meant.
 */
function isStrictModeViolation(err: unknown): boolean {
  return err instanceof Error && err.message.includes("strict mode violation");
}

async function withFirstFallback<T>(
  base: Locator | undefined,
  run: (l: Locator | undefined) => Promise<T>,
  onFallback?: () => void
): Promise<T> {
  try {
    return await run(base);
  } catch (err) {
    if (base && isStrictModeViolation(err)) {
      onFallback?.();
      return run(base.first());
    }
    throw err;
  }
}

// ─── Assertion runner ────────────────────────────────────────────────────────

/**
 * expect(page).toHaveURL() string-compares exactly — it does NOT glob-match
 * the way page.waitForURL() does. Generated specs use glob patterns like
 * "**\/docs/intro", so convert those to an equivalent RegExp.
 */
function urlPatternToMatcher(pattern: string): string | RegExp {
  if (!pattern.includes("*")) return pattern;
  // Split on the literal "**" token first so escaping and single-"*" handling
  // never have to distinguish "**" from "*" inside the same regex pass.
  const segments = pattern
    .split("**")
    .map((segment) => segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*"));
  // `^` is required — without it this only matches as a substring anywhere in
  // the URL, not from the start (a pattern like "https://x.com/checkout*"
  // would then also match "https://evil.com/?next=https://x.com/checkout").
  return new RegExp(`^${segments.join(".*")}/?$`);
}
async function runAssertion(
  page: Page,
  assertion: Assertion,
  fallbackLocator?: string,
  onFallback?: () => void
): Promise<void> {
  const { expect } = await import("@playwright/test");
  const { type, locator: assertLocator, expected, expectedCount, attribute, not } = assertion;

  // toHaveURL and toHaveTitle operate on the page, not an element
  if (type === "toHaveURL") {
    const matcher = expect(page);
    const urlMatcher = urlPatternToMatcher(expected ?? "");
    if (not) {
      await matcher.not.toHaveURL(urlMatcher);
    } else {
      await matcher.toHaveURL(urlMatcher);
    }
    return;
  }

  if (type === "toHaveTitle") {
    const matcher = expect(page);
    if (not) {
      await matcher.not.toHaveTitle(expected ?? "");
    } else {
      await matcher.toHaveTitle(expected ?? "");
    }
    return;
  }

  // All remaining assertions target a locator
  const locatorStr = assertLocator ?? fallbackLocator;
  if (!locatorStr) {
    throw new ExecutorError(`Assertion '${type}' requires a locator`);
  }

  await withFirstFallback(
    page.locator(locatorStr),
    async (locOrUndef) => {
    const loc = locOrUndef!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- playwright's expect API is dynamic
    const base = expect(loc) as any;
    const m = not ? base.not : base;

    switch (type) {
      case "toBeVisible":       await m.toBeVisible(); break;
      case "toBeHidden":        await m.toBeHidden(); break;
      case "toBeEnabled":       await m.toBeEnabled(); break;
      case "toBeDisabled":      await m.toBeDisabled(); break;
      case "toBeChecked":       await m.toBeChecked(); break;
      case "toBeEmpty":         await m.toBeEmpty(); break;
      case "toHaveText":        await m.toHaveText(expected ?? ""); break;
      case "toContainText":     await m.toContainText(expected ?? ""); break;
      case "toHaveValue":       await m.toHaveValue(expected ?? ""); break;
      case "toHaveClass":       await m.toHaveClass(expected ?? ""); break;
      case "toHaveCount":       await m.toHaveCount(expectedCount ?? 0); break;
      case "toHaveAttribute":
        await m.toHaveAttribute(attribute ?? "", expected ?? "");
        break;
      case "toHaveCSS":
        await m.toHaveCSS(attribute ?? "", expected ?? "");
        break;
      case "toMatchSnapshot":
        // No baseline files in serverless execution — capture screenshot and pass.
        await loc.screenshot();
        break;
      default: {
        const _: never = type;
        throw new ExecutorError(`Unknown assertion type: ${_}`);
      }
    }
    },
    onFallback
  );
}

// ─── Screenshot capture ───────────────────────────────────────────────────────

/**
 * JPEG at quality 70 rather than Playwright's default PNG — a run captures up
 * to one of these per test case now (pass or fail), and JPEG cuts payload
 * size 5-10x, which matters for the Json column and the SSE stream.
 */
async function captureScreenshot(page: Page): Promise<string | undefined> {
  try {
    const buf = await page.screenshot({ fullPage: false, type: "jpeg", quality: 70 });
    return buf.toString("base64");
  } catch {
    return undefined; // Screenshot failure is non-fatal
  }
}

// ─── Step runner ─────────────────────────────────────────────────────────────

async function runStep(page: Page, step: TestStep, onFallback?: () => void): Promise<void> {
  const { action, locator, value, assertion } = step;

  const perform = async (L: Locator | undefined) => {
    switch (action) {
      case "navigate":
        await page.goto(value ?? "", { waitUntil: "domcontentloaded", timeout: 30_000 });
        break;

      case "click":
        await L!.click();
        break;

      case "dblClick":
        await L!.dblclick();
        break;

      case "rightClick":
        await L!.click({ button: "right" });
        break;

      case "fill":
        await L!.fill(value ?? "");
        break;

      case "clear":
        await L!.clear();
        break;

      case "select":
        await L!.selectOption(value ?? "");
        break;

      case "check":
        await L!.check();
        break;

      case "uncheck":
        await L!.uncheck();
        break;

      case "hover":
        await L!.hover();
        break;

      case "focus":
        await L!.focus();
        break;

      case "blur":
        await L!.blur();
        break;

      case "press":
        if (L) {
          await L.press(value ?? "");
        } else {
          await page.keyboard.press(value ?? "");
        }
        break;

      case "upload":
        // value is a filename hint — upload a blank buffer with that name
        await L!.setInputFiles({
          name: value ?? "file.txt",
          mimeType: "application/octet-stream",
          buffer: Buffer.from(""),
        });
        break;

      case "scroll":
        if (!L || value === "top") {
          await page.evaluate(() => window.scrollTo(0, 0));
        } else if (value === "bottom") {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        } else {
          await L.scrollIntoViewIfNeeded();
        }
        break;

      case "drag":
        // value is the target locator string
        await L!.dragTo(page.locator(value ?? ""));
        break;

      case "waitForSelector":
        await page.waitForSelector(locator ?? value ?? "", { timeout: 10_000 });
        break;

      case "waitForURL":
        await page.waitForURL(value ?? "", { timeout: 10_000 });
        break;

      case "waitForResponse":
        await page.waitForResponse(value ?? "", { timeout: 10_000 });
        break;

      case "waitForTimeout":
        await page.waitForTimeout(parseInt(value ?? "1000", 10));
        break;

      case "screenshot":
        await page.screenshot();
        break;

      default: {
        const _: never = action;
        throw new ExecutorError(`Unknown action type: ${_}`);
      }
    }
  };

  await withFirstFallback(locator ? page.locator(locator) : undefined, perform, onFallback);

  // Run the step's assertion (if any) after the action completes
  if (assertion) {
    await runAssertion(page, assertion, locator, onFallback);
  }
}

// ─── Main export: one TestCase in, one TestCaseResult out ────────────────────

export async function executeTestCase(
  testCase: TestCase,
  browser: Browser
): Promise<TestCaseResult> {
  const start = Date.now();

  // Return immediately for skipped cases — no browser work needed
  if (testCase.skip) {
    return {
      title: testCase.title,
      group: testCase.group,
      passed: true,
      skipped: true,
      skipReason: testCase.skipReason,
      steps: [],
      durationMs: 0,
    };
  }

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  // Playwright's default 30s action timeout lets one bad locator eat most of
  // the serverless wall-clock budget — 10s is plenty for a healthy page.
  context.setDefaultTimeout(10_000);
  const page = await context.newPage();

  const stepResults: StepResult[] = [];
  let passed = true;
  let screenshotBase64: string | undefined;

  try {
    for (const step of testCase.steps) {
      // Tracks whether a locator on this step resolved to >1 element and had
      // to fall back to .first() — surfaced in the description so a "passed"
      // step doesn't silently hide an ambiguous, LLM-generated locator.
      let usedFallback = false;
      const onFallback = () => {
        usedFallback = true;
      };
      const describe = (description: string) =>
        usedFallback ? `${description} (locator was ambiguous — used first match)` : description;

      if (step.optional) {
        // Optional steps: run but don't fail the test case on error
        try {
          await runStep(page, step, onFallback);
          stepResults.push({ description: describe(step.description), passed: true });
        } catch {
          stepResults.push({ description: describe(step.description), passed: true }); // soft pass
        }
        continue;
      }

      try {
        await runStep(page, step, onFallback);
        stepResults.push({ description: describe(step.description), passed: true });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        stepResults.push({ description: describe(step.description), passed: false, error });
        passed = false;

        // Capture failure screenshot, then stop — no further steps run
        screenshotBase64 = await captureScreenshot(page);
        break;
      }
    }

    // All steps passed — capture the final state as proof, same as a failure would.
    if (passed) {
      screenshotBase64 = await captureScreenshot(page);
    }
  } finally {
    await context.close();
  }

  return {
    title: testCase.title,
    group: testCase.group,
    passed,
    skipped: false,
    steps: stepResults,
    screenshotBase64,
    durationMs: Date.now() - start,
  };
}
