"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "@/components/hero/anim";
import { cx } from "@/components/ui";
import { PUBLIC_API } from "@/lib/apiDocs";
import { TRY_OPTIONS, type TryOption } from "@/lib/tryIt";
import { useTheme } from "@/lib/useTheme";
import { SERIES_PALETTE } from "@/lib/workspace/palette";

/**
 * The landing page's try-it: the assistant asks what you want to see, you
 * pick a question, and the answer is drawn from the live public API — the
 * same rows the workspace would read — with a button that opens a real
 * workspace on it. Nothing here is a recording: the rows are fetched when
 * the question is picked, which is the whole point being made.
 *
 * The chart is drawn here with recharts rather than in a sandboxed frame:
 * a signed-out visitor has no host to answer a frame's queries, and the
 * public API needs none. What opens in the workspace is the published
 * recipe of the same name (`lib/tryIt.ts`), so the two show the same thing.
 */

const API = (process.env.NEXT_PUBLIC_DRYOS_API_URL || PUBLIC_API).replace(/\/$/, "");
const QUESTION = "Hi! What would you like to see? Pick one and I'll build it on live data.";

interface Series {
  key: string;
  label: string;
}

interface Answer {
  shape: "line" | "stacked" | "bar";
  unit: string;
  series: Series[];
  rows: Record<string, number>[];
  /** Source line under the chart. */
  source: string;
  /** Newest interval the answer holds, ISO. */
  asOf: string;
  /** Draw a "now" line — for a forecast that runs past it. */
  now?: boolean;
  /** Label ticks by date rather than by hour. */
  daily?: boolean;
}

type Row = Record<string, unknown> & { interval_start_utc: string };

async function rows(slug: string, params: Record<string, string>): Promise<Row[]> {
  const q = new URLSearchParams(params);
  const res = await fetch(`${API}/v1/datasets/${slug}/query?${q}`);
  if (!res.ok) throw new Error(`${slug} answered ${res.status}`);
  return ((await res.json()) as { rows: Row[] }).rows;
}

/** Rows from several entities, one column each, merged on the interval. */
function merge(parts: { key: string; rows: Row[]; value: (r: Row) => number | null }[]) {
  const byT = new Map<number, Record<string, number>>();
  for (const p of parts) {
    for (const r of p.rows) {
      const t = Date.parse(r.interval_start_utc);
      const v = p.value(r);
      if (v == null) continue;
      const row = byT.get(t) ?? { t };
      row[p.key] = v;
      byT.set(t, row);
    }
  }
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

const newest = (rs: Record<string, number>[]) =>
  rs.length ? new Date(rs[rs.length - 1].t).toISOString() : new Date().toISOString();

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

/** One loader per question: what it asks the API, and how the rows are drawn. */
const LOADERS: Record<string, () => Promise<Answer>> = {
  "hub-prices": async () => {
    const hubs = [
      { key: "HB_HOUSTON", label: "Houston" },
      { key: "HB_NORTH", label: "North" },
      { key: "HB_WEST", label: "West" },
    ];
    const parts = await Promise.all(
      hubs.map(async (h) => ({
        key: h.key,
        rows: await rows("ercot-realtime-lmp", {
          node: h.key,
          interval: "1h",
          agg: "avg",
          start: "-24h",
          limit: "48",
        }),
        value: (r: Row) => r.lmp_total as number | null,
      })),
    );
    const merged = merge(parts);
    return {
      shape: "line",
      unit: "$/MWh",
      series: hubs,
      rows: merged,
      source: "ERCOT real-time prices, hourly average",
      asOf: newest(merged),
    };
  },

  "fuel-mix": async () => {
    const raw = await rows("ercot-fuel-mix", { interval: "1h", agg: "avg", start: "-24h", limit: "1000" });
    const fuels = [...new Set(raw.map((r) => r.fuel as string))];
    const merged = merge(
      fuels.map((f) => ({
        key: f,
        rows: raw.filter((r) => r.fuel === f),
        value: (r: Row) => (r.gen_mw == null ? null : (r.gen_mw as number) / 1000),
      })),
    );
    // Largest at the bottom of the stack, the way the workspace orders it.
    const total = (f: string) => merged.reduce((s, r) => s + (r[f] ?? 0), 0);
    const series = fuels
      .sort((a, b) => total(b) - total(a))
      .slice(0, 8)
      .map((f) => ({ key: f, label: titleCase(f) }));
    return {
      shape: "stacked",
      unit: "GW",
      series,
      rows: merged,
      source: "ERCOT generation by fuel, hourly average",
      asOf: newest(merged),
    };
  },

  "zone-weather": async () => {
    const zones = [
      { key: "SOUTH_C", label: "Austin & San Antonio" },
      { key: "NORTH_C", label: "Dallas–Fort Worth" },
      { key: "COAST", label: "Houston" },
    ];
    const end = new Date(Date.now() + 48 * 3600_000).toISOString();
    const parts = await Promise.all(
      zones.map(async (z) => ({
        key: z.key,
        rows: await rows("openmeteo-zone-forecast", {
          node: z.key,
          start: "-6h",
          end,
          interval: "1h",
          agg: "avg",
          limit: "80",
        }),
        value: (r: Row) =>
          r.temperature_c == null ? null : Math.round(((r.temperature_c as number) * 9) / 5 + 32),
      })),
    );
    const merged = merge(parts);
    return {
      shape: "line",
      unit: "°F",
      series: zones,
      rows: merged,
      source: "Open-Meteo hourly forecast, newest run",
      asOf: new Date().toISOString(),
      now: true,
    };
  },

  "austin-solar": async () => {
    const raw = await rows("austin-permits", {
      interval: "7d",
      by: "none",
      stamp: "noon",
      where: "subject=Solar & battery",
      start: "-200d",
      limit: "60",
    });
    const merged = merge([{ key: "permits", rows: raw, value: (r) => r.samples as number | null }]);
    // The first week is cut by the window and the last one is still filling
    // in; drawn, both read as a slump that did not happen.
    const whole = merged.slice(1, -1);
    return {
      shape: "bar",
      unit: "permits a week",
      series: [{ key: "permits", label: "Solar & battery permits" }],
      rows: whole,
      source: "City of Austin building permits",
      asOf: newest(whole),
      daily: true,
    };
  },
};

const hourFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "America/Chicago" });
const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
const fullFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Chicago",
  timeZoneName: "short",
});

type Phase = "typing" | "choose" | "asking" | "shown" | "failed";

export function TryIt() {
  const reduced = useReducedMotion();
  const theme = useTheme();
  const palette = SERIES_PALETTE[theme];
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const [pick, setPick] = useState<TryOption | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const cache = useRef(new Map<string, Promise<Answer>>());
  const ask = useRef(0);

  // The assistant types its question once, then the choices appear.
  useEffect(() => {
    if (reduced) {
      setTyped(QUESTION.length);
      setPhase("choose");
      return;
    }
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setTyped(n);
      if (n >= QUESTION.length) {
        window.clearInterval(id);
        setPhase("choose");
      }
    }, 22);
    return () => window.clearInterval(id);
  }, [reduced]);

  /** Fetched once per question, and started on hover so a click is instant. */
  function load(o: TryOption): Promise<Answer> {
    let p = cache.current.get(o.recipe);
    if (!p) {
      p = LOADERS[o.recipe]();
      p.catch(() => cache.current.delete(o.recipe));
      cache.current.set(o.recipe, p);
    }
    return p;
  }

  async function choose(o: TryOption) {
    const mine = ++ask.current;
    setPick(o);
    setAnswer(null);
    setPhase("asking");
    // A beat to read the reply, even when the rows are already here.
    const beat = new Promise((r) => setTimeout(r, reduced ? 0 : 900));
    try {
      const [a] = await Promise.all([load(o), beat]);
      if (mine !== ask.current) return;
      setAnswer(a);
      setPhase("shown");
    } catch {
      if (mine === ask.current) setPhase("failed");
    }
  }

  function reset() {
    ask.current += 1;
    setPick(null);
    setAnswer(null);
    setPhase("choose");
  }

  const choosing = phase === "choose";

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-2xl shadow-black/30">
      {/* The window: a workspace page being built. */}
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        </span>
        <span className="ml-2 truncate font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
          Your workspace · {pick ? pick.workspace : "New page"}
        </span>
      </div>

      <div className="flex min-h-[460px] flex-col gap-3 p-4 sm:p-5">
        {/* The assistant's question. */}
        <Bubble who="ai">
          {QUESTION.slice(0, typed)}
          {phase === "typing" && <Caret />}
        </Bubble>

        {/* The choices — kept on screen while one is picked, so another is one click. */}
        {phase !== "typing" && !pick && (
          <div className="grid gap-2 sm:grid-cols-2" role="list">
            {TRY_OPTIONS.map((o, i) => (
              <button
                key={o.recipe}
                type="button"
                role="listitem"
                onClick={() => choose(o)}
                onMouseEnter={() => void load(o).catch(() => {})}
                onFocus={() => void load(o).catch(() => {})}
                style={{ animationDelay: `${i * 70}ms` }}
                className={cx(
                  "group rounded-lg border border-line bg-bg px-3.5 py-3 text-left transition-colors hover:border-accent-line hover:bg-accent-dim/40",
                  choosing && !reduced && "dr-try-in",
                )}
              >
                <span className="font-mono text-[10px] tracking-[0.14em] text-accent uppercase">
                  {o.domain}
                </span>
                <span className="mt-1 block text-[13.5px] leading-snug text-ink">{o.prompt}</span>
              </button>
            ))}
          </div>
        )}

        {pick && (
          <>
            <Bubble who="you">{pick.prompt}</Bubble>
            <Bubble who="ai">
              {phase === "failed" ? (
                "The data did not come back just now. Try again in a moment."
              ) : (
                <>
                  {pick.reply}
                  {phase === "asking" && <Dots />}
                </>
              )}
            </Bubble>
          </>
        )}

        {/* The tile, landing on the page. */}
        {pick && phase === "shown" && answer && (
          <div className={cx("rounded-lg border border-line bg-bg", !reduced && "dr-try-in")}>
            <div className="flex items-baseline justify-between gap-3 border-b border-line px-3.5 py-2">
              <span className="truncate text-[13px] font-semibold text-ink">{pick.title}</span>
              <span className="shrink-0 font-mono text-[10.5px] text-faint">
                {answer.unit} · as of {(answer.daily ? dayFmt : hourFmt).format(new Date(answer.asOf))}
                {answer.daily ? "" : " CT"}
              </span>
            </div>
            <div className="h-[210px] px-1 pt-2">
              <AnswerChart answer={answer} palette={palette} theme={theme} />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 px-3.5 pb-2.5 text-[11.5px] text-muted">
              {answer.series.map((s, i) => (
                <span key={s.key} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: palette[i % 8] }} />
                  {s.label}
                </span>
              ))}
              <span className="ml-auto text-faint">{answer.source}</span>
            </div>
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {pick && phase === "shown" ? (
            <>
              <Link
                href={`/workspace/start?recipe=${pick.recipe}`}
                className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-[13px] font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
              >
                Open this in your workspace →
              </Link>
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-9 items-center rounded-md border border-line-strong px-3 text-[13px] text-muted hover:text-ink"
              >
                Ask something else
              </button>
            </>
          ) : phase === "failed" ? (
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-9 items-center rounded-md border border-line-strong px-3 text-[13px] text-muted hover:text-ink"
            >
              Pick again
            </button>
          ) : (
            <span className="text-[12px] text-faint">
              {choosing ? "Real data, fetched when you click. No sign-up to look." : " "}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function AnswerChart({
  answer,
  palette,
  theme,
}: {
  answer: Answer;
  palette: string[];
  theme: "light" | "dark";
}) {
  const ink = theme === "dark" ? "#7c8696" : "#6b7280";
  const grid = theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
  const axis = {
    tick: { fill: ink, fontSize: 10.5 },
    tickLine: false,
    axisLine: false,
  } as const;
  const x = (
    <XAxis
      dataKey="t"
      type="number"
      scale="time"
      domain={["dataMin", "dataMax"]}
      tickFormatter={(t: number) => (answer.daily ? dayFmt : hourFmt).format(new Date(t))}
      minTickGap={28}
      {...axis}
    />
  );
  const y = <YAxis width={40} tickFormatter={(v: number) => fmt(v)} {...axis} />;
  const tip = (
    <Tooltip
      cursor={{ stroke: ink, strokeOpacity: 0.4 }}
      content={<Tip answer={answer} palette={palette} />}
    />
  );
  const lines = <CartesianGrid vertical={false} stroke={grid} />;
  const margin = { top: 4, right: 12, bottom: 0, left: 0 };

  return (
    <ResponsiveContainer width="100%" height="100%">
      {answer.shape === "bar" ? (
        <BarChart data={answer.rows} margin={margin}>
          {lines}
          {x}
          {y}
          {tip}
          <Bar dataKey={answer.series[0].key} fill={palette[0]} radius={[2, 2, 0, 0]} />
        </BarChart>
      ) : answer.shape === "stacked" ? (
        <AreaChart data={answer.rows} margin={margin}>
          {lines}
          {x}
          {y}
          {tip}
          {answer.series.map((s, i) => (
            <Area
              key={s.key}
              dataKey={s.key}
              stackId="1"
              type="monotone"
              stroke={palette[i % 8]}
              fill={palette[i % 8]}
              fillOpacity={0.55}
              strokeWidth={1}
              isAnimationActive
            />
          ))}
        </AreaChart>
      ) : (
        <LineChart data={answer.rows} margin={margin}>
          {lines}
          {x}
          {y}
          {tip}
          {answer.now && (
            <ReferenceLine x={Date.now()} stroke={ink} strokeDasharray="3 3" label={{ value: "now", fill: ink, fontSize: 10, position: "insideTopRight" }} />
          )}
          {answer.series.map((s, i) => (
            <Line
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={palette[i % 8]}
              strokeWidth={1.75}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

function fmt(v: number) {
  if (Math.abs(v) >= 100) return Math.round(v).toLocaleString("en-US");
  return v.toFixed(Math.abs(v) >= 10 ? 0 : 1);
}

/** The house tooltip: dark, one row per series, the swatch in the series' own color. */
function Tip({
  answer,
  palette,
  active,
  label,
}: {
  answer: Answer;
  palette: string[];
  active?: boolean;
  label?: number;
}) {
  if (!active || label == null) return null;
  const row = answer.rows.find((r) => r.t === label);
  if (!row) return null;
  return (
    <div className="rounded-md border border-line-strong bg-surface-2 px-2.5 py-2 text-[11.5px] shadow-lg">
      <div className="mb-1 text-faint">
        {answer.daily ? `Week of ${dayFmt.format(new Date(label))}` : fullFmt.format(new Date(label))}
      </div>
      {answer.series.map((s, i) =>
        row[s.key] == null ? null : (
          <div key={s.key} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm" style={{ background: palette[i % 8] }} />
            <span className="text-muted">{s.label}</span>
            <span className="ml-auto pl-3 font-mono text-ink tabular-nums">
              {fmt(row[s.key])} {answer.unit}
            </span>
          </div>
        ),
      )}
    </div>
  );
}

function Bubble({ who, children }: { who: "ai" | "you"; children: React.ReactNode }) {
  const ai = who === "ai";
  return (
    <div className={cx("flex gap-2.5", !ai && "justify-end")}>
      {ai && (
        <span
          aria-hidden
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-accent-ink"
        >
          ✦
        </span>
      )}
      <div
        className={cx(
          "max-w-[85%] rounded-lg px-3 py-2 text-[13.5px] leading-relaxed",
          ai ? "bg-surface-2 text-ink" : "bg-accent-dim text-ink",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Caret() {
  return <span aria-hidden className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-ink" />;
}

function Dots() {
  return (
    <span aria-label="working" className="ml-1.5 inline-flex gap-0.5 align-middle">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 animate-pulse rounded-full bg-muted"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
