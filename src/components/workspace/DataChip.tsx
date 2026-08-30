"use client";

import { cx } from "@/components/ui";
import { tokenLabel, type Availability, type DataRef } from "@/lib/workspace/catalog";

/**
 * How data looks wherever it is shown.
 *
 * One component for both ends of the loop — the explorer's results and the
 * build box's attachments — because the two have to be recognisably the same
 * object. You click a chip on the left and the identical chip appears on the
 * right; nothing is translated into a line of code on the way across.
 *
 * Three facts ride on every chip and none of them are optional: where the data
 * sits in the tree, whether it is real, and what a query costs. The badge is
 * never omitted for space. An unlabelled mock is the one failure mode this
 * whole feature has, so mock also gets a dashed border — legible before the
 * text is read, and still legible to someone who cannot separate the two hues.
 */

const TONE: Record<Availability, string> = {
  live: "border-accent-line bg-accent-dim text-accent",
  mock: "border-info-line bg-info-dim text-info border-dashed",
};

export function AvailabilityBadge({
  availability,
  className,
}: {
  availability: Availability;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-px font-mono text-[9px] tracking-[0.1em] uppercase",
        TONE[availability],
        className,
      )}
    >
      <span
        className={cx(
          "h-1 w-1 rounded-full",
          availability === "live" ? "dr-pulse bg-accent" : "bg-info",
        )}
      />
      {availability}
    </span>
  );
}

/** Cadence and price — the two things you want before you wire something up. */
export function RefMeta({ refr, className }: { refr: DataRef; className?: string }) {
  return (
    <span className={cx("font-mono text-[9.5px] text-faint", className)}>
      {refr.cadence} · {tokenLabel(refr.tokens)}/query
    </span>
  );
}

/**
 * The same two facts as chips, for the explorer's cards.
 *
 * Live stopped being worth a badge the day the whole catalogue became live —
 * a label that is true of everything says nothing. What varies between
 * streams, and what someone weighs before wiring one up, is how often it
 * ticks and what a query costs; those are the chips now. Mock keeps its badge
 * unconditionally — an unlabelled mock is still the one unforgivable state.
 */
export function MetaBadges({ cadence, tokens }: { cadence: string; tokens: number }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="inline-flex shrink-0 items-center rounded-sm border border-line bg-surface px-1.5 py-px font-mono text-[9px] text-muted">
        {cadence}
      </span>
      <span className="inline-flex shrink-0 items-center rounded-sm border border-line-strong bg-surface px-1.5 py-px font-mono text-[9px] text-ink">
        {tokenLabel(tokens)}
      </span>
    </span>
  );
}

/**
 * One box in the explorer. Clicking it selects the reference for a change.
 *
 * Selection is shown with a filled ground and a tick rather than only a border
 * colour, because the unselected states already use border colour to carry
 * live-versus-mock, and stacking two meanings on one channel makes both
 * unreadable at this size.
 */
export function DataChip({
  refr,
  selected,
  onClick,
}: {
  refr: DataRef;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      title={`${refr.path} — ${refr.snippet}`}
      className={cx(
        "group flex w-full flex-col gap-0.5 rounded border px-2 py-1.5 text-left transition-colors",
        selected
          ? "border-accent-line bg-accent-dim"
          : refr.availability === "live"
            ? "border-line bg-surface-2 hover:border-accent-line"
            : "border-dashed border-line bg-surface-2 hover:border-info-line",
      )}
    >
      <span className="flex items-center gap-1.5">
        {selected && <span className="shrink-0 text-[10px] text-accent">✓</span>}
        <span
          className={cx(
            "truncate font-mono text-[11px]",
            selected ? "text-accent" : "text-ink",
          )}
        >
          {refr.label}
        </span>
        {refr.availability === "mock" && (
          <AvailabilityBadge availability="mock" className="ml-auto" />
        )}
      </span>
      {/* No path line: the card sits under a group header that already says
          it, and a fact printed twice at this size is just a taller card. */}
      {refr.sublabel && (
        <span className="truncate font-mono text-[9.5px] text-faint">{refr.sublabel}</span>
      )}
      <MetaBadges cadence={refr.cadence} tokens={refr.tokens} />
    </button>
  );
}

/**
 * An attached reference in the build box.
 *
 * The whole reason this is a chip and not the query text it replaced: the
 * request stays a sentence a person wrote, and the data it touches sits beside
 * it as an object with a price on it, removable without editing prose.
 */
export function AttachedChip({
  refr,
  onRemove,
}: {
  refr: DataRef;
  /** Omitted where the chip is a record rather than a control. */
  onRemove?: () => void;
}) {
  return (
    <span
      title={refr.path}
      className={cx(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border py-1 pl-2",
        onRemove ? "pr-1" : "pr-2",
        refr.availability === "live"
          ? "border-line bg-surface-2"
          : "border-dashed border-info-line bg-surface-2",
      )}
    >
      {/*
        Two lines, not four. The explorer beside this already spells out the full
        path; here the chip is a receipt, and the request it belongs to has to
        stay visible above it. The path moves to the tooltip.
      */}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-mono text-[11px] text-ink">{refr.label}</span>
          {refr.availability === "mock" && <AvailabilityBadge availability="mock" />}
        </span>
        <RefMeta refr={refr} />
      </span>
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${refr.label}`}
          className="ml-1 shrink-0 self-start rounded px-1 font-mono text-[11px] text-faint hover:text-fail"
        >
          ×
        </button>
      )}
    </span>
  );
}
