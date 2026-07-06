// lib/schemas/scrape.ts

import { z } from "zod";

// What the client sends to /api/scrape
export const ScrapeRequestSchema = z.object({
  url: z
    .string()
    .url("Must be a valid URL")
    .refine(
      (url) => url.startsWith("http://") || url.startsWith("https://"),
      "URL must use http or https"
    ),
  runId: z.string().cuid("Must be a valid run ID"),
});

// A single interactive element on the page (button, link, input, etc.)
export const InteractiveElementSchema = z.object({
  tag: z.string(),           // e.g. "button", "input", "a"
  type: z.string().optional(), // e.g. "submit", "text", "email" (for inputs)
  text: z.string().optional(), // visible text content
  placeholder: z.string().optional(),
  href: z.string().optional(), // for anchor tags — absolutized by the DOM (el.href)
  /**
   * The raw href ATTRIBUTE as written in the HTML (often relative, e.g. "/docs").
   * Locators like a[href='...'] must match this, not the absolutized `href` —
   * a selector built from the absolute URL will silently match nothing.
   */
  hrefAttr: z.string().optional(),
  ariaLabel: z.string().optional(),
  id: z.string().optional(),
  testId: z.string().optional(), // data-testid attribute if present
  name: z.string().optional(),
  /**
   * Set (true) only when the element is NOT visible at page load — e.g. links
   * inside closed dropdown menus or mobile navs. Clicking these directly
   * times out; a prior step must open the containing menu first.
   */
  hidden: z.boolean().optional(),
});

// A form and its fields
export const FormSchema = z.object({
  action: z.string().optional(),
  method: z.string().optional(),
  fields: z.array(InteractiveElementSchema),
});

// The full structured snapshot of a scraped page
export const DomSnapshotSchema = z.object({
  url: z.string(),
  title: z.string(),
  headings: z.array(z.object({ level: z.number(), text: z.string() })),
  interactiveElements: z.array(InteractiveElementSchema),
  forms: z.array(FormSchema),
  metaDescription: z.string().optional(),
  scrapedAt: z.string().datetime(),
});

// Types inferred from schemas — use these instead of writing interfaces manually
export type ScrapeRequest = z.infer<typeof ScrapeRequestSchema>;
export type InteractiveElement = z.infer<typeof InteractiveElementSchema>;
export type DomSnapshot = z.infer<typeof DomSnapshotSchema>;
export type Form = z.infer<typeof FormSchema>;