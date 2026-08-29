"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { AvailabilityBadge } from "@/components/workspace/DataChip";
import { tokenLabel, usdLabel, DRY_USD } from "@/lib/workspace/catalog";
import type { UsageSummary, WindowUsage } from "@/lib/workspace/meter";

/**
 * What this screen has actually cost.
 *
 * Counted, not projected. Every query a screen makes is stamped with its id at
 * the host — never inside the frame, where an untrusted app could bill another
 * screen — so this is a reading of the same ledger `/usage` reports from,
 * narrowed to one screen.
 *
 * Three windows because three questions get asked: what is it doing right now,
 * is this week normal, and what will the invoice say. Nothing here is a forecast;
 * a number that turns out to be wrong is worse than no number when the subject
 * is money.
 *
 * Credits and dollars together — a credit is what the product meters in, a
 * dollar is what a budget is approved in, and giving one without the other
 * leaves the reader doing arithmetic.
 */
const WINDOWS = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
] as const;

type WindowId = (typeof WINDOWS)[number]["id"];

export function CostPanel({ appId }: { appId: string }) {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [window, setWindow] = useState<WindowId>("today");

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`/api/workspace/usage?app=${encodeURIComponent(appId)}`)
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
  }, [appId]);

  const w: WindowUsage | undefined = usage?.[window];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
          Cost
        </span>
        <span className="ml-auto font-mono text-[9.5px] text-faint">
          {usage ? usage.ranges[window] : "…"}
        </span>
      </div>

      <div className="flex gap-1 border-b border-line px-2 py-1.5">
        {WINDOWS.map((x) => (
          <button
            key={x.id}
            onClick={() => setWindow(x.id)}
            className={cx(
              "flex-1 rounded px-2 py-1 text-[11.5px] transition-colors",
              window === x.id
                ? "bg-surface-3 text-ink"
                : "text-muted hover:text-ink",
            )}
          >
            {x.label}
          </button>
        ))}
      </div>

      {!usage ? (
        <p className="px-3 py-4 text-[12.5px] text-faint">Reading the ledger…</p>
      ) : w!.queries === 0 ? (
        <p className="px-3 py-4 text-[12.5px] leading-relaxed text-faint">
          Nothing served in this window. Open the screen and its components start
          querying; every call lands here, priced by the schema it came from.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px border-b border-line bg-line">
            <Figure
              label="Spent"
              value={usdLabel(w!.tokens * DRY_USD)}
              sub={`${tokenLabel(Math.round(w!.tokens * 100) / 100)}`}
              accent
            />
            <Figure
              label="Calls"
              value={w!.queries.toLocaleString()}
              sub={`${w!.billable.toLocaleString()} billable · ${w!.rows.toLocaleString()} rows`}
            />
          </div>

          <div className="dr-scroll min-h-0 flex-1 overflow-y-auto">
            {w!.bySchema.map((r) => (
              <div key={r.schemaId} className="border-b border-line px-3 py-2 last:border-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[12px] text-ink">{r.path}</span>
                  <AvailabilityBadge availability={r.availability} />
                  <span
                    className={cx(
                      "ml-auto shrink-0 font-mono text-[11px] tabular-nums",
                      r.tokens > 0 ? "text-accent" : "text-faint",
                    )}
                  >
                    {r.tokens > 0 ? usdLabel(r.tokens * DRY_USD) : "free"}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[9.5px] text-faint">
                  <span>{r.queries.toLocaleString()} calls</span>
                  <span className="text-line-strong">·</span>
                  <span>{r.rows.toLocaleString()} rows</span>
                  {r.tokens > 0 && (
                    <span className="ml-auto text-muted">
                      {tokenLabel(Math.round(r.tokens * 100) / 100)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-line px-3 py-1.5 font-mono text-[9.5px] text-faint">
            Counted at the route every query passes through — not an estimate.
          </div>
        </>
      )}
    </div>
  );
}

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
    <div className="bg-surface px-3 py-2.5">
      <div className="font-mono text-[9px] tracking-[0.13em] text-faint uppercase">{label}</div>
      <div
        className={cx(
          "mt-1 font-mono text-[17px] tabular-nums",
          accent ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="font-mono text-[9.5px] text-muted">{sub}</div>
    </div>
  );
}
