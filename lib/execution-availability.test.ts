// lib/execution-availability.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isLiveExecutionAvailable } from "./execution-availability";

const KEYS = ["LIVE_EXECUTION_ENABLED", "VERCEL", "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("isLiveExecutionAvailable", () => {
  it("is false when nothing is configured", () => {
    expect(isLiveExecutionAvailable()).toBe(false);
  });

  it("is true when a local Chromium binary is configured", () => {
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = "/usr/bin/chromium";
    expect(isLiveExecutionAvailable()).toBe(true);
  });

  it("is false on Vercel even when a Chromium path is set", () => {
    // Regression: a local .env copied into Vercel carries a Windows Chromium
    // path that means nothing on Linux. Trusting it re-enabled a button that
    // always failed in production.
    process.env.VERCEL = "1";
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = "C:\\Users\\me\\chrome.exe";
    expect(isLiveExecutionAvailable()).toBe(false);
  });

  it("lets an explicit true override win on Vercel", () => {
    process.env.VERCEL = "1";
    process.env.LIVE_EXECUTION_ENABLED = "true";
    expect(isLiveExecutionAvailable()).toBe(true);
  });

  it("lets an explicit false override win over a local Chromium path", () => {
    process.env.LIVE_EXECUTION_ENABLED = "false";
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = "/usr/bin/chromium";
    expect(isLiveExecutionAvailable()).toBe(false);
  });

  it("ignores values other than the exact strings true/false", () => {
    process.env.LIVE_EXECUTION_ENABLED = "yes";
    expect(isLiveExecutionAvailable()).toBe(false);
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = "/usr/bin/chromium";
    expect(isLiveExecutionAvailable()).toBe(true);
  });
});
