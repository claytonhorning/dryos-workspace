import type { DatasetPreview, PreviewInterval } from "@/lib/types";
import { Panel, PanelHeader, cx } from "./ui";

/**
 * Delivery record: expected cadence, when the source posted each interval, and
 * when we had it.
 *
 * Deliberately shows no prices. The values are the product; what a buyer needs
 * before paying is evidence the feed arrives when it says it will. Everything
 * here is measured from collected rows, so a dataset with nothing collected
 * gets an empty panel rather than a plausible-looking chart.
 */
export function DataPreview({
  preview,
  datasetName,
  cadenceLabel,
}: {
  preview: DatasetPreview | null;
  datasetName: string;
  cadenceLabel: string;
}) {
  if (!preview) {
    return (
      <Panel padded={false}>
        <PanelHeader
          title="Delivery record"
          subtitle="What the source promises, and what actually arrived."
        />
        <div className="px-5 py-10 text-center">
          <p className="text-[14px] text-ink">Nothing collected yet</p>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">
            {datasetName} has no collection history to show. This fills in on its own
            once the collector runs — we would rather show you an empty panel than a
            sample that looks like a track record.
          </p>
        </div>
      </Panel>
    );
  }

  const iv = preview.intervals;
  const postLags = iv.map((i) => i.postLagSeconds).filter((n): n is number => n !== null);
  const collectLags = iv
    .map((i) => i.collectLagSeconds)
    .filter((n): n is number => n !== null);
  const nodes = iv.length ? iv[iv.length - 1].nodes : 0;

  return (
    <Panel padded={false}>
      <PanelHeader
        title="Delivery record"
        subtitle={`Every interval ERCOT published in the last ${preview.hours} hours, when they posted it, and when we had it. Measured, not sampled.`}
      />

      <div className="grid grid-cols-2 divide-x divide-y divide-line border-b border-line md:grid-cols-4 md:divide-y-0">
        <Stat label="Expected" value={cadenceLabel} hint="declared by the source" />
        <Stat
          label="Source posts in"
          value={fmt(median(postLags))}
          hint="median, after the interval"
        />
        <Stat
          label="We have it in"
          value={fmt(median(collectLags))}
          hint="median, after the interval"
          accent
        />
        <Stat
          label="Points per interval"
          value={nodes.toLocaleString()}
          hint={`${iv.length} intervals`}
        />
      </div>

      <div className="px-5 py-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
            Collection history
          </span>
          <Legend />
        </div>
        <CollectionGraph preview={preview} />
      </div>

      <div className="border-t border-line">
        <RecentTable intervals={iv.slice(-6).reverse()} />
      </div>
    </Panel>
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
 * Slots are derived from the declared cadence rather than from the rows, so a
 * gap renders as an absent cell instead of silently closing up. A graph drawn
 * only from what arrived cannot show what did not.
 */
export function CollectionGraph({ preview }: { preview: DatasetPreview }) {
  const cadence = preview.cadenceSeconds;
  const byTime = new Map(preview.intervals.map((i) => [Date.parse(i.t), i]));
  const times = [...byTime.keys()].sort((a, b) => a - b);

  let slots: number[];
  if (cadence && times.length) {
    const step = cadence * 1000;
    const n = Math.min(
      Math.floor((times[times.length - 1] - times[0]) / step) + 1,
      600,
    );
    slots = Array.from({ length: n }, (_, i) => times[0] + i * step);
  } else {
    slots = times;
  }

  const cells = slots.map((t) => {
    // Tolerate jitter in the published timestamp.
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

/* ── Recent intervals ─────────────────────────────────────────────────── */

function RecentTable({ intervals }: { intervals: PreviewInterval[] }) {
  return (
    <div className="dr-scroll overflow-x-auto">
      <table className="w-full min-w-[520px] text-left">
        <thead>
          <tr className="border-b border-line">
            {["Interval (UTC)", "Source posted", "We had it", "Points"].map((h) => (
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
              <td className="px-5 py-2.5 font-mono text-[12px] tabular-nums whitespace-nowrap text-faint">
                {i.nodes.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────────────────────── */

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
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
