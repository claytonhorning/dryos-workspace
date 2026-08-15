"use client";

import { useEffect, useMemo, useState } from "react";
import type { DatasetPreview, PreviewInterval } from "@/lib/types";
import { cx } from "./ui";

const POLL_MS = 20_000;

/**
 * The delivery record, kept current.
 *
 * Server-rendered from the initial fetch, then polled — so the page is correct
 * on first paint and stays correct without a reload. The countdown is the point:
 * a feed that claims a five-minute cadence should visibly be about to produce
 * another interval, and if it isn't, that should be obvious rather than buried.
 */
export function LiveDeliveryRecord({
  slug,
  apiUrl,
  initial,
  cadenceLabel,
}: {
  slug: string;
  apiUrl: string | null;
  initial: DatasetPreview;
  cadenceLabel: string;
}) {
  const [preview, setPreview] = useState(initial);
  const [now, setNow] = useState<number | null>(null);

  // Deferred to an effect so server and first client render agree; a clock in
  // the markup is a hydration mismatch waiting to happen.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!apiUrl) return;
    let cancelled = false;

    const tick = async () => {
      // Nobody is looking at a hidden tab, and a listing page left open in a
      // background tab all day should not keep asking.
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`${apiUrl}/v1/datasets/${slug}/preview?hours=24`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as DatasetPreview;
        if (!cancelled && body.intervals.length) setPreview(body);
      } catch {
        // A dropped poll is not worth surfacing — the next one is 20s away and
        // what is on screen is still the last thing that was true.
      }
    };

    const id = setInterval(tick, POLL_MS);
    // Catch up immediately when the tab comes back rather than waiting a cycle.
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [apiUrl, slug]);

  const iv = preview.intervals;
  const last = iv.length ? iv[iv.length - 1] : null;
  const cadenceMs = (preview.cadenceSeconds ?? 300) * 1000;

  const nextDueMs = useMemo(
    () => (last ? Date.parse(last.t) + cadenceMs : null),
    [last, cadenceMs],
  );

  return (
    <>
      <div className="grid grid-cols-2 divide-x divide-y divide-line border-b border-line md:grid-cols-4 md:divide-y-0">
        <Stat label="Expected" value={cadenceLabel} hint="declared by the source" />
        <Stat
          label="Next interval"
          value={countdown(nextDueMs, now)}
          hint={nextDueMs ? `due ${utc(nextDueMs)} UTC` : "—"}
          accent
        />
        <Stat
          label="Latest arrived"
          value={fmt(last?.collectLagSeconds ?? null)}
          hint="after its interval"
        />
        <Stat
          label="Intervals"
          value={String(iv.length)}
          hint={`last ${preview.hours} hours`}
        />
      </div>

      <div className="px-5 py-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
            {apiUrl && <span className="dr-pulse h-1.5 w-1.5 rounded-full bg-ok" />}
            Collection history
          </span>
          <Legend />
        </div>
        <CollectionGraph preview={preview} />
      </div>

      <div className="border-t border-line">
        <RecentTable intervals={iv.slice(-6).reverse()} />
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className="px-5 py-3.5">
      <div className="font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
        {label}
      </div>
      <div
        className={cx(
          "mt-1 text-[17px] font-semibold tabular-nums",
          accent ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11.5px] text-faint">{hint}</div>
    </div>
  );
}

/* ── Collection graph ─────────────────────────────────────────────────── */

type CellState = "onTime" | "late" | "missing";

const CELL_CLASS: Record<CellState, string> = {
  onTime: "bg-ok",
  late: "bg-warn",
  missing: "bg-surface-3",
};

function cellState(interval: PreviewInterval | undefined, slaSeconds: number): CellState {
  if (!interval) return "missing";
  if (interval.collectLagSeconds === null) return "onTime";
  return interval.collectLagSeconds <= slaSeconds ? "onTime" : "late";
}

/**
 * One cell per interval the schedule says should exist.
 *
 * Slots come from the declared cadence, not from the rows, so a gap renders as
 * an absent cell instead of silently closing up. A graph drawn only from what
 * arrived cannot show what did not.
 */
export function CollectionGraph({ preview }: { preview: DatasetPreview }) {
  const byTime = new Map(preview.intervals.map((i) => [Date.parse(i.t), i]));
  const times = [...byTime.keys()].sort((a, b) => a - b);
  const cadence = preview.cadenceSeconds;

  let slots: number[];
  if (cadence && times.length) {
    const step = cadence * 1000;
    const n = Math.min(Math.floor((times[times.length - 1] - times[0]) / step) + 1, 600);
    slots = Array.from({ length: n }, (_, i) => times[0] + i * step);
  } else {
    slots = times;
  }

  const cells = slots.map((t) => {
    const match =
      byTime.get(t) ?? preview.intervals.find((i) => Math.abs(Date.parse(i.t) - t) < 90_000);
    return { t, state: cellState(match, preview.freshnessSlaSeconds), interval: match };
  });

  const onTime = cells.filter((c) => c.state === "onTime").length;
  const late = cells.filter((c) => c.state === "late").length;
  const missing = cells.filter((c) => c.state === "missing").length;

  return (
    <div>
      <div className="flex flex-wrap gap-[3px]">
        {cells.map((c) => (
          <span
            key={c.t}
            title={
              c.interval
                ? `${utc(c.t)} UTC · posted ${fmt(c.interval.postLagSeconds)} after · ` +
                  `collected ${fmt(c.interval.collectLagSeconds)} after`
                : `${utc(c.t)} UTC · no data`
            }
            className={cx("h-3.5 w-3.5 rounded-[3px]", CELL_CLASS[c.state])}
          />
        ))}
      </div>
      <p className="mt-3 text-[12px] text-muted">
        {onTime} inside SLA
        {late > 0 && <> · {late} late</>}
        {missing > 0 && <> · {missing} missing</>} · one cell per expected interval,
        against a {Math.round(preview.freshnessSlaSeconds / 60)}-minute freshness SLA.
      </p>
    </div>
  );
}

function Legend() {
  return (
    <span className="flex items-center gap-3 text-[11.5px] text-muted">
      {(
        [
          ["onTime", "inside SLA"],
          ["late", "late"],
          ["missing", "missing"],
        ] as [CellState, string][]
      ).map(([state, label]) => (
        <span key={state} className="flex items-center gap-1.5">
          <span className={cx("h-2.5 w-2.5 rounded-[2px]", CELL_CLASS[state])} />
          {label}
        </span>
      ))}
    </span>
  );
}

function RecentTable({ intervals }: { intervals: PreviewInterval[] }) {
  return (
    <div className="dr-scroll overflow-x-auto">
      <table className="w-full min-w-[520px] text-left">
        <thead>
          <tr className="border-b border-line">
            {["Interval (UTC)", "Source posted", "We had it"].map((h) => (
              <th
                key={h}
                className="px-5 py-2.5 font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {intervals.map((i) => (
            <tr key={i.t} className="border-b border-line/60 last:border-0">
              <td className="px-5 py-2.5 font-mono text-[12.5px] whitespace-nowrap text-ink">
                {utc(Date.parse(i.t))}
              </td>
              <td className="px-5 py-2.5 font-mono text-[12px] whitespace-nowrap text-muted">
                +{fmt(i.postLagSeconds)}
              </td>
              <td className="px-5 py-2.5 font-mono text-[12px] whitespace-nowrap text-muted">
                +{fmt(i.collectLagSeconds)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────────────────────── */

/** Time until the next interval is due, or how long it is overdue. */
function countdown(dueMs: number | null, now: number | null): string {
  if (dueMs === null) return "—";
  if (now === null) return "· · ·"; // pre-hydration placeholder
  const delta = Math.round((dueMs - now) / 1000);
  if (delta <= 0) return `overdue ${fmt(-delta)}`;
  const m = Math.floor(delta / 60);
  const s = delta % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

function fmt(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function utc(ms: number): string {
  return new Date(ms).toISOString().slice(11, 16);
}
