// app/dashboard/runs/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function RunHistoryLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="flex flex-col gap-px overflow-hidden rounded-xl border">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-13 rounded-none" />
        ))}
      </div>
    </div>
  );
}
