"use client";

import { useEffect, useState } from "react";
import { AvailabilityBadge } from "@/components/workspace/DataChip";
import { cx } from "@/components/ui";
import {
  creditLabel,
  DRY_USD,
  tokenLabel,
  usdLabel,
} from "@/lib/workspace/catalog";
import type { UsageSummary, WindowUsage } from "@/lib/workspace/meter";

/**
 * What this workspace is costing, down in the corner.
 *
 * It sits over the screen rather than in the bar because it belongs to the
 * workspace, not to the product — and because a page runs edge to edge, so
 * anything about the page has to live on it.
 *
 * It grows **in place** rather than opening a dialog in the middle of the
 * screen. The number you clicked stays where you left it, the detail unfolds
 * from it, and an `×` puts it back — a centred modal for a corner readout throws
 * the whole page away to answer a small question.
 *
 * Counted, never projected. Every figure here is a reading of the ledger the
 * data route writes on the way past.
 */
const WINDOWS = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
] as const;

type WindowId = (typeof WINDOWS)[number]["id"];

export function UsageDock({
  spaceId,
  name,
}: {
  spaceId: string;
  name?: string;
}) {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [window_, setWindow] = useState<WindowId>("today");

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`/api/workspace/usage?space=${encodeURIComponent(spaceId)}`)
        .then((r) => r.json())
        .then((d) => live && setUsage(d))
        .catch(() => {});
    load();
    // Slow enough to be free, quick enough that a query you just made shows up.
    const t = setInterval(load, 15_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [spaceId, open]);

  if (!usage) return null;
  const w: WindowUsage = usage[window_];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="What this workspace is costing"
        className="fixed right-4 bottom-4 z-30 inline-flex items-center gap-2 rounded-full border border-line bg-surface/90 px-3 py-1.5 font-mono text-[10.5px] shadow-lg shadow-black/30 backdrop-blur transition-colors hover:border-line-strong"
      >
        <span className="text-faint">
          {usage.today.queries.toLocaleString()} call
          {usage.today.queries === 1 ? "" : "s"}
        </span>
        <span className="text-line-strong">·</span>
        {/*
          Spelled out, not "DRY". Collapsed, this is the only number on the
          screen and nothing beside it says what it counts — unlike a chip in
          the explorer, where the reader is already pricing a query.
        */}
        <span className="text-accent">
          {creditLabel(round(usage.today.tokens))}
        </span>
        <span className="text-faint">today</span>
      </button>
    );
  }

  return (
    <div className="dr-rise fixed right-4 bottom-4 z-30 flex max-h-[70vh] w-[360px] flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/50">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span className="truncate text-[13px] font-medium text-ink">
          {name ? `${name} · usage` : "Usage"}
        </span>
        <button
          onClick={() => setOpen(false)}
          aria-label="Collapse"
          title="Collapse"
          className="ml-auto rounded p-1 font-mono text-[12px] leading-none text-faint transition-colors hover:text-ink"
        >
          ✕
        </button>
      </div>

      <div className="flex gap-1 border-b border-line px-2 py-1.5">
        {WINDOWS.map((x) => (
          <button
            key={x.id}
            onClick={() => setWindow(x.id)}
            className={cx(
              "flex-1 rounded px-2 py-1 text-[11.5px] transition-colors",
              window_ === x.id
                ? "bg-surface-3 text-ink"
                : "text-muted hover:text-ink",
            )}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-line bg-line">
        <Figure
          label="Spent"
          value={usdLabel(w.tokens * DRY_USD)}
          sub={tokenLabel(round(w.tokens))}
          accent
        />
        <Figure
          label="Calls"
          value={w.queries.toLocaleString()}
          sub={`${w.billable.toLocaleString()} billable`}
        />
      </div>

      <div className="dr-scroll min-h-0 flex-1 overflow-y-auto">
        {w.bySchema.length === 0 ? (
          <p className="px-3 py-4 text-[12.5px] leading-relaxed text-faint">
            Nothing served in this window.
          </p>
        ) : (
          w.bySchema.map((r) => (
            <div
              key={r.schemaId}
              className="border-b border-line px-3 py-2 last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className="truncate text-[12.5px] text-ink">
                  {r.path}
                </span>
                <AvailabilityBadge availability={r.availability} />
                <span
                  className={cx(
                    "ml-auto shrink-0 font-mono text-[11.5px] tabular-nums",
                    r.tokens > 0 ? "text-accent" : "text-faint",
                  )}
                >
                  {r.tokens > 0 ? usdLabel(r.tokens * DRY_USD) : "free"}
                </span>
              </div>
              <div className="mt-0.5 flex gap-2 font-mono text-[9.5px] text-faint">
                <span>{r.queries.toLocaleString()} calls</span>
                <span className="text-line-strong">·</span>
                <span>{r.rows.toLocaleString()} rows</span>
                {r.tokens > 0 && (
                  <span className="ml-auto text-muted">
                    {tokenLabel(round(r.tokens))}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <p className="border-t border-line px-3 py-1.5 font-mono text-[9px] text-faint">
        {usage.ranges[window_]} · counted at the route, not estimated
      </p>
    </div>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;

function Figure({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="font-mono text-[9px] tracking-[0.13em] text-faint uppercase">
        {label}
      </div>
      <div
        className={cx(
          "mt-1 font-mono text-[20px] tabular-nums",
          accent ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 font-mono text-[10px] text-muted">{sub}</div>
    </div>
  );
}
