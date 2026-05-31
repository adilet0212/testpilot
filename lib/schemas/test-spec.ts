// lib/schemas/test-spec.ts

import { z } from "zod";

// ─── Actions ────────────────────────────────────────────────────────────────

export const TestActionSchema = z.enum([
  "navigate",
  "click",
  "dblClick",
  "rightClick",
  "fill",
  "clear",
  "select",
  "check",
  "uncheck",
  "hover",
  "focus",
  "blur",
  "press",        // keyboard key(s), e.g. "Enter", "Escape", "Control+A"
  "upload",       // file input — value is the filename hint
  "scroll",       // scroll element or page into view
  "drag",         // drag locator to targetLocator
  "waitForSelector",
  "waitForURL",
  "waitForResponse", // wait for a network response matching a URL pattern
  "waitForTimeout",  // hard wait — use sparingly
  "screenshot",
]);
export type TestAction = z.infer<typeof TestActionSchema>;

// ─── Assertions ──────────────────────────────────────────────────────────────

export const AssertionSchema = z.object({
  type: z.enum([
    "toBeVisible",
    "toBeHidden",
    "toBeEnabled",
    "toBeDisabled",
    "toBeChecked",
    "toBeEmpty",
    "toHaveText",
    "toContainText",
    "toHaveValue",
    "toHaveAttribute",
    "toHaveClass",
    "toHaveCSS",
    "toHaveURL",
    "toHaveTitle",
    "toHaveCount",
    "toMatchSnapshot",
  ]),
  /**
   * The locator for the element to assert on.
   * If omitted, assertion applies to the step's own locator.
   */
  locator: z.string().optional(),
  /** Expected string value — text, url, attribute value, css value, class name. */
  expected: z.string().optional(),
  /** For toHaveCount. */
  expectedCount: z.number().int().nonnegative().optional(),
  /**
   * For toHaveAttribute / toHaveCSS — the attribute or CSS property name.
   * e.g. attribute: "aria-expanded", expected: "true"
   *      attribute: "color",         expected: "rgb(0, 0, 0)"
   */
  attribute: z.string().optional(),
  /**
   * Whether to negate the assertion (adds .not before the matcher).
   * e.g. not: true + toBeVisible = toBeHidden equivalent but more explicit.
   */
  not: z.boolean().default(false),
});
export type Assertion = z.infer<typeof AssertionSchema>;

// ─── Steps ───────────────────────────────────────────────────────────────────

export const TestStepSchema = z.object({
  /**
   * Short description of what this step does.
   * Used as an inline comment in the emitted code.
   */
  description: z.string().min(1).max(200),
  action: TestActionSchema,
  /**
   * Playwright locator string.
   * Prefer role-based: "role=button[name='Submit']"
   * Fall back to: "text=Submit", "[data-testid='submit']", "css=button[type='submit']"
   * Required for all actions except: navigate, waitForURL, waitForResponse,
   * waitForTimeout, screenshot.
   */
  locator: z.string().optional(),
  /**
   * Action-specific value:
   * - fill / press / select / upload: the value to use
   * - navigate / waitForURL / waitForResponse: the URL or pattern
   * - waitForTimeout: milliseconds as string e.g. "1000"
   * - drag: the target locator to drag to
   * - scroll: "top" | "bottom" | the locator to scroll into view
   */
  value: z.string().optional(),
  /**
   * Assertion to run after this step completes.
   * Not every step needs one — only steps where you want to verify state.
   */
  assertion: AssertionSchema.optional(),
  /**
   * Whether to wrap this step in a try/catch and mark as soft assertion.
   * Useful for optional UI elements (e.g. cookie banners) that may or may not appear.
   */
  optional: z.boolean().default(false),
});
export type TestStep = z.infer<typeof TestStepSchema>;

// ─── Test Cases ───────────────────────────────────────────────────────────────

export const TestCaseSchema = z.object({
  /** Becomes the Playwright test() title string. */
  title: z.string().min(1).max(120),
  /**
   * Logical grouping — becomes the describe() block name.
   * e.g. "Navigation", "Auth Flow", "Contact Form", "Accessibility"
   */
  group: z.string().min(1).max(80),
  /**
   * Ordered list of steps. First step is usually a navigate.
   * Subsequent steps set up state; final step(s) carry the meaningful assertion.
   */
  steps: z.array(TestStepSchema).min(1).max(15),
  priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  /**
   * Tags for filtering — emitted as test.describe annotations or comments.
   * e.g. ["smoke", "auth", "form", "a11y"]
   */
  tags: z.array(z.string()).optional(),
  /**
   * If true, the emitter wraps this test in test.skip().
   * Claude sets this when it detects the flow exists but can't safely automate it
   * (e.g., OAuth redirect, CAPTCHA, payment form).
   */
  skip: z.boolean().default(false),
  skipReason: z.string().optional(),
});
export type TestCase = z.infer<typeof TestCaseSchema>;

// ─── Suite ────────────────────────────────────────────────────────────────────

export const TestSuiteSchema = z.object({
  /** Outer describe() block name + filename prefix. */
  suiteName: z.string().min(1).max(120),
  /** Claude echoes the URL back — we verify it matches what we sent. */
  targetUrl: z.string().url(),
  /**
   * Playwright baseURL — usually the origin of targetUrl.
   * Emitter writes this into playwright.config.ts use block.
   */
  baseUrl: z.string().url(),
  testCases: z.array(TestCaseSchema).min(1).max(25),
  /**
   * Claude's notes on what it found, what it skipped, and why.
   * Surfaces assumptions rather than silently hallucinating tests.
   */
  notes: z.array(z.string()).optional(),
});
export type TestSuite = z.infer<typeof TestSuiteSchema>;

// ─── API Response ─────────────────────────────────────────────────────────────

export const GenerateResponseSchema = z.object({
  runId: z.string().cuid(),
  testSuite: TestSuiteSchema,
});
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;