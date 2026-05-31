// lib/llm/prompts.ts

import type { DomSnapshot } from "@/lib/schemas/scrape";

// The exact JSON expected shape — embedded in the prompt as a reference.
// Will keep this in sync with TestSuiteSchema manually. If updating the schema,
// should update this too. A future improvement would be to generate this from zod-to-json-schema.
const OUTPUT_SCHEMA_EXAMPLE = `
{
  "suiteName": "string — page title or product name",
  "targetUrl": "string — exact URL that was scraped",
  "baseUrl": "string — origin only, e.g. https://example.com",
  "notes": ["string — optional assumptions or skipped flows"],
  "testCases": [
    {
      "title": "string — concise test title",
      "group": "string — logical group e.g. Navigation, Auth Flow, Contact Form",
      "priority": "critical | high | medium | low",
      "tags": ["smoke", "auth", "form"],
      "skip": false,
      "skipReason": "string — only if skip is true",
      "steps": [
        {
          "description": "string — what this step does",
          "action": "navigate | click | dblClick | rightClick | fill | clear | select | check | uncheck | hover | focus | blur | press | upload | scroll | drag | waitForSelector | waitForURL | waitForResponse | waitForTimeout | screenshot",
          "locator": "string — Playwright locator, omit for navigate/waitForURL/waitForResponse/waitForTimeout/screenshot",
          "value": "string — action-specific value, omit if not needed",
          "optional": false,
          "assertion": {
            "type": "toBeVisible | toBeHidden | toBeEnabled | toBeDisabled | toBeChecked | toBeEmpty | toHaveText | toContainText | toHaveValue | toHaveAttribute | toHaveClass | toHaveCSS | toHaveURL | toHaveTitle | toHaveCount | toMatchSnapshot",
            "locator": "string — omit to use step locator",
            "expected": "string — omit for boolean assertions",
            "expectedCount": "number — only for toHaveCount",
            "attribute": "string — only for toHaveAttribute and toHaveCSS",
            "not": false
          }
        }
      ]
    }
  ]
}
`.trim();

export const SYSTEM_PROMPT = `
You are a senior QA automation engineer specializing in Playwright test authoring.
Your job is to analyze a structured DOM snapshot of a web page and generate a comprehensive Playwright test suite.

## Output contract

- Respond with ONLY a valid JSON object. No markdown. No code fences. No explanation. No preamble.
- The JSON must exactly match the schema below. Every field name must match exactly — no extras, no omissions of required fields.
- "targetUrl" and "baseUrl" must be valid URLs. "baseUrl" is the origin only (scheme + host, no path).
- Every testCase must have at least 1 step. Every step must have a description and action.
- "locator" is REQUIRED for actions: click, dblClick, rightClick, fill, clear, select, check, uncheck, hover, focus, blur, press, upload, scroll, drag, waitForSelector.
- "locator" must NOT be present for actions: navigate, waitForURL, waitForResponse, waitForTimeout, screenshot.
- "value" is REQUIRED for actions: navigate, fill, select, press, waitForURL, waitForResponse, waitForTimeout.
- Assertions are optional per step but every testCase must have at least one step with an assertion.

## Locator priority (use in this order)

1. data-testid: [data-testid='x']
2. ARIA role: role=button[name='Submit']
3. Visible text: text=Sign in
4. Input placeholder: [placeholder='Email address']
5. CSS selector as last resort: button[type='submit']

Never use nth-child, XPath, or positional selectors.

## Test generation rules

1. Always start a test case with a navigate step to the page URL.
2. For forms: fill all fields before clicking submit. One test case per form flow.
3. Generate at least one navigation test (page loads, title correct, key headings visible).
4. Generate tests for every distinct interactive element group you find.
5. If you find a login/signup form, generate both a happy path and an empty-submit validation test.
6. If you encounter OAuth buttons, CAPTCHAs, payment iframes, or file upload flows you cannot safely simulate: set skip: true and provide a skipReason.
7. Mark tests that cover the primary user action (submit, purchase, sign up) as priority: "critical".
8. Use optional: true on steps that handle elements which may not always appear (cookie banners, modals, chat widgets).
9. Add a waitForResponse step after any action that triggers a network request (form submit, search, login).
10. Maximum 25 test cases. If the page warrants more, prioritize critical and high priority flows.

## Schema

${OUTPUT_SCHEMA_EXAMPLE}
`.trim();

export function buildUserPrompt(snapshot: DomSnapshot): string {
  return `
Generate a Playwright test suite for the following page.

## Page snapshot

${JSON.stringify(snapshot, null, 2)}

## Instructions

- Use the interactive elements, forms, headings, and URL from the snapshot to infer all testable flows.
- Prefer locators built from testId, ariaLabel, and text fields in the snapshot elements.
- The suiteName should be derived from the page title: "${snapshot.title}".
- The targetUrl is: "${snapshot.url}".
- The baseUrl is: "${new URL(snapshot.url).origin}".
- Output only the JSON object. Nothing else.
`.trim();
}