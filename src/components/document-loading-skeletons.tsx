import { Skeleton } from "@heroui/react";

export function DashboardDocumentCardSkeleton() {
  return (
    <div className="shadow-panel w-full space-y-5 rounded-lg bg-transparent p-4" aria-hidden="true">
      <Skeleton className="h-32 rounded-lg" />
      <div className="space-y-3">
        <Skeleton className="h-3 w-3/5 rounded-lg" />
        <Skeleton className="h-3 w-4/5 rounded-lg" />
        <Skeleton className="h-3 w-2/5 rounded-lg" />
      </div>
    </div>
  );
}

export function DashboardDocumentSkeletons({ count = 3 }: { count?: number }) {
  return <>{Array.from({ length: count }, (_, index) => <DashboardDocumentCardSkeleton key={index} />)}</>;
}

export function DocumentTextSkeleton() {
  return (
    <div className="min-h-[520px] w-full max-w-md space-y-3 pt-5" aria-busy="true" aria-label="Loading document content">
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-5/6 rounded" />
      <Skeleton className="h-4 w-4/6 rounded" />
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-3/6 rounded" />
    </div>
  );
}

export function DocumentImageSkeleton() {
  return (
    <div className="skeleton--shimmer relative grid w-full max-w-xl grid-cols-3 gap-4 overflow-hidden rounded-xl" aria-busy="true" aria-label="Loading image">
      <Skeleton animationType="none" className="h-24 rounded-xl" />
    </div>
  );
}
