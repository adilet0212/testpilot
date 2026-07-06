// lib/generator/emitter.test.ts
import { describe, it, expect } from "vitest";
import { emitTestFiles } from "./emitter";
import type { TestSuite, TestCase } from "@/lib/schemas/test-spec";

function makeSuite(testCases: TestCase[], overrides: Partial<TestSuite> = {}): TestSuite {
  return {
    suiteName: "Example Suite",
    targetUrl: "https://example.com",
    baseUrl: "https://example.com",
    testCases,
    ...overrides,
  };
}

function makeCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    title: "does a thing",
    group: "Group A",
    priority: "medium",
    skip: false,
    steps: [{ description: "navigate", action: "navigate", value: "https://example.com", optional: false }],
    ...overrides,
  };
}

describe("emitTestFiles", () => {
  it("emits a spec file and a playwright.config.ts", () => {
    const files = emitTestFiles(makeSuite([makeCase()]));
    expect(files).toHaveLength(2);
    expect(files[0].filename).toBe("example-suite.spec.ts");
    expect(files[1].filename).toBe("playwright.config.ts");
    expect(files[1].content).toContain("baseURL: 'https://example.com'");
  });

  it("slugifies the suite name for the filename, falling back when empty after stripping", () => {
    const files = emitTestFiles(makeSuite([makeCase()], { suiteName: "!!!" }));
    expect(files[0].filename).toBe("test-suite.spec.ts");
  });

  it("groups test cases into nested describe blocks by group", () => {
    const files = emitTestFiles(
      makeSuite([
        makeCase({ group: "Nav", title: "case one" }),
        makeCase({ group: "Nav", title: "case two" }),
        makeCase({ group: "Forms", title: "case three" }),
      ])
    );
    const content = files[0].content;
    expect(content).toContain("test.describe('Nav'");
    expect(content).toContain("test.describe('Forms'");
    // Both Nav cases should appear inside a single Nav block, not two separate ones.
    expect(content.match(/test\.describe\('Nav'/g)).toHaveLength(1);
  });

  it("wraps skipped cases in test.skip and preserves the skip reason as a comment", () => {
    const files = emitTestFiles(
      makeSuite([makeCase({ skip: true, skipReason: "OAuth flow", title: "login via Google" })])
    );
    const content = files[0].content;
    expect(content).toContain("test.skip('login via Google'");
    expect(content).toContain("// Skip reason: OAuth flow");
  });

  it("wraps optional steps in try/catch", () => {
    const files = emitTestFiles(
      makeSuite([
        makeCase({
          steps: [
            {
              description: "dismiss cookie banner",
              action: "click",
              locator: "text=Accept",
              optional: true,
            },
          ],
        }),
      ])
    );
    const content = files[0].content;
    expect(content).toContain("try {");
    expect(content).toContain("} catch { /* optional — element may not be present */ }");
  });

  it("escapes single quotes in locators so the emitted string literal stays valid", () => {
    const files = emitTestFiles(
      makeSuite([
        makeCase({
          steps: [
            {
              description: "click a locator with an embedded quote",
              action: "click",
              locator: "h1:has-text('Welcome')",
              optional: false,
            },
          ],
        }),
      ])
    );
    const content = files[0].content;
    expect(content).toContain("page.locator('h1:has-text(\\'Welcome\\')')");
    // Sanity check: the emitted file must be syntactically valid JS (balanced quotes).
    expect(() => new Function(content.replace(/^import.*$/m, ""))).not.toThrow();
  });

  it("escapes backslashes before quotes, in the correct order", () => {
    const files = emitTestFiles(
      makeSuite([
        makeCase({
          steps: [
            { description: "fill", action: "fill", locator: "input", value: "C:\\path\\'quoted'", optional: false },
          ],
        }),
      ])
    );
    const content = files[0].content;
    // A backslash-then-quote should become \\\' , not \\'  (which would escape the following char instead).
    expect(content).toContain("C:\\\\path\\\\\\'quoted\\'");
  });

  it("applies esc() to assertion locators as well as step locators", () => {
    const files = emitTestFiles(
      makeSuite([
        makeCase({
          steps: [
            {
              description: "assert on a different locator than the step's own",
              action: "click",
              locator: "button",
              optional: false,
              assertion: {
                type: "toBeVisible",
                locator: "h1:has-text('Done')",
                not: false,
              },
            },
          ],
        }),
      ])
    );
    expect(files[0].content).toContain("expect(page.locator('h1:has-text(\\'Done\\')'))");
  });

  it("emits toHaveURL and toHaveTitle against the page, not a locator", () => {
    const files = emitTestFiles(
      makeSuite([
        makeCase({
          steps: [
            {
              description: "navigate",
              action: "navigate",
              value: "https://example.com/docs",
              optional: false,
              assertion: { type: "toHaveURL", expected: "**/docs", not: false },
            },
          ],
        }),
      ])
    );
    expect(files[0].content).toContain("await expect(page).toHaveURL('**/docs');");
  });

  it("prefixes assertions with .not when the not flag is set", () => {
    const files = emitTestFiles(
      makeSuite([
        makeCase({
          steps: [
            {
              description: "check hidden",
              action: "click",
              locator: "button",
              optional: false,
              assertion: { type: "toBeVisible", not: true },
            },
          ],
        }),
      ])
    );
    expect(files[0].content).toContain(".not.toBeVisible();");
  });

  it("emits every documented action type without falling through to the unhandled default", () => {
    const actions: TestCase["steps"][number]["action"][] = [
      "navigate", "click", "dblClick", "rightClick", "fill", "clear", "select",
      "check", "uncheck", "hover", "focus", "blur", "press", "upload", "scroll",
      "drag", "waitForSelector", "waitForURL", "waitForResponse", "waitForTimeout",
      "screenshot",
    ];
    for (const action of actions) {
      const files = emitTestFiles(
        makeSuite([
          makeCase({
            steps: [{ description: "step", action, locator: "button", value: "x", optional: false }],
          }),
        ])
      );
      expect(files[0].content).not.toContain(`unhandled action: ${action}`);
    }
  });

  it("emits every documented assertion type without falling through to the unhandled default", () => {
    const types: NonNullable<TestCase["steps"][number]["assertion"]>["type"][] = [
      "toBeVisible", "toBeHidden", "toBeEnabled", "toBeDisabled", "toBeChecked",
      "toBeEmpty", "toHaveText", "toContainText", "toHaveValue", "toHaveAttribute",
      "toHaveClass", "toHaveCSS", "toHaveURL", "toHaveTitle", "toHaveCount", "toMatchSnapshot",
    ];
    for (const type of types) {
      const files = emitTestFiles(
        makeSuite([
          makeCase({
            steps: [
              {
                description: "step",
                action: "click",
                locator: "button",
                optional: false,
                assertion: { type, expected: "x", expectedCount: 1, attribute: "href", not: false },
              },
            ],
          }),
        ])
      );
      expect(files[0].content).not.toContain(`unhandled assertion: ${type}`);
    }
  });
});
