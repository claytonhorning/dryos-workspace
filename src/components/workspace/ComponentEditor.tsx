"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, cx } from "@/components/ui";
import { Select } from "@/components/Select";
import { AttachedChip } from "@/components/workspace/DataChip";
import {
  DEFAULT_LAYOUT,
  type ComponentDef,
  type ComponentSpec,
  withDefaults,
} from "@/lib/workspace/components";
import {
  SCHEMAS,
  catalogRefs,
  coverageLabel,
  domainOf,
  mapTreatment,
  refreshCost,
  schemaFor,
  creditChip,
  type DataRef,
} from "@/lib/workspace/catalog";
import { usePreviewHost } from "@/lib/workspace/usePreviewHost";
import { SeriesStyles } from "@/components/workspace/SeriesStyles";
import { readNdjson } from "@/lib/workspace/ndjson";
import { useTheme } from "@/lib/useTheme";

/**
 * Build one component, and watch it while you do.
 *
 * Three ways in, one screen: clicking a shape in the build panel to set it up,
 * clicking a saved component to change it, or a typed sentence that picks a
 * shape and opens here already running. They differ only in what is on screen
 * when it opens, so they are not three screens.
 *
 * It takes the whole sidebar because the preview is the point. Judging whether a
 * chart is the right chart from a settings form is guesswork; judging it from
 * the chart, on today's numbers, is not — so the preview gets the room and the
 * controls sit under it.
 *
 * What is running is the real thing: the same source the dashboard will receive,
 * compiled through the same gate and reading live data through the host. Nothing
 * here is a mock-up of the component, it is the component.
 *
 * The refine box is the only part that spends anything. Everything above it —
 * shape, settings, data — regenerates for free, so the model is reached for only
 * when someone wants something the settings cannot express.
 */
export function ComponentEditor({
  def,
  refs,
  initialAsk,
  initialName,
  initialOptions,
  initialCode,
  onClose,
  onAdd,
  onSave,
  onDelete,
}: {
  def: ComponentDef;
  refs: DataRef[];
  /** A request to run the moment it opens, from the build panel. */
  initialAsk?: string;
  /**
   * What a saved component was saved as — its name, its settings and the source
   * a refinement left behind. Reopening it has to start where it stopped, or
   * "click it to change it" quietly discards the change it was saved for.
   */
  initialName?: string;
  initialOptions?: Record<string, string>;
  initialCode?: string;
  onClose: () => void;
  onAdd: (spec: ComponentSpec) => void;
  onSave: (spec: ComponentSpec) => void;
  /**
   * Take this tile off the screen. Present only when the editor was opened on
   * a tile that is already there — which is also what turns the footer from
   * "where should this go" into "keep it, or remove it".
   */
  onDelete?: () => void;
}) {
  const [options, setOptions] = useState<Record<string, string>>(() =>
    withDefaults(def, initialOptions),
  );
  /*
    The references this component is built from, editable in place.

    Everywhere else the product separates choosing data from choosing a shape,
    and that separation is right: for a chart the refs are all the same kind of
    thing and picking them is a different job from styling them. A map is the
    exception, because each ref becomes a structurally different layer — pins,
    a surface, tracked objects — and they stack. Layers *are* a map's
    composition in a way series are not a chart's, so they are edited here.

    Seeded from the prop and re-seeded when the prop changes identity, which is
    what reopening the editor on a different tile looks like from in here.
  */
  const [layers, setLayers] = useState<DataRef[]>(refs);
  useEffect(() => setLayers(refs), [refs]);
  const [name, setName] = useState(initialName ?? def.name);
  const [code, setCode] = useState<string | null>(initialCode ?? null);
  const [note, setNote] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();
  const started = useRef(false);

  const spec: ComponentSpec = useMemo(
    () => ({
      kind: def.kind,
      refs: layers,
      options,
      layout: DEFAULT_LAYOUT[def.kind],
      custom: code ? { name, code } : undefined,
    }),
    [def.kind, layers, options, code, name],
  );

  // Changing anything above the refine box invalidates a refinement, because the
  // refinement was written against the code those settings produced.
  const set = (key: string, value: string) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
    setCode(null);
    setNote(null);
  };

  const cost = refreshCost(layers);
  // The frame's missing parent — without it every query dies on the timeout.
  const previewFrame = usePreviewHost();
  // Preview-only layout: span the grid and fill the box. `spec` itself keeps
  // the small default, because it is also what "Add to dashboard" places.
  const previewUrl = `/api/workspace/preview?bare=1&theme=${theme}&spec=${encodeURIComponent(
    JSON.stringify({ ...spec, layout: { w: 12, h: 214 } }),
  )}`;

  const refine = useCallback(
    async (override?: string) => {
      const request = (override ?? ask).trim();
      if (!request || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/workspace/component/refine", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: def.kind,
            refs: layers,
            options,
            code,
            ask: request,
          }),
        });
        if (!res.ok && !res.headers.get("content-type")?.includes("ndjson")) {
          const d = await res.json().catch(() => ({}));
          setError(d.error ?? `The server returned ${res.status}.`);
          return;
        }
        await readNdjson(res, (e) => {
          if (e.type === "done") {
            setCode(String(e.code));
            setNote(e.note ? String(e.note) : null);
            setAsk("");
          } else if (e.type === "failed" || e.type === "error") {
            setError(String(e.message));
          }
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "That did not work.");
      } finally {
        setBusy(false);
      }
    },
    [ask, busy, def.kind, layers, options, code],
  );

  /*
    The request that opened this runs once, here, rather than at the call site —
    the editor owns the refine loop and this is the same loop, just with its
    first turn already typed.
  */
  useEffect(() => {
    if (!initialAsk || started.current) return;
    started.current = true;
    setAsk(initialAsk);
    void refine(initialAsk);
  }, [initialAsk, refine]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button
          onClick={onClose}
          className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase hover:text-ink"
        >
          ← Back
        </button>
        <span className="ml-auto font-mono text-[9.5px] text-faint">
          {busy ? "writing…" : code ? "refined" : "generated"} ·{" "}
          {creditChip(cost.perRefresh)}/refresh
        </span>
      </div>

      <div className="dr-scroll min-h-0 flex-1 overflow-y-auto">
        {/* ── The component, running ─────────────────────────────────── */}
        <div className="border-b border-line bg-code p-2">
          <iframe
            ref={previewFrame}
            // Recompiled whenever the spec changes: a stale preview is worse
            // than no preview, because it answers confidently and wrongly.
            key={previewUrl}
            src={previewUrl}
            sandbox="allow-scripts"
            title="Component preview"
            className="h-[260px] w-full rounded border-0 bg-bg"
          />
        </div>

        <div className="p-3">
          <label className="block">
            <span className="font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-line-strong"
            />
          </label>

          {/* ── Settings ─────────────────────────────────────────────── */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {def.options.map((o) => (
              <label key={o.key} className="block">
                <span className="font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
                  {o.label}
                </span>
                <Select
                  value={options[o.key]}
                  onChange={(v) => set(o.key, v)}
                  options={o.choices.map((c) => ({ value: c.value, label: c.label }))}
                  className="mt-1 w-full"
                />
              </label>
            ))}
          </div>

          {/*
            ── How each series is drawn ──────────────────────────────────
            The same control the inline preview carries, for the same reason:
            a tile opened from the screen is the one most likely to need a
            line repainted, and sending someone back to the shelf to change a
            colour would mean rebuilding what they already have.

            Not for a map: its references are layers, not series — the
            measure's declared scale colours the points — and the layer list
            below is the control that actually means something there.
          */}
          {def.kind !== "map" && (
            <div className="mt-3">
              <SeriesStyles
                refs={layers}
                kind={def.kind}
                options={options}
                onChange={(series) => set("series", series)}
              />
            </div>
          )}

          {/* ── Its data ─────────────────────────────────────────────── */}
          {def.kind === "map" ? (
            <MapLayers layers={layers} onChange={setLayers} />
          ) : (
            <div className="mt-3">
              <span className="font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
                Data
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {layers.map((r) => (
                  <AttachedChip key={`${r.snippet}-${r.label}`} refr={r} />
                ))}
              </div>
            </div>
          )}

          {/* ── Refine ───────────────────────────────────────────────── */}
          <div className="mt-4 rounded-md border border-line bg-surface-2 p-2.5">
            <span className="font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
              Change something the settings cannot
            </span>
            <textarea
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void refine();
                }
              }}
              rows={2}
              placeholder="Colour it amber above $50…"
              className="mt-1.5 w-full resize-none bg-transparent text-[12.5px] text-ink outline-none placeholder:text-faint"
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={busy || !ask.trim()}
                onClick={() => refine()}
              >
                {busy ? "Rewriting…" : "Refine"}
              </Button>
              {code && (
                <button
                  onClick={() => {
                    setCode(null);
                    setNote(null);
                  }}
                  className="font-mono text-[10px] text-faint hover:text-ink"
                >
                  revert to generated
                </button>
              )}
            </div>
            {note && (
              <p className="mt-2 text-[12px] leading-snug text-muted">{note}</p>
            )}
            {error && <p className="mt-2 text-[12px] text-warn">{error}</p>}
          </div>
        </div>
      </div>

      {/*
        Two footers, because there are two situations and they are not the same
        question. Building something new asks "where does this go" — onto the
        screen, or into your components for next time. Editing a tile that is
        already on the screen asks neither: it is that tile, so the only things
        to do are keep the change or take the tile off. Offering "add to
        dashboard" there would have added a second copy of the thing being
        edited.
      */}
      <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
        {onDelete ? (
          <>
            <Button tone="primary" size="sm" onClick={() => onAdd(spec)}>
              Save
            </Button>
            <Button size="sm" onClick={onDelete}>
              Delete
            </Button>
          </>
        ) : (
          <>
            <Button tone="primary" size="sm" onClick={() => onAdd(spec)}>
              Add to dashboard
            </Button>
            <Button size="sm" onClick={() => onSave(spec)}>
              Save
            </Button>
          </>
        )}
        <span className={cx("ml-auto font-mono text-[9.5px] text-faint")}>
          ≈{cost.perDay.toLocaleString()} credits/day
        </span>
      </div>
    </div>
  );
}

/**
 * The map's layers: what is on it, and what else could be.
 *
 * Two halves, and the split matters. The top is the composition — the refs this
 * tile already draws, in the order they stack — so it is a list with removal and
 * reordering rather than a row of chips, because order is meaningful on a map in
 * a way it is not on a chart.
 *
 * The bottom is what can be added, and the filter is **drawability, never
 * domain**. Grouping is by domain, which is a different thing: the most useful
 * map in this product puts a wind field under price pins, and a picker scoped to
 * "the domain I am in" would forbid exactly the cross-domain join that makes
 * collecting weather beside ERCOT worth doing. Domain is a heading. It is not a
 * gate.
 *
 * Coverage is stated wherever it is partial. ERCOT publishes a price against a
 * name and no coordinate, so a nodal layer can only place the entities
 * `geo.ts` knows or `geoMock` invents — and "3 of 9 have known locations" is a
 * fact somebody can act on, where a layer that quietly drew a third of itself is
 * just wrong on screen with no way to tell.
 */
export function MapLayers({
  layers,
  onChange,
}: {
  layers: DataRef[];
  onChange: (next: DataRef[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  const move = (i: number, by: number) => {
    const next = [...layers];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  /*
    Every stream the map could draw, minus the ones already on it, grouped by
    domain. Built from the schema-level refs so an added layer is the same shape
    of reference the explorer produces — a browsed layer and a picked one have to
    be indistinguishable downstream or the revision replays differently.
  */
  const available = useMemo(() => {
    const on = new Set(layers.map((r) => r.schemaId));
    const rows = catalogRefs()
      .filter((r) => r.kind === "schema" && !on.has(r.schemaId))
      .map((r) => {
        const schema = SCHEMAS.find((s) => s.id === r.schemaId);
        const t = schema ? mapTreatment(schema) : null;
        return t && schema ? { ref: r, schema, t } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const byDomain = new Map<string, typeof rows>();
    for (const row of rows) {
      const d = domainOf(row.schema);
      byDomain.set(d, [...(byDomain.get(d) ?? []), row]);
    }
    return [...byDomain.entries()];
  }, [layers]);

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
          Layers
        </span>
        <span className="text-[10px] text-faint">drawn bottom to top</span>
      </div>

      <div className="mt-1.5 flex flex-col gap-1">
        {layers.map((r, i) => {
          const schema = schemaFor(r.schemaId);
          const t = schema ? mapTreatment(schema) : null;
          return (
            <div
              key={`${r.schemaId}-${r.label}-${i}`}
              className="flex items-center gap-1.5 rounded border border-line bg-surface-2 px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-ink">{r.label}</div>
                <div className="truncate text-[10px] text-faint">
                  {r.path}
                  {t ? ` · ${coverageLabel(t)}` : " · not mappable"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move down the stack"
                  className="rounded px-1 text-[11px] text-muted transition-colors hover:text-accent disabled:opacity-25 disabled:hover:text-muted"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === layers.length - 1}
                  aria-label="Move up the stack"
                  className="rounded px-1 text-[11px] text-muted transition-colors hover:text-accent disabled:opacity-25 disabled:hover:text-muted"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onChange(layers.filter((_, j) => j !== i))}
                  aria-label={`Remove ${r.label}`}
                  className="rounded px-1 text-[11px] text-muted transition-colors hover:text-fail"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
        {layers.length === 0 && (
          <p className="rounded border border-dashed border-line px-2 py-2 text-[11px] text-faint">
            No layers. A map with nothing on it draws Texas and no more.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setAdding((v) => !v)}
        className="mt-1.5 w-full rounded border border-dashed border-line py-1.5 text-[11px] text-muted transition-colors hover:border-accent-line hover:text-accent"
      >
        {adding ? "Close" : "+ Add a layer"}
      </button>

      {adding && (
        <div className="mt-1.5 max-h-64 overflow-y-auto rounded border border-line bg-surface-2 p-1.5">
          {available.length === 0 && (
            <p className="px-1 py-2 text-[11px] text-faint">
              Everything the map can draw is already on it.
            </p>
          )}
          {available.map(([domain, rows]) => (
            <div key={domain} className="mb-1.5 last:mb-0">
              <div className="px-1 pb-1 font-mono text-[9px] tracking-[0.13em] text-faint uppercase">
                {domain}
              </div>
              {rows.map(({ ref, t }) => (
                <button
                  key={ref.schemaId}
                  type="button"
                  onClick={() => {
                    onChange([...layers, ref]);
                    setAdding(false);
                  }}
                  className="block w-full rounded px-1.5 py-1 text-left transition-colors hover:bg-surface-3"
                >
                  <div className="truncate text-[11.5px] text-ink">{ref.label}</div>
                  <div className="truncate text-[10px] text-faint">
                    {coverageLabel(t)}
                    {t.invented && " · demonstration only"}
                    {" · "}
                    {creditChip(ref.tokens)}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
