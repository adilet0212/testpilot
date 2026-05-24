// app/page.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const { userId } = await auth();

  if (userId) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-bold tracking-tight">TestPilot 🚀</h1>
      <p className="text-muted-foreground max-w-md text-center">
        Paste a URL. Get a production-ready Playwright test suite in under 60 seconds.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/sign-up">Get Started</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/sign-in">Sign In</Link>
        </Button>
      </div>
    </main>
  );
}