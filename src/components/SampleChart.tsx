"use client";

import { useEffect, useMemo, useState } from "react";
import type { DatasetSample } from "@/lib/types";
import { DISPLAY_TZ_LABEL, clock, stamp } from "@/lib/time";
import { Panel, PanelHeader, cx } from "./ui";

/**
 * One hub's price over the window — a worked example of what the rows contain.
 *
 * A single node rather than the feed: ~1,100 points per interval is the
 * product, and all of them at once is an unreadable smear. A trading hub is the
 * right default because it is the number people actually quote.
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

  const pts = useMemo(
    () =>
      sample.points
        .filter((p) => p.v !== null)
        .map((p) => ({ t: Date.parse(p.t), v: p.v as number })),
    [sample.points],
  );

  return (
    <Panel padded={false}>
      <PanelHeader
        title="What the data looks like"
        subtitle={`One settlement point over the last 24 hours, drawn from the rows you would receive. Every interval carries ~1,100 more like it.`}
        action={
          sample.nodes.length > 1 ? (
            <select
              value={node}
              onChange={(e) => setNode(e.target.value)}
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
      <div className={cx("px-5 py-5 transition-opacity", loading && "opacity-50")}>
        <Line points={pts} unit={sample.unit} />
      </div>
    </Panel>
  );
}

function Line({
  points,
  unit,
}: {
  points: { t: number; v: number }[];
  unit: string;
}) {
  if (points.length < 2) {
    return <p className="py-8 text-center text-[13px] text-muted">Not enough points yet.</p>;
  }

  const W = 720;
  const H = 220;
  const PAD = { top: 14, right: 12, bottom: 26, left: 46 };

  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.v);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  // Pad the value axis so the line never sits on the frame, and keep zero in
  // view when prices go negative — negative LMPs are real and worth seeing.
  const lo = Math.min(...ys, 0);
  const hi = Math.max(...ys);
  const span = hi - lo || 1;
  const yLo = lo - span * 0.08;
  const yHi = hi + span * 0.08;

  const px = (t: number) =>
    PAD.left + ((t - x0) / (x1 - x0 || 1)) * (W - PAD.left - PAD.right);
  const py = (v: number) =>
    PAD.top + (1 - (v - yLo) / (yHi - yLo)) * (H - PAD.top - PAD.bottom);

  const line = points.map((p, i) => `${i ? "L" : "M"}${px(p.t)},${py(p.v)}`).join(" ");
  const area =
    `M${px(points[0].t)},${py(yLo)} ` +
    points.map((p) => `L${px(p.t)},${py(p.v)}`).join(" ") +
    ` L${px(points[points.length - 1].t)},${py(yLo)} Z`;

  const ticks = [yLo, (yLo + yHi) / 2, yHi];
  const last = points[points.length - 1];

  return (
    <div>
      <div className="dr-scroll overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[220px] w-full min-w-[520px]">
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={py(v)}
                y2={py(v)}
                stroke="var(--color-line)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={py(v) + 3.5}
                textAnchor="end"
                className="fill-[var(--color-faint)] font-mono text-[10px]"
              >
                ${v.toFixed(0)}
              </text>
            </g>
          ))}

          {/* Zero is a different kind of line: below it, generators pay to run. */}
          {yLo < 0 && yHi > 0 && (
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={py(0)}
              y2={py(0)}
              stroke="var(--color-line-strong)"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          )}

          <path d={area} fill="var(--color-accent)" opacity="0.10" />
          <path
            d={line}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx={px(last.t)} cy={py(last.v)} r="3.5" fill="var(--color-accent)" />

          {[points[0], points[Math.floor(points.length / 2)], last].map((p, i) => (
            <text
              key={i}
              x={px(p.t)}
              y={H - 8}
              textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
              className="fill-[var(--color-faint)] font-mono text-[10px]"
            >
              {clock(p.t)}
            </text>
          ))}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3 text-[12.5px]">
        <span className="text-muted">
          Latest{" "}
          <span className="font-mono text-accent">
            ${last.v.toFixed(2)} {unit.replace("$/", "/")}
          </span>{" "}
          <span className="text-faint">at {stamp(last.t)} {DISPLAY_TZ_LABEL}</span>
        </span>
        <span className="font-mono text-faint">
          {points.length} intervals · ${Math.min(...ys).toFixed(2)} – $
          {Math.max(...ys).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
