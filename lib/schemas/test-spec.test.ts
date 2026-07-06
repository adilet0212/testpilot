// lib/schemas/test-spec.test.ts
import { describe, it, expect } from "vitest";
import {
  TestStepSchema,
  TestCaseSchema,
  TestSuiteSchema,
  AssertionSchema,
} from "./test-spec";

function validStep(overrides: Record<string, unknown> = {}) {
  return {
    description: "click the button",
    action: "click",
    locator: "button",
    ...overrides,
  };
}

function validCase(overrides: Record<string, unknown> = {}) {
  return {
    title: "a test case",
    group: "Group",
    steps: [validStep()],
    ...overrides,
  };
}

function validSuite(overrides: Record<string, unknown> = {}) {
  return {
    suiteName: "Suite",
    targetUrl: "https://example.com",
    baseUrl: "https://example.com",
    testCases: [validCase()],
    ...overrides,
  };
}

describe("AssertionSchema", () => {
  it("defaults `not` to false when omitted", () => {
    const result = AssertionSchema.parse({ type: "toBeVisible" });
    expect(result.not).toBe(false);
  });

  it("rejects an assertion type outside the documented enum", () => {
    const result = AssertionSchema.safeParse({ type: "toBeAwesome" });
    expect(result.success).toBe(false);
  });

  it("allows locator, expected, expectedCount, and attribute to all be omitted", () => {
    const result = AssertionSchema.safeParse({ type: "toBeVisible" });
    expect(result.success).toBe(true);
  });
});

describe("TestStepSchema", () => {
  it("accepts a step with only description and action (locator/value optional)", () => {
    const result = TestStepSchema.safeParse({ description: "wait", action: "waitForTimeout" });
    expect(result.success).toBe(true);
  });

  it("rejects a step missing description", () => {
    const result = TestStepSchema.safeParse({ action: "click" });
    expect(result.success).toBe(false);
  });

  it("rejects a step with an unknown action", () => {
    const result = TestStepSchema.safeParse(validStep({ action: "teleport" }));
    expect(result.success).toBe(false);
  });

  it("rejects an empty description", () => {
    const result = TestStepSchema.safeParse(validStep({ description: "" }));
    expect(result.success).toBe(false);
  });

  it("defaults `optional` to false when omitted", () => {
    const result = TestStepSchema.parse(validStep());
    expect(result.optional).toBe(false);
  });
});

describe("TestCaseSchema", () => {
  it("requires at least one step", () => {
    const result = TestCaseSchema.safeParse(validCase({ steps: [] }));
    expect(result.success).toBe(false);
  });

  it("rejects more than 15 steps", () => {
    const steps = Array.from({ length: 16 }, () => validStep());
    const result = TestCaseSchema.safeParse(validCase({ steps }));
    expect(result.success).toBe(false);
  });

  it("accepts exactly 15 steps", () => {
    const steps = Array.from({ length: 15 }, () => validStep());
    const result = TestCaseSchema.safeParse(validCase({ steps }));
    expect(result.success).toBe(true);
  });

  it("defaults priority to medium and skip to false", () => {
    const result = TestCaseSchema.parse(validCase());
    expect(result.priority).toBe("medium");
    expect(result.skip).toBe(false);
  });

  it("rejects a priority outside the documented enum", () => {
    const result = TestCaseSchema.safeParse(validCase({ priority: "urgent" }));
    expect(result.success).toBe(false);
  });

  it("rejects a title over 120 characters", () => {
    const result = TestCaseSchema.safeParse(validCase({ title: "x".repeat(121) }));
    expect(result.success).toBe(false);
  });
});

describe("TestSuiteSchema", () => {
  it("requires at least one test case", () => {
    const result = TestSuiteSchema.safeParse(validSuite({ testCases: [] }));
    expect(result.success).toBe(false);
  });

  it("rejects more than 25 test cases", () => {
    const testCases = Array.from({ length: 26 }, () => validCase());
    const result = TestSuiteSchema.safeParse(validSuite({ testCases }));
    expect(result.success).toBe(false);
  });

  it("rejects a non-URL targetUrl", () => {
    const result = TestSuiteSchema.safeParse(validSuite({ targetUrl: "not-a-url" }));
    expect(result.success).toBe(false);
  });

  it("accepts a suite with no notes (notes is optional)", () => {
    const result = TestSuiteSchema.safeParse(validSuite());
    expect(result.success).toBe(true);
  });

  it("round-trips a realistic multi-step, multi-assertion suite", () => {
    const suite = validSuite({
      testCases: [
        validCase({
          steps: [
            validStep({ description: "navigate", action: "navigate", locator: undefined, value: "https://example.com" }),
            validStep({
              description: "assert heading",
              action: "waitForSelector",
              locator: "h1",
              assertion: { type: "toHaveText", expected: "Welcome", not: false },
            }),
          ],
        }),
      ],
    });
    const result = TestSuiteSchema.safeParse(suite);
    expect(result.success).toBe(true);
  });
});
