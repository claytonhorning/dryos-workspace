"use client";

import { useState } from "react";
import type {
  DatasetPreview,
  PreviewInterval,
} from "@/lib/types";
import { DISPLAY_TZ_LABEL, clock } from "@/lib/time";
import { cx } from "./ui";

/**
 * The per-interval delivery graph the Feeds pane audits a screen with. It
 * lived on the dataset landing pages first; the pane kept it when they went,
 * because "did every expected interval arrive" is the pane's whole question.
 */

type CellState = "onTime" | "late" | "missing";

/*
 * Traffic-light, deliberately outside the site's tokens: the ok chartreuse is
 * the brand's healthy signal, but a delivery record is read as a status board,
 * and green/yellow/red is the one encoding nobody has to learn. Fixed across
 * both themes so a cell means the same thing wherever it is seen.
 */
const CELL_CLASS: Record<CellState, string> = {
  onTime: "bg-emerald-500",
  late: "bg-amber-400",
  missing: "bg-red-500",
};

function cellState(
  interval: PreviewInterval | undefined,
  slaSeconds: number,
): CellState {
  if (!interval) return "missing";
  if (interval.collectLagSeconds === null) return "onTime";
  return interval.collectLagSeconds <= slaSeconds
    ? "onTime"
    : "late";
}

interface CellHover {
  t: number;
  x: number;
  top: number;
  bottom: number;
}

/**
 * One cell per interval the schedule says should exist.
 *
 * Slots come from the declared cadence, not from the rows, so a gap renders as
 * an absent cell instead of silently closing up. A graph drawn only from what
 * arrived cannot show what did not.
 */
export function CollectionGraph({
  preview,
}: {
  preview: DatasetPreview;
}) {
  const [hover, setHover] = useState<CellHover | null>(
    null,
  );
  const byTime = new Map(
    preview.intervals.map((i) => [Date.parse(i.t), i]),
  );
  const times = [...byTime.keys()].sort((a, b) => a - b);
  const cadence = preview.cadenceSeconds;

  let slots: number[];
  if (cadence && times.length) {
    const step = cadence * 1000;
    const n = Math.min(
      Math.floor(
        (times[times.length - 1] - times[0]) / step,
      ) + 1,
      600,
    );
    slots = Array.from(
      { length: n },
      (_, i) => times[0] + i * step,
    );
  } else {
    slots = times;
  }

  const cells = slots.map((t) => {
    const match =
      byTime.get(t) ??
      preview.intervals.find(
        (i) => Math.abs(Date.parse(i.t) - t) < 90_000,
      );
    return {
      t,
      state: cellState(match, preview.freshnessSlaSeconds),
      interval: match,
    };
  });

  const onTime = cells.filter(
    (c) => c.state === "onTime",
  ).length;
  const late = cells.filter(
    (c) => c.state === "late",
  ).length;
  const missing = cells.filter(
    (c) => c.state === "missing",
  ).length;

  /*
    Ours, not the browser's — the same idiom as the heatmap component's cell
    readout. title= waits about a second before it appears, draws in the OS's
    colors, and can only say one flat line.

    Delegated to the grid and updated only when the cell under the pointer
    changes, so 600 cells do not re-render at pointer rate. Anchored to the
    cell rather than trailing the cursor.
  */
  const track = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest?.(
      "[data-cell]",
    ) as HTMLElement | null;
    if (!el)
      return setHover((prev) => (prev ? null : prev));
    const t = Number(el.dataset.cell);
    setHover((prev) => {
      if (prev && prev.t === t) return prev;
      const r = el.getBoundingClientRect();
      return {
        t,
        x: r.left + r.width / 2,
        top: r.top,
        bottom: r.bottom,
      };
    });
  };

  const hc = hover
    ? cells.find((c) => c.t === hover.t)
    : null;

  return (
    <div>
      {/*
        The collector writes while the page renders, so the HTML pass and the
        RSC payload can legitimately differ by one interval. The client's value
        is the newer and correct one, and it repaints on the next poll anyway —
        this is the "external changing data" case React's warning describes.
      */}
      <div
        className="flex flex-wrap gap-[3px]"
        suppressHydrationWarning
        onMouseMove={track}
        onMouseLeave={() => setHover(null)}
      >
        {cells.map((c) => (
          <span
            key={c.t}
            data-cell={c.t}
            className={cx(
              "h-3.5 w-3.5 cursor-crosshair rounded-[3px]",
              CELL_CLASS[c.state],
            )}
            // A ring, not a border: a border would resize the cell under the
            // pointer and walk the whole grid out from under it.
            style={
              hover?.t === c.t
                ? {
                    boxShadow:
                      "0 0 0 1.5px var(--color-ink)",
                  }
                : undefined
            }
          />
        ))}
      </div>
      {hover && hc && (
        <div
          className="pointer-events-none fixed top-0 left-0 z-60 max-w-[220px] rounded-md border border-line-strong bg-surface-2 px-2.5 py-1.5 shadow-[0_6px_20px_rgba(0,0,0,.45)]"
          style={{
            // Placed by transform from the viewport's origin, never by
            // left/top: a fixed box positioned near the right edge is
            // shrink-wrapped into whatever space is left there. Centred on
            // the cell, clamped to half the capped width; above the cell
            // where there is room, below where there is not.
            transform:
              `translate(${Math.min(Math.max(hover.x, 110), Math.max(110, window.innerWidth - 110))}px, ` +
              `${hover.top > 96 ? hover.top - 6 : hover.bottom + 6}px) ` +
              `translate(-50%, ${hover.top > 96 ? "-100%" : "0"})`,
          }}
        >
          <div className="font-mono text-[10px] tracking-[0.08em] whitespace-nowrap text-faint">
            {clock(hc.t)}
            {cadence
              ? ` – ${clock(hc.t + cadence * 1000)}`
              : ""}{" "}
            {DISPLAY_TZ_LABEL}
          </div>
          <div
            className={cx(
              "text-[13px] font-semibold",
              // The cell's traffic-light hue, stepped per theme only as far as
              // text contrast demands — the fills stay one value everywhere.
              hc.state === "onTime" &&
                "text-emerald-400 dr-when-light:text-emerald-700",
              hc.state === "late" &&
                "text-amber-400 dr-when-light:text-amber-600",
              hc.state === "missing" &&
                "text-red-400 dr-when-light:text-red-600",
            )}
          >
            {hc.state === "onTime"
              ? "on time"
              : hc.state === "late"
                ? "late"
                : "missing"}
          </div>
          <div className="font-mono text-[10px] whitespace-nowrap text-faint">
            {hc.interval
              ? `posted +${fmt(hc.interval.postLagSeconds)} · collected +${fmt(hc.interval.collectLagSeconds)}`
              : "no data collected for this interval"}
          </div>
        </div>
      )}
      <p className="mt-3 text-[12px] text-muted">
        {onTime} on time
        {late > 0 && <> · {late} late</>}
        {missing > 0 && <> · {missing} missing</>} · one
        cell per expected interval, against a{" "}
        {Math.round(preview.freshnessSlaSeconds / 60)}
        -minute freshness SLA.
      </p>
    </div>
  );
}

function fmt(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
