import { cx } from "./ui";

/**
 * The shape of what is coming, while it is coming.
 *
 * A skeleton beats a spinner for one reason: it commits to a layout. The page
 * does not jump when the data lands, because the blocks were already the right
 * size in the right places — the only thing that changes is that they stop
 * being blocks. A centred animation tells you to wait; this tells you what you
 * are waiting for.
 *
 * Deliberately dumb: no shimmer sweep, no staggered reveal. Skeletons that
 * perform are skeletons you notice, and the whole point is that nobody should.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded bg-surface-2", className)} />;
}

/** A tile with a picture and two lines under it — the shape of every card here. */
export function CardSkeleton({ ratio = "aspect-[16/10]" }: { ratio?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className={cx("border-b border-line bg-code", ratio)}>
        <Skeleton className="h-full w-full rounded-none opacity-40" />
      </div>
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-[13px] w-1/2" />
          <Skeleton className="mt-2 h-[9px] w-1/3" />
        </div>
        <Skeleton className="h-6 w-11 shrink-0" />
      </div>
    </div>
  );
}

export function CardGridSkeleton({
  count = 6,
  ratio,
}: {
  count?: number;
  ratio?: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} ratio={ratio} />
      ))}
    </div>
  );
}

/** A running screen, before it is running: the canvas and the panel beside it. */
export function ScreenSkeleton({ withPanel = false }: { withPanel?: boolean }) {
  return (
    <div
      className={cx(
        "grid h-[calc(100vh-var(--nav-h))] gap-4",
        withPanel ? "mx-auto max-w-[1560px] px-6 py-5 lg:grid-cols-[1fr_420px]" : "",
      )}
    >
      <div className={cx("bg-code", withPanel ? "rounded-lg border border-line" : "")}>
        {/* The twelve-column grid a page is arranged on, at rest. */}
        <div className="grid h-full grid-cols-12 content-start gap-3 p-3">
          <Skeleton className="col-span-8 h-[240px]" />
          <Skeleton className="col-span-4 h-[240px]" />
          <Skeleton className="col-span-5 h-[180px]" />
          <Skeleton className="col-span-7 h-[180px]" />
        </div>
      </div>

      {withPanel && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="min-h-0 flex-1" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
    </div>
  );
}
