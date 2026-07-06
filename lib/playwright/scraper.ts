// lib/playwright/scraper.ts

import type { DomSnapshot, InteractiveElement, Form } from "@/lib/schemas/scrape";
import { launchBrowser } from "@/lib/playwright/browser";

// Custom error class — per project convention, no raw string throws
export class ScraperError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ScraperError";
  }
}

export async function scrapePage(url: string): Promise<DomSnapshot> {

  let browser;

  try {
    browser = await launchBrowser();

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    // Navigate and wait until the HTML is loaded
    // We use domcontentloaded instead of networkidle because many modern sites
    // have background network activity (analytics, polling) that never fully stops
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // Give JS frameworks (React, Vue, etc.) time to render their components
    await page.waitForTimeout(2000);

    // --- Extract page data ---
    // page.evaluate() runs code inside the actual browser, like opening DevTools
    // and typing JS in the console. Whatever it returns comes back to Node.js.

    const title = await page.title();

    const metaDescription = await page
      .$eval('meta[name="description"]', (el) => el.getAttribute("content") ?? "")
      .catch(() => "");

    const headings = await page.evaluate(() => {
      const results: { level: number; text: string }[] = [];
      document.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
        const text = el.textContent?.trim() ?? "";
        if (text) {
          results.push({
            level: parseInt(el.tagName[1]),
            text: text.slice(0, 200),
          });
        }
      });
      return results.slice(0, 50);
    });

    const interactiveElements = await page.evaluate(() => {
      const results: {
        tag: string;
        type?: string;
        text?: string;
        placeholder?: string;
        href?: string;
        hrefAttr?: string;
        ariaLabel?: string;
        id?: string;
        testId?: string;
        name?: string;
        hidden?: boolean;
      }[] = [];

      document
        .querySelectorAll("button, a, input, select, textarea, [role='button']")
        .forEach((el) => {
          const tag = el.tagName.toLowerCase();
          const text = el.textContent?.trim().slice(0, 100) || undefined;
          const ariaLabel = el.getAttribute("aria-label") ?? undefined;
          const id = el.id || undefined;
          const testId = el.getAttribute("data-testid") ?? undefined;
          const name = el.getAttribute("name") ?? undefined;
          // Flag elements that exist in the DOM but aren't visible at load
          // (closed dropdowns, mobile navs) — clicking them times out.
          const isVisible =
            typeof (el as HTMLElement).checkVisibility === "function"
              ? (el as HTMLElement).checkVisibility()
              : (el as HTMLElement).offsetParent !== null;
          const hidden = isVisible ? undefined : true;

          if (tag === "input") {
            results.push({
              tag,
              type: (el as HTMLInputElement).type,
              placeholder: (el as HTMLInputElement).placeholder || undefined,
              ariaLabel,
              id,
              testId,
              name,
              hidden,
            });
          } else if (tag === "a") {
            const href = (el as HTMLAnchorElement).href || undefined;
            const hrefAttr = el.getAttribute("href") ?? undefined;
            if (text || ariaLabel) {
              results.push({ tag, text, href, hrefAttr, ariaLabel, id, testId, hidden });
            }
          } else {
            if (text || ariaLabel) {
              results.push({
                tag,
                type: el.getAttribute("type") ?? undefined,
                text,
                ariaLabel,
                id,
                testId,
                hidden,
              });
            }
          }
        });

      return results.slice(0, 100);
    });

    const forms = await page.evaluate(() => {
      const results: {
        action?: string;
        method?: string;
        fields: {
          tag: string;
          type?: string;
          placeholder?: string;
          name?: string;
          id?: string;
        }[];
      }[] = [];

      document.querySelectorAll("form").forEach((form) => {
        const fields: {
          tag: string;
          type?: string;
          placeholder?: string;
          name?: string;
          id?: string;
        }[] = [];

        form.querySelectorAll("input, select, textarea").forEach((field) => {
          fields.push({
            tag: field.tagName.toLowerCase(),
            type: field.getAttribute("type") ?? undefined,
            placeholder: field.getAttribute("placeholder") ?? undefined,
            name: field.getAttribute("name") ?? undefined,
            id: field.id || undefined,
          });
        });

        results.push({
          action: form.action || undefined,
          method: form.method || undefined,
          fields,
        });
      });

      return results.slice(0, 10);
    });

    const snapshot: DomSnapshot = {
      url,
      title,
      metaDescription: metaDescription || undefined,
      headings,
      interactiveElements: interactiveElements as InteractiveElement[],
      forms: forms as Form[],
      scrapedAt: new Date().toISOString(),
    };

    return snapshot;
  } catch (error) {
    throw new ScraperError(
      `Failed to scrape ${url}: ${error instanceof Error ? error.message : "Unknown error"}`,
      error
    );
  } finally {
    // Always close the browser even if scraping failed — prevents memory leaks
    await browser?.close();
  }
}