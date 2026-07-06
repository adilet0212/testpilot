// app/dashboard/page.tsx
import { UrlForm } from "@/components/testpilot/url-form";

export default function DashboardPage() {
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
      <UrlForm />
    </div>
  );
}
