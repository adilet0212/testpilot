// app/dashboard/page.tsx
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  const { userId } = await auth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="font-semibold">TestPilot</span>
        <UserButton />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">User ID: {userId}</p>
        <p className="text-muted-foreground text-sm">
          Paste a URL here to generate tests — coming soon.
        </p>
      </main>
    </div>
  );
}