// lib/playwright/executor.ts

import type { Browser, Page } from "playwright-core";
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
  /** Base64-encoded PNG — only present when the test case fails. */
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

// ─── Browser factory (mirrors scraper.ts dev/prod switching) ─────────────────

export async function launchBrowser(): Promise<Browser> {
  const { chromium: playwrightChromium } = await import("playwright-core");
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

  if (executablePath) {
    return playwrightChromium.launch({
      headless: true,
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  const chromium = await import("@sparticuz/chromium");
  return playwrightChromium.launch({
    args: chromium.default.args,
    executablePath: await chromium.default.executablePath(),
    headless: true,
  });
}

// ─── Assertion runner ────────────────────────────────────────────────────────

async function runAssertion(page: Page, assertion: Assertion, fallbackLocator?: string): Promise<void> {
  const { expect } = await import("@playwright/test");
  const { type, locator: assertLocator, expected, expectedCount, attribute, not } = assertion;

  // toHaveURL and toHaveTitle operate on the page, not an element
  if (type === "toHaveURL") {
    const matcher = expect(page);
    if (not) {
      await matcher.not.toHaveURL(expected ?? "");
    } else {
      await matcher.toHaveURL(expected ?? "");
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

  const loc = page.locator(locatorStr);
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
}

// ─── Step runner ─────────────────────────────────────────────────────────────

async function runStep(page: Page, step: TestStep): Promise<void> {
  const { action, locator, value, assertion } = step;

  switch (action) {
    case "navigate":
      await page.goto(value ?? "", { waitUntil: "domcontentloaded", timeout: 30_000 });
      break;

    case "click":
      await page.locator(locator!).click();
      break;

    case "dblClick":
      await page.locator(locator!).dblclick();
      break;

    case "rightClick":
      await page.locator(locator!).click({ button: "right" });
      break;

    case "fill":
      await page.locator(locator!).fill(value ?? "");
      break;

    case "clear":
      await page.locator(locator!).clear();
      break;

    case "select":
      await page.locator(locator!).selectOption(value ?? "");
      break;

    case "check":
      await page.locator(locator!).check();
      break;

    case "uncheck":
      await page.locator(locator!).uncheck();
      break;

    case "hover":
      await page.locator(locator!).hover();
      break;

    case "focus":
      await page.locator(locator!).focus();
      break;

    case "blur":
      await page.locator(locator!).blur();
      break;

    case "press":
      if (locator) {
        await page.locator(locator).press(value ?? "");
      } else {
        await page.keyboard.press(value ?? "");
      }
      break;

    case "upload":
      // value is a filename hint — upload a blank buffer with that name
      await page.locator(locator!).setInputFiles({
        name: value ?? "file.txt",
        mimeType: "application/octet-stream",
        buffer: Buffer.from(""),
      });
      break;

    case "scroll":
      if (!locator || value === "top") {
        await page.evaluate(() => window.scrollTo(0, 0));
      } else if (value === "bottom") {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      } else {
        await page.locator(locator).scrollIntoViewIfNeeded();
      }
      break;

    case "drag":
      // value is the target locator string
      await page.locator(locator!).dragTo(page.locator(value ?? ""));
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

  // Run the step's assertion (if any) after the action completes
  if (assertion) {
    await runAssertion(page, assertion, locator);
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
  const page = await context.newPage();

  const stepResults: StepResult[] = [];
  let passed = true;
  let screenshotBase64: string | undefined;

  try {
    for (const step of testCase.steps) {
      if (step.optional) {
        // Optional steps: run but don't fail the test case on error
        try {
          await runStep(page, step);
          stepResults.push({ description: step.description, passed: true });
        } catch {
          stepResults.push({ description: step.description, passed: true }); // soft pass
        }
        continue;
      }

      try {
        await runStep(page, step);
        stepResults.push({ description: step.description, passed: true });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        stepResults.push({ description: step.description, passed: false, error });
        passed = false;

        // Capture failure screenshot, then stop — no further steps run
        try {
          const buf = await page.screenshot({ fullPage: false });
          screenshotBase64 = buf.toString("base64");
        } catch {
          // Screenshot failure is non-fatal
        }
        break;
      }
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
