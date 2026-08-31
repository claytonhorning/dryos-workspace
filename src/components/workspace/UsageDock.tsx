"use client";

import { useEffect, useRef, useState } from "react";
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
 * What this workspace is costing.
 *
 * Two placements, one component. **In the navbar** (`nav`) it is a number in
 * the chrome, at the top right beside the account — which is where a running
 * total belongs when the thing under it runs edge to edge: floating over the
 * canvas, it was one more object on a screen whose whole point is that it
 * carries nothing but the dashboard. **Floating** (`dock`) is the older
 * bottom-left readout, still used where there is no workspace bar to sit in.
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
  placement = "dock",
}: {
  spaceId: string;
  name?: string;
  /** `nav` sits inline in the workspace bar; `dock` floats bottom-left. */
  placement?: "nav" | "dock";
}) {
  const inNav = placement === "nav";
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [window_, setWindow] = useState<WindowId>("today");
  const wrap = useRef<HTMLDivElement>(null);

  /*
    A menu hanging off the bar closes the way every other one there does —
    click away, or Escape. The floating dock keeps its ✕ and nothing else: it
    sits on the canvas, where a click outside is somebody arranging tiles.
  */
  useEffect(() => {
    if (!inNav || !open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [inNav, open]);

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

  const panel = (
    <UsagePanel
      usage={usage}
      w={w}
      name={name}
      window_={window_}
      setWindow={setWindow}
      onClose={() => setOpen(false)}
    />
  );

  const trigger = (
    <button
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      title="What this workspace is costing"
      className={cx(
        "inline-flex items-center gap-2 rounded-full border font-mono text-[10.5px] transition-colors hover:border-line-strong",
        inNav
          ? // In the bar it is chrome, not an object on the page: no shadow,
            // no blur, the same height as everything else in the row.
            open
            ? "border-accent-line bg-accent-dim"
            : "border-line"
          : "fixed bottom-4 left-4 z-30 border-line bg-surface/90 shadow-lg shadow-black/30 backdrop-blur",
        inNav ? "px-2.5 py-1" : "px-3 py-1.5",
      )}
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

  /*
    In the bar it behaves like the account menu next to it: the number stays
    where it is and the detail hangs from it. Anchored to the button rather than
    to the corner of the window — pinned to the corner, the panel drifted away
    from the thing that was clicked as soon as the bar's right-hand cluster
    changed width.

    Floating, it still grows *in place*: the pill becomes the panel. Two
    placements, two idioms, because a readout on the canvas and a control in the
    chrome are not the same object.
  */
  if (inNav) {
    return (
      <div ref={wrap} className="relative">
        {trigger}
        {open && (
          <div className="dr-rise absolute top-full right-0 z-30 mt-1.5 flex max-h-[70vh] w-[360px] flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/50">
            {panel}
          </div>
        )}
      </div>
    );
  }

  return open ? (
    <div className="dr-rise fixed bottom-4 left-4 z-30 flex max-h-[70vh] w-[360px] flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/50">
      {panel}
    </div>
  ) : (
    trigger
  );
}

/** The panel's contents, the same wherever it is hung. */
function UsagePanel({
  usage,
  w,
  name,
  window_,
  setWindow,
  onClose,
}: {
  usage: UsageSummary;
  w: WindowUsage;
  name?: string;
  window_: WindowId;
  setWindow: (id: WindowId) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span className="truncate text-[13px] font-medium text-ink">
          {name ? `${name} · usage` : "Usage"}
        </span>
        <button
          onClick={onClose}
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
    </>
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
