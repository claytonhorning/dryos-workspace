"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DatasetSample } from "@/lib/types";
import { DISPLAY_TZ_LABEL, clock, clockSeconds, stamp } from "@/lib/time";
import { Panel, PanelHeader, cx } from "./ui";

/**
 * One hub's price over the window — a worked example of what the rows contain.
 *
 * A single node rather than the whole feed: ~1,100 points per interval is the
 * product, and all of them at once is an unreadable smear. A trading hub is the
 * right default because it is the number people actually quote.
 *
 * One series, so: area rather than multi-line, one hue, and no legend — the
 * panel title names it. The crosshair does the work a legend would.
 */
export function SampleChart({
  slug,
  apiUrl,
  initial,
}: {
  slug: string;
  apiUrl: string | null;
  initial: DatasetSample;
}) {
  const [sample, setSample] = useState(initial);
  const [node, setNode] = useState(initial.node ?? "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!apiUrl || !node || node === sample.node) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${apiUrl}/v1/datasets/${slug}/sample?hours=24&node=${node}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: DatasetSample | null) => {
        if (!cancelled && body?.points?.length) setSample(body);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [apiUrl, slug, node, sample.node]);

  const data = useMemo(
    () =>
      sample.points
        .filter((p) => p.v !== null)
        .map((p) => ({ t: Date.parse(p.t), v: p.v as number })),
    [sample.points],
  );

  const values = data.map((d) => d.v);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const last = data[data.length - 1];

  // Compute the scale rather than handing Recharts a domain callback: the
  // callback form leaked its internal sentinel into the top tick (a literal
  // 9999996) and produced ticks like $40.481. Nice round numbers, and zero is
  // always in frame — a negative LMP is a real event, not an outlier to crop.
  const { domain, ticks } = useMemo(() => niceScale(min, max), [min, max]);

  return (
    <Panel padded={false}>
      <PanelHeader
        title={`${sample.node ?? "Sample"} · price`}
        subtitle="One settlement point over the last 24 hours, drawn from the rows you would receive. Every interval carries ~1,100 more like it."
        action={
          sample.nodes.length > 1 ? (
            <select
              value={node}
              onChange={(e) => setNode(e.target.value)}
              aria-label="Settlement point"
              className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-[12.5px] text-ink focus:border-line-strong focus:outline-none"
            >
              {sample.nodes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      <div className={cx("px-2 pt-5 pb-2 transition-opacity", loading && "opacity-50")}>
        {data.length < 2 ? (
          <p className="py-10 text-center text-[13px] text-muted">
            Not enough points yet.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
              <defs>
                <linearGradient id="dr-sample-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.01} />
                </linearGradient>
              </defs>

              {/* Recessive grid: horizontal only — the reader compares price, not time. */}
              <CartesianGrid
                stroke="var(--color-line)"
                strokeDasharray="0"
                vertical={false}
              />

              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => clock(t)}
                tick={{ fill: "var(--color-faint)", fontSize: 11 }}
                stroke="var(--color-line)"
                tickLine={false}
                minTickGap={48}
              />
              <YAxis
                width={52}
                domain={domain}
                ticks={ticks}
                tickFormatter={(v: number) => `$${v}`}
                tick={{ fill: "var(--color-faint)", fontSize: 11 }}
                stroke="var(--color-line)"
                tickLine={false}
                axisLine={false}
                allowDataOverflow={false}
              />

              {min < 0 && (
                <ReferenceLine
                  y={0}
                  stroke="var(--color-line-strong)"
                  strokeDasharray="3 3"
                />
              )}

              <Tooltip
                content={<PriceTooltip />}
                // The crosshair finds the X, so the reader aims at a time rather
                // than at a 2px line.
                cursor={{ stroke: "var(--color-line-strong)", strokeWidth: 1 }}
              />

              <Area
                type="monotone"
                dataKey="v"
                stroke="var(--color-accent)"
                strokeWidth={2}
                fill="url(#dr-sample-fill)"
                isAnimationActive={false}
                activeDot={{
                  r: 4,
                  fill: "var(--color-accent)",
                  stroke: "var(--color-surface)",
                  strokeWidth: 2,
                }}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {last && (
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-line px-5 py-3.5 text-[12.5px]">
          <span className="flex items-center gap-2 text-muted">
            {/* The mark carries identity; the number stays in ink. */}
            <span className="h-[2px] w-4 rounded-full bg-accent" />
            Latest <span className="font-mono text-ink">${last.v.toFixed(2)}</span>
            <span className="text-faint">
              {sample.unit.replace("$/", "/")} at {stamp(last.t)} {DISPLAY_TZ_LABEL}
            </span>
          </span>
          <span className="font-mono text-faint">
            {data.length} intervals · ${min.toFixed(2)} – ${max.toFixed(2)}
          </span>
        </div>
      )}
    </Panel>
  );
}

/** Value leads, label follows — the reader already has the series. */
function PriceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { t: number; v: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const { t, v } = payload[0].payload;

  return (
    <div className="rounded-md border border-line-strong bg-surface px-3 py-2 shadow-lg shadow-black/30">
      <div className="flex items-center gap-2">
        <span className="h-[2px] w-3.5 rounded-full bg-accent" />
        <span className="font-mono text-[14px] font-semibold text-ink tabular-nums">
          ${v.toFixed(2)}
        </span>
        <span className="text-[11.5px] text-faint">/MWh</span>
      </div>
      <div className="mt-1 font-mono text-[11.5px] text-muted">
        {clockSeconds(t)} {DISPLAY_TZ_LABEL}
      </div>
    </div>
  );
}


/**
 * A rounded value scale with zero always included.
 *
 * Steps in 1/2/5×10ⁿ so ticks land on numbers a reader recognises, and pads the
 * top so the line never touches the frame.
 */
function niceScale(min: number, max: number): {
  domain: [number, number];
  ticks: number[];
} {
  const lo = Math.min(min, 0);
  const hi = Math.max(max, lo + 1);
  const rough = (hi - lo) / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? mag * 10;

  const start = Math.floor(lo / step) * step;
  const end = Math.ceil((hi + step * 0.15) / step) * step;

  const ticks: number[] = [];
  for (let v = start; v <= end + 1e-9; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return { domain: [start, end], ticks };
}
