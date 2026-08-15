import type { Dataset, HealthStatus } from "@/lib/types";
import { cx } from "./ui";

const HEALTH_STYLE: Record<HealthStatus, { dot: string; text: string; ring: string }> = {
  healthy: { dot: "bg-ok", text: "text-ok", ring: "border-ok-line bg-ok-dim" },
  degraded: { dot: "bg-warn", text: "text-warn", ring: "border-warn-line bg-warn-dim" },
  stale: { dot: "bg-stale", text: "text-stale", ring: "border-stale-line bg-stale-dim" },
  failing: { dot: "bg-fail", text: "text-fail", ring: "border-fail-line bg-fail-dim" },
};

const HEALTH_LABEL: Record<HealthStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  stale: "Stale",
  failing: "Failing",
};

/**
 * Health, or the honest absence of it.
 *
 * A dataset that has never run gets "Collector in development" — not a grey
 * pill pretending to be a status. There is no code path here that renders a
 * green badge for something nobody has measured.
 */
export function StatusBadge({
  dataset,
  size = "md",
}: {
  dataset: Dataset;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-2 py-[3px] text-[11px]" : "px-2.5 py-1 text-[12px]";

  if (dataset.status === "pending" || !dataset.telemetry.health) {
    return (
      <span
        className={cx(
          "inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong bg-surface-2 font-medium text-muted",
          pad,
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
        Collector in development
      </span>
    );
  }

  const s = HEALTH_STYLE[dataset.telemetry.health];
  return (
    <span
      className={cx("inline-flex items-center gap-1.5 rounded-full border font-medium", s.ring, s.text, pad)}
    >
      <span className={cx("dr-pulse h-1.5 w-1.5 rounded-full", s.dot)} />
      {HEALTH_LABEL[dataset.telemetry.health]}
    </span>
  );
}
