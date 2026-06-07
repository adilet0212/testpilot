// app/dashboard/page.tsx
import { UserButton } from "@clerk/nextjs";
import { UrlForm } from "@/components/testpilot/url-form";

export default async function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="font-semibold">TestPilot</span>
        <UserButton />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Generate Playwright Tests</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Paste any public URL to generate a ready-to-run test suite.
          </p>
        </div>
        <UrlForm />
      </main>
    </div>
  );
}