// lib/highlight.ts

import { createHighlighter, type Highlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

// Shiki's highlighter is expensive to create, so keep one instance per server
// process. The promise is cached, not the result, so concurrent first-calls
// share the same initialization.
//
// Explicitly using the JS regex engine instead of the default oniguruma one —
// oniguruma loads a .wasm binary at runtime, which Vercel's serverless file
// tracer can silently fail to bundle (it only follows statically-analyzable
// requires, not a package's own dynamic asset loading). That produced an
// opaque "Server Components render" crash in production while working fine
// locally. The JS engine has zero binary dependencies, at the cost of a bit
// of performance we don't need for one short snippet at a time.
let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: ["github-light"],
    langs: ["typescript"],
    engine: createJavaScriptRegexEngine(),
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
