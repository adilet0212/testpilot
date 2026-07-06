// app/page.tsx
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  Accessibility,
  ArrowRight,
  Download,
  FileCode2,
  Play,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { highlightTypeScript } from "@/lib/highlight";

const HERO_SNIPPET = `test('search returns relevant results', async ({ page }) => {
  await page.goto('https://your-site.com');
  await page.locator("[placeholder='Search']").fill('pricing');
  await page.keyboard.press('Enter');
  await expect(page.locator('h1')).toContainText('Results');
});`;

const steps = [
  {
    icon: ScanSearch,
    title: "Scrape",
    text: "Playwright loads your page and maps every interactive element, form, and heading.",
  },
  {
    icon: Sparkles,
    title: "Generate",
    text: "An LLM turns the DOM snapshot into structured test specs, validated against a strict Zod schema.",
  },
  {
    icon: Play,
    title: "Run",
    text: "Watch tests execute live in a real browser — pass/fail streams in with screenshots on failure.",
  },
  {
    icon: Download,
    title: "Ship",
    text: "Download the ready-to-run .spec.ts suite with its Playwright config and drop it into your repo.",
  },
];

const features = [
  {
    icon: Accessibility,
    title: "Accessibility built in",
    text: "Every execution includes an axe-core WCAG 2.1 audit — violations tagged by severity, next to your functional results.",
  },
  {
    icon: Zap,
    title: "Live streamed execution",
    text: "Results arrive test-by-test over a live stream, not after the whole suite finishes.",
  },
  {
    icon: FileCode2,
    title: "Real, readable code",
    text: "Not a black box: the output is idiomatic Playwright TypeScript you can read, edit, and own.",
  },
  {
    icon: ShieldCheck,
    title: "Validated, not hallucinated",
    text: "LLM output is parsed against a strict schema with automatic retry — malformed specs never reach you.",
  },
];

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  const heroHtml = await highlightTypeScript(HERO_SNIPPET);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              T
            </span>
            TestPilot
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/sign-up">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,--alpha(var(--color-primary)/14%),transparent)]"
          />
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-2 md:items-center md:py-28">
            <div className="flex flex-col items-start gap-5">
              <Badge variant="secondary" className="gap-1.5">
                <Sparkles className="h-3 w-3" />
                AI-generated Playwright suites
              </Badge>
              <h1 className="text-4xl font-bold tracking-tight text-balance md:text-5xl">
                Paste a URL.
                <br />
                Get a test suite.
              </h1>
              <p className="text-muted-foreground max-w-md text-lg text-pretty">
                TestPilot scrapes any public page, generates a production-ready
                Playwright suite, runs it live in a real browser, and audits
                accessibility — all in under a minute.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <Button size="lg" asChild>
                  <Link href="/sign-up">
                    Get started free
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/sample">View live sample — no sign-up</Link>
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-card shadow-lg">
              <div className="flex items-center gap-1.5 border-b px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
                <span className="text-muted-foreground ml-2 font-mono text-xs">
                  your-site.spec.ts — generated by TestPilot
                </span>
              </div>
              <div
                className="p-4 [&_pre]:!bg-transparent"
                // Server-rendered by shiki from a fixed snippet — no user input involved.
                dangerouslySetInnerHTML={{ __html: heroHtml }}
              />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <h2 className="text-center text-2xl font-bold tracking-tight md:text-3xl">
              URL in, test suite out
            </h2>
            <p className="text-muted-foreground mx-auto mt-2 max-w-lg text-center">
              Four steps, fully automated. You only bring the URL.
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, i) => (
                <div key={step.title} className="rounded-xl border bg-card p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <step.icon className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-muted-foreground font-mono text-xs">
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 font-semibold">{step.title}</h3>
                  <p className="text-muted-foreground mt-1.5 text-sm">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section>
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
            <div className="grid gap-6 md:grid-cols-2">
              {features.map((feature) => (
                <div key={feature.title} className="flex gap-4 rounded-xl border p-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <feature.icon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{feature.title}</h3>
                    <p className="text-muted-foreground mt-1 text-sm">{feature.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="border-t">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-16 text-center md:py-20">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
              Your first suite is 60 seconds away
            </h2>
            <p className="text-muted-foreground max-w-md">
              Free to use. No config, no boilerplate — just paste a URL and watch it run.
            </p>
            <div className="flex gap-3 pt-2">
              <Button size="lg" asChild>
                <Link href="/sign-up">Get started</Link>
              </Button>
              <Button size="lg" variant="ghost" asChild>
                <Link href="/sample">
                  See it in action
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm">
          <span>TestPilot — AI-powered Playwright test generation</span>
          <a
            href="https://github.com/adilet0212/testpilot"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
