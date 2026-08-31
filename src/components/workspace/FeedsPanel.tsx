"use client";

import { useEffect, useMemo, useState } from "react";
import { cx } from "@/components/ui";
import { CollectionGraph } from "@/components/CollectionGraph";
import type { DatasetPreview } from "@/lib/types";
import { SCHEMAS, type DataRef, type Schema } from "@/lib/workspace/catalog";
import { componentDef, type ComponentSpec } from "@/lib/workspace/components";
import type { App } from "@/lib/workspace/types";

/**
 * The feeds: what this screen reads, tile by tile, and whether it is arriving.
 *
 * A dashboard is a claim that its numbers are current, and nothing on it says
 * so — a flat chart reads the same whether the market is quiet or the
 * collector died an hour ago. This pane is the delivery record from the
 * dataset landing pages, scoped to the screen: every stream a tile queries,
 * its latest interval, a countdown to when the next one is due, and — opened —
 * the same per-interval collection graph the marketing page shows, because
 * this pane and the sales pitch had better be the same numbers.
 *
 * Scoped by component deliberately: "is my data fresh" is really "is *this
 * tile's* data fresh", and a flat list of streams makes the reader do the
 * join. A stream two tiles share appears under both, but is fetched once.
 */

const API = process.env.NEXT_PUBLIC_DRYOS_API_URL ?? null;
const POLL_MS = 20_000;
/** Window the per-stream graph audits. Narrower than the landing page's 24h —
 *  a 5-minute feed at panel width is already ten rows of cells at twelve. */
const HOURS = 12;

interface TileUse {
  index: number;
  name: string;
  schemas: Schema[];
}

export function FeedsPanel({
  manifest,
  history,
}: {
  manifest?: ComponentSpec[];
  history: App["history"];
}) {
  const [previews, setPreviews] = useState<Record<string, DatasetPreview>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  // Deferred so server and first client render agree — a clock in the markup
  // is a hydration mismatch waiting to happen.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const schemaById = useMemo(
    () => new Map(SCHEMAS.map((s) => [s.id, s])),
    [],
  );

  /**
   * The tiles and the streams each one reads. A model-edited page has no
   * manifest, so nothing can say which tile reads what — the fallback is the
   * union of every reference its history carries, flat and labelled as such.
   */
  const tiles = useMemo<TileUse[]>(() => {
    const dedupe = (refs: DataRef[]) => {
      const seen = new Set<string>();
      const out: Schema[] = [];
      for (const r of refs) {
        if (seen.has(r.schemaId)) continue;
        seen.add(r.schemaId);
        const s = schemaById.get(r.schemaId);
        if (s) out.push(s);
      }
      return out;
    };

    if (manifest) {
      return manifest.map((spec, index) => ({
        index,
        name:
          spec.custom?.name ?? componentDef(spec.kind)?.name ?? spec.kind,
        schemas: dedupe(spec.refs ?? []),
      }));
    }
    return [
      {
        index: -1,
        name: "This page",
        schemas: dedupe(history.flatMap((r) => r.refs ?? [])),
      },
    ];
  }, [manifest, history, schemaById]);

  /** Every collected dataset on the page, fetched once however many tiles share it. */
  const slugs = useMemo(
    () =>
      [
        ...new Set(
          tiles.flatMap((t) =>
            t.schemas.map((s) => s.dataset).filter((d): d is string => !!d),
          ),
        ),
      ],
    [tiles],
  );

  useEffect(() => {
    if (!API || slugs.length === 0) return;
    let cancelled = false;

    // The first read is unconditional — the pane only mounts because somebody
    // opened it. The visibility guard is for the polls after, so an audit left
    // open in a background tab does not keep asking (the landing page never
    // meets this: its first paint is server-rendered).
    const tick = async (force = false) => {
      if (!force && document.visibilityState !== "visible") return;
      await Promise.all(
        slugs.map(async (slug) => {
          try {
            const res = await fetch(
              `${API}/v1/datasets/${slug}/preview?hours=${HOURS}`,
              { cache: "no-store" },
            );
            if (cancelled) return;
            if (!res.ok) {
              setFailed((f) => ({ ...f, [slug]: true }));
              return;
            }
            const body = (await res.json()) as DatasetPreview;
            if (cancelled) return;
            setFailed((f) => ({ ...f, [slug]: false }));
            setPreviews((p) => ({ ...p, [slug]: body }));
          } catch {
            if (!cancelled) setFailed((f) => ({ ...f, [slug]: true }));
          }
        }),
      );
    };

    void tick(true);
    const poll = () => void tick();
    const id = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [slugs]);

  const empty = tiles.every((t) => t.schemas.length === 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <span className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
          Feeds
        </span>
        <span className="min-w-0 truncate font-mono text-[9.5px] text-faint">
          what each tile reads, and when more arrives
        </span>
      </div>

      <div className="dr-scroll min-h-0 flex-1 overflow-y-auto">
        {!API && (
          <p className="px-3 py-3 text-[12px] text-warn">
            NEXT_PUBLIC_DRYOS_API_URL is not set, so the delivery record cannot
            be read.
          </p>
        )}

        {empty ? (
          <p className="px-3 py-3 text-[12px] text-faint">
            Nothing on this screen queries a stream yet. Place a component and
            its data shows up here, with its delivery record.
          </p>
        ) : (
          <>
            {!manifest && (
              <p className="border-b border-line px-3 py-2 text-[11.5px] text-muted">
                This page was edited by the model, so its data cannot be tied
                to tiles — these are every stream its history references.
              </p>
            )}
            {tiles
              .filter((t) => t.schemas.length > 0)
              .map((t) => (
                <section key={t.index} className="border-b border-line last:border-0">
                  <h3 className="px-3 pt-2.5 pb-1 font-mono text-[10px] tracking-[0.13em] text-faint uppercase">
                    {t.index >= 0 ? `${t.index + 1}. ` : ""}
                    {t.name}
                  </h3>
                  <ul className="pb-1.5">
                    {t.schemas.map((s) => {
                      const key = `${t.index}:${s.id}`;
                      return (
                        <StreamRow
                          key={key}
                          schema={s}
                          preview={s.dataset ? previews[s.dataset] : undefined}
                          unreachable={Boolean(s.dataset && failed[s.dataset])}
                          now={now}
                          open={openKey === key}
                          onToggle={() =>
                            setOpenKey((k) => (k === key ? null : key))
                          }
                        />
                      );
                    })}
                  </ul>
                </section>
              ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ── One stream, in one tile ──────────────────────────────────────────── */

type StreamState = "ok" | "late" | "waiting";

/**
 * Fresh, late, or nothing heard. "Late" is measured the way the landing page
 * measures it: the next interval is overdue by more than the freshness SLA.
 * A forward-looking feed's newest interval is ahead of now, so it reads as
 * fresh however stale the collector is — the same honest limitation the
 * freshness check has everywhere else.
 */
function streamState(p: DatasetPreview | undefined, now: number | null): StreamState {
  if (!p || p.intervals.length === 0 || now === null) return "waiting";
  const last = Date.parse(p.intervals[p.intervals.length - 1].t);
  const due = last + (p.cadenceSeconds ?? 300) * 1000;
  if (due > now) return "ok";
  return (now - due) / 1000 <= p.freshnessSlaSeconds ? "ok" : "late";
}

// The delivery graph's traffic-light colours, not the site tokens — the dot
// and the cells beneath it are the same claim, so they speak the same colour.
// "Waiting" stays neutral: nothing heard yet is not a failure.
const DOT: Record<StreamState, string> = {
  ok: "bg-emerald-500",
  late: "bg-amber-400",
  waiting: "bg-surface-3",
};

function StreamRow({
  schema,
  preview,
  unreachable,
  now,
  open,
  onToggle,
}: {
  schema: Schema;
  preview?: DatasetPreview;
  unreachable: boolean;
  now: number | null;
  open: boolean;
  onToggle: () => void;
}) {
  // A schema with no collector behind it has no delivery record to audit.
  if (!schema.dataset) {
    return (
      <li className="flex items-center gap-2 px-3 py-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full border border-dashed border-info-line" />
        <span className="min-w-0 truncate text-[12px] text-ink">{schema.name}</span>
        <span className="ml-auto shrink-0 rounded border border-dashed border-info-line px-1 font-mono text-[9px] text-info">
          MOCK
        </span>
      </li>
    );
  }

  const state = streamState(preview, now);
  const iv = preview?.intervals ?? [];
  const last = iv.length ? Date.parse(iv[iv.length - 1].t) : null;
  const cadenceMs = (preview?.cadenceSeconds ?? schema.cadence.seconds) * 1000;
  const due = last !== null ? last + cadenceMs : null;
  const expected = preview
    ? Math.max(iv.length, Math.round((preview.hours * 3600 * 1000) / cadenceMs))
    : null;

  return (
    <li>
      <button
        onClick={onToggle}
        className={cx(
          "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-2",
          open && "bg-surface-2",
        )}
      >
        <span className={cx("h-2 w-2 shrink-0 rounded-full", DOT[state])} />
        <span className="min-w-0 truncate text-[12px] text-ink">{schema.name}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-faint">
          {unreachable
            ? "unreachable"
            : last !== null
              ? ago(last, now)
              : "…"}
        </span>
        <span
          className={cx(
            "w-[76px] shrink-0 text-right font-mono text-[10px]",
            state === "late" ? "text-warn" : "text-muted",
          )}
        >
          {countdown(due, now)}
        </span>
      </button>

      {open && (
        <div className="border-y border-line bg-surface-2/40 px-3 py-2.5">
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-faint">
            <span>
              expected <span className="text-ink">{schema.cadence.label}</span>
            </span>
            {expected !== null && (
              <span>
                intervals{" "}
                <span className="text-ink">
                  {iv.length} / {expected}
                </span>{" "}
                last {HOURS}h
              </span>
            )}
            {due !== null && (
              <span>
                next due <span className="text-accent">{countdown(due, now)}</span>
              </span>
            )}
          </div>
          {preview ? (
            <div className="mt-2">
              <CollectionGraph preview={preview} />
            </div>
          ) : (
            <p className="mt-2 text-[11.5px] text-faint">
              {unreachable
                ? "The delivery API did not answer for this stream."
                : "Reading the delivery record…"}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/* ── helpers ──────────────────────────────────────────────────────────── */

/** Time until the next interval is due, or how long it is overdue. */
function countdown(dueMs: number | null, now: number | null): string {
  if (dueMs === null || now === null) return "—";
  const delta = Math.round((dueMs - now) / 1000);
  if (delta <= 0) return `+${fmt(-delta)} over`;
  return `in ${fmt(delta)}`;
}

function ago(thenMs: number, now: number | null): string {
  if (now === null) return "…";
  const s = Math.round((now - thenMs) / 1000);
  // A forward-looking feed's newest interval is in the future — "0s ago"
  // would claim a freshness nobody measured.
  if (s < 0) return `${fmt(-s)} ahead`;
  return `${fmt(s)} ago`;
}

function fmt(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
