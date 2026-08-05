// app/dashboard/page.tsx
import Link from "next/link";
import { ArrowRight, Info, Terminal } from "lucide-react";
import { UrlForm } from "@/components/testpilot/url-form";
import { Button } from "@/components/ui/button";
import {
  isLiveExecutionAvailable,
  GENERATION_UNAVAILABLE_MESSAGE,
} from "@/lib/execution-availability";

export default function DashboardPage() {
  // Generation starts by scraping the target page with a real browser, so it
  // needs the same runtime live execution does.
  const canGenerate = isLiveExecutionAvailable();

  return (
    <div className="flex flex-col items-center gap-8 py-16">
      <div className="max-w-lg text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Generate Playwright tests
        </h1>
        <p className="text-muted-foreground mt-2">
          Paste any public URL. TestPilot scrapes the page, generates a full
          test suite, and lets you run it live — accessibility audit included.
        </p>
      </div>

      {canGenerate ? (
        <UrlForm />
      ) : (
        <div className="flex w-full max-w-xl flex-col gap-4 rounded-xl border bg-card p-5">
          <div className="flex items-start gap-2.5">
            <Info className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-muted-foreground text-sm">
              {GENERATION_UNAVAILABLE_MESSAGE}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/sample">
                View the sample run
                <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a
                href="https://github.com/adilet0212/testpilot"
                target="_blank"
                rel="noreferrer"
              >
                <Terminal className="mr-2 h-3.5 w-3.5" />
                Run it locally
              </a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
