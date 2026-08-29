import { ScreenSkeleton } from "@/components/Skeleton";

/**
 * The page's shape, while the route resolves.
 *
 * Laid out edge to edge, the way a launched page is — most arrivals here are a
 * launch, and a skeleton that guesses wrong moves everything once the real thing
 * lands, which is the one job it exists to prevent.
 */
export default function Loading() {
  return <ScreenSkeleton />;
}
