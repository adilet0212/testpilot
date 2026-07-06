// lib/highlight.ts

import { createHighlighter, type Highlighter } from "shiki";

// Shiki's highlighter is expensive to create (loads WASM + grammars), so keep
// one instance per server process. The promise is cached, not the result, so
// concurrent first-calls share the same initialization.
let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: ["github-light"],
    langs: ["typescript"],
  });
  return highlighterPromise;
}

/** Server-side TypeScript syntax highlighting (single light theme — no dark mode). */
export async function highlightTypeScript(code: string): Promise<string> {
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(code, {
    lang: "typescript",
    theme: "github-light",
  });
}
