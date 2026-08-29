import { cx } from "./ui";

/**
 * The wordmark: the word, set heavy and tight.
 *
 * Everything about it lives in `.dryos-mark` (globals.css) and is sized in `em`,
 * so one class serves the chrome and any larger surface without a second
 * definition drifting away from it.
 */
export const BRAND = "#C4703A";

export function Wordmark({
  size = 17,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={cx("dryos-mark", className)} style={{ fontSize: size }}>
      dryos
    </span>
  );
}

/** Kept for callers that want the mark on its own terms. */
export function Logo({ size = 26 }: { size?: number }) {
  return <Wordmark size={size} />;
}
