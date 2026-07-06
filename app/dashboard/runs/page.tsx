// app/dashboard/runs/page.tsx
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ArrowRight, History, Sparkles } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { RUN_STATUS_VARIANT } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Run History" };

export default async function RunHistoryPage() {
  const { userId } = await auth();
  if (!userId) return null; // proxy.ts already gates /dashboard — belt and suspenders

  const runs = await prisma.testRun.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      targetUrl: true,
      status: true,
      createdAt: true,
      completedAt: true,
    },
    take: 50,
  });

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-xl">
          <History className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">No runs yet</h1>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            Generate your first test suite and it will show up here with its
            full results history.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard">
            <Sparkles className="mr-2 h-4 w-4" />
            New run
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Run History</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Your {runs.length} most recent test generation run
            {runs.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard">
            <Sparkles className="mr-2 h-4 w-4" />
            New run
          </Link>
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Target URL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Created</TableHead>
              <TableHead className="hidden md:table-cell">Duration</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => {
              const duration =
                run.completedAt &&
                ((run.completedAt.getTime() - run.createdAt.getTime()) / 1000).toFixed(0);
              return (
                <TableRow key={run.id} className="group">
                  <TableCell className="max-w-60 truncate font-medium">
                    <Link
                      href={`/dashboard/runs/${run.id}`}
                      className="hover:underline"
                    >
                      {run.targetUrl}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={RUN_STATUS_VARIANT[run.status] ?? "secondary"}>
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
                    {run.createdAt.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden font-mono text-sm md:table-cell">
                    {duration ? `${duration}s` : "—"}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/dashboard/runs/${run.id}`}
                      aria-label={`Open run for ${run.targetUrl}`}
                    >
                      <ArrowRight className="text-muted-foreground group-hover:text-foreground h-4 w-4 transition-colors" />
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
