import type { DatasetPreview, PreviewInterval } from "@/lib/types";
import { Panel, PanelHeader, cx } from "./ui";

/**
 * Live preview of what a dataset actually contains.
 *
 * Two views over the same measured window: the price spread across nodes, and
 * whether each expected interval arrived on time. Both render from collected
 * rows — there is no sample or illustrative mode, so a dataset with no data
 * shows an empty state rather than a plausible-looking chart.
 */
export function DataPreview({
  preview,
  datasetName,
}: {
  preview: DatasetPreview | null;
  datasetName: string;
}) {
  if (!preview) {
    return (
      <Panel padded={false}>
        <PanelHeader
          title="Live preview"
          subtitle="What this dataset contains right now, and when each interval landed."
        />
        <div className="px-5 py-10 text-center">
          <p className="text-[14px] text-ink">Nothing collected yet</p>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">
            {datasetName} has no rows to preview. This fills in on its own once the
            collector runs — we would rather show you an empty panel than a sample that
            looks like data.
          </p>
        </div>
      </Panel>
    );
  }

  const pts = preview.intervals.filter((i) => i.avg !== null);
  const lows = pts.map((p) => p.lo ?? 0);
  const highs = pts.map((p) => p.hi ?? 0);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const nodes = pts.length ? pts[pts.length - 1].nodes : 0;
  const latest = pts.length ? pts[pts.length - 1].avg : null;

  return (
    <Panel padded={false}>
      <PanelHeader
        title="Live preview"
        subtitle={`Spread across all ${nodes.toLocaleString()} settlement points, last ${preview.hours} hours. Aggregated from collected rows.`}
      />

      <div className="grid grid-cols-2 divide-x divide-y divide-line border-b border-line md:grid-cols-4 md:divide-y-0">
        <Stat label="Latest average" value={latest === null ? "—" : `$${latest.toFixed(2)}`} accent />
        <Stat label="Low" value={`$${min.toFixed(2)}`} />
        <Stat label="High" value={`$${max.toFixed(2)}`} />
        <Stat label="Intervals" value={String(pts.length)} />
      </div>

      <div className="px-5 py-5">
        <SpreadChart points={pts} min={min} max={max} unit={preview.unit} />
      </div>

      <div className="border-t border-line px-5 py-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
            Collection history
          </span>
          <Legend />
        </div>
        <CollectionGraph preview={preview} />
      </div>
    </Panel>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
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
    </div>
  );
}

/* ── Price spread ─────────────────────────────────────────────────────── */

const W = 720;
const H = 180;
const PAD = { l: 44, r: 8, t: 10, b: 22 };

function SpreadChart({
  points,
  min,
  max,
  unit,
}: {
  points: PreviewInterval[];
  min: number;
  max: number;
  unit: string;
}) {
  if (points.length < 2) {
    return (
      <p className="py-6 text-center text-[13px] text-muted">
        One interval collected so far — the chart needs at least two to draw a line.
      </p>
    );
  }

  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  // Pad the domain so the band never touches the frame.
  const span = max - min || 1;
  const lo = min - span * 0.08;
  const hi = max + span * 0.08;

  const x = (i: number) => PAD.l + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.t + innerH - ((v - lo) / (hi - lo)) * innerH;

  const band =
    points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.hi ?? 0).toFixed(1)}`).join("") +
    points
      .slice()
      .reverse()
      .map((p, i) => `L${x(points.length - 1 - i).toFixed(1)},${y(p.lo ?? 0).toFixed(1)}`)
      .join("") +
    "Z";

  const line = points
    .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.avg ?? 0).toFixed(1)}`)
    .join("");

  const ticks = [hi, (hi + lo) / 2, lo];
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className="dr-scroll overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[180px] w-full min-w-[520px]" role="img"
        aria-label={`Price spread, ${unit}`}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--color-line)"
              strokeDasharray="2 4"
            />
            <text
              x={PAD.l - 8}
              y={y(t) + 3.5}
              textAnchor="end"
              className="fill-[var(--color-faint)] font-mono"
              fontSize="9.5"
            >
              ${t.toFixed(0)}
            </text>
          </g>
        ))}

        {/* min–max across nodes: the congestion spread, which is the story */}
        <path d={band} fill="var(--color-accent)" opacity="0.14" />
        <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="1.75" />

        <text x={PAD.l} y={H - 6} className="fill-[var(--color-faint)] font-mono" fontSize="9.5">
          {hhmm(first.t)}
        </text>
        <text
          x={W - PAD.r}
          y={H - 6}
          textAnchor="end"
          className="fill-[var(--color-faint)] font-mono"
          fontSize="9.5"
        >
          {hhmm(last.t)} UTC
        </text>
      </svg>
      <p className="mt-1 text-[12px] text-muted">
        Line is the average across settlement points; the band is the min–max spread —
        which is congestion, not noise.
      </p>
    </div>
  );
}

/* ── Collection graph ─────────────────────────────────────────────────── */

type CellState = "onTime" | "late" | "missing";

function cellState(interval: PreviewInterval | undefined, slaSeconds: number): CellState {
  if (!interval) return "missing";
  if (interval.lagSeconds === null) return "onTime";
  return interval.lagSeconds <= slaSeconds ? "onTime" : "late";
}

const CELL_CLASS: Record<CellState, string> = {
  onTime: "bg-ok",
  late: "bg-warn",
  missing: "bg-surface-3",
};

/**
 * One cell per interval the schedule says should exist, over the window.
 *
 * Expected slots are derived from the declared cadence rather than from the
 * rows, so a gap renders as an absent cell instead of silently closing up. That
 * is the whole point — a chart drawn only from what arrived cannot show what
 * did not.
 */
export function CollectionGraph({ preview }: { preview: DatasetPreview }) {
  const cadence = preview.cadenceSeconds;
  const byTime = new Map(preview.intervals.map((i) => [Date.parse(i.t), i]));
  const times = [...byTime.keys()].sort((a, b) => a - b);

  let slots: number[];
  if (cadence && times.length) {
    const step = cadence * 1000;
    const start = times[0];
    const end = times[times.length - 1];
    const n = Math.min(Math.floor((end - start) / step) + 1, 600);
    slots = Array.from({ length: n }, (_, i) => start + i * step);
  } else {
    slots = times;
  }

  const cells = slots.map((t) => {
    // Tolerate a couple of seconds of jitter in the published timestamp.
    const match =
      byTime.get(t) ??
      preview.intervals.find((i) => Math.abs(Date.parse(i.t) - t) < 90_000);
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
                ? `${new Date(c.t).toISOString().slice(0, 16).replace("T", " ")} UTC · ` +
                  `${c.interval.nodes.toLocaleString()} points · collected ` +
                  `${fmtLag(c.interval.lagSeconds)} after the interval`
                : `${new Date(c.t).toISOString().slice(0, 16).replace("T", " ")} UTC · no data`
            }
            className={cx("h-3.5 w-3.5 rounded-[3px]", CELL_CLASS[c.state])}
          />
        ))}
      </div>
      <p className="mt-3 text-[12px] text-muted">
        {onTime} on time
        {late > 0 && <> · {late} late</>}
        {missing > 0 && <> · {missing} missing</>} · one cell per expected interval,
        against a {Math.round(preview.freshnessSlaSeconds / 60)}-minute SLA.
      </p>
    </div>
  );
}

function Legend() {
  return (
    <span className="flex items-center gap-3 text-[11.5px] text-muted">
      {(
        [
          ["onTime", "on time"],
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

function hhmm(iso: string): string {
  return new Date(iso.replace(" ", "T")).toISOString().slice(11, 16);
}

function fmtLag(seconds: number | null): string {
  if (seconds === null) return "an unknown time";
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
