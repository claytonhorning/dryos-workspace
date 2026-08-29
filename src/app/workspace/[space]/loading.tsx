import { CardGridSkeleton } from "@/components/Skeleton";

/**
 * Shown while the server works out what this segment is.
 *
 * `/workspace/{space}` resolves the workspace and, for an old-shaped link, may
 * forward to a page — both of which happen before any client code runs. Without
 * this the browser sits on the previous screen with nothing to say it heard the
 * click, which reads as a dead link rather than as a wait.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1240px] px-6 py-10">
      <div className="h-[13px] w-24 animate-pulse rounded bg-surface-2" />
      <div className="mt-3 h-8 w-64 animate-pulse rounded bg-surface-2" />
      <div className="mt-8">
        <CardGridSkeleton count={6} />
      </div>
    </div>
  );
}
