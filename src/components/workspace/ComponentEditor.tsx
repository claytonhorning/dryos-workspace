"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui";
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
  schemaFor,
  creditChip,
  type DataRef,
} from "@/lib/workspace/catalog";
import { usePreviewHost } from "@/lib/workspace/usePreviewHost";
import { previewLayout, PreviewPane } from "@/components/workspace/BuildPanel";
import { DataExplorer } from "@/components/workspace/DataExplorer";
import { SelectionStrip } from "@/components/workspace/DataChip";
import { useTheme } from "@/lib/useTheme";
import { useTimeZone } from "@/lib/useTimeZone";

/**
 * Edit one component that is already on the screen.
 *
 * It renders the build shelf's own `PreviewPane` — settings, series, the
 * running component — because building a component and changing one are the
 * same activity, and two layouts for it made each other harder to learn. The
 * differences are only what the situation actually changes: creating ends in a
 * drag (the drop says where it lands), while a tile being edited already has a
 * place, so here the preview is just the preview and the footer asks the only
 * open question — keep the change, or take the tile off.
 *
 * What is running is the real thing: the same source the dashboard will
 * receive, compiled through the same gate and reading live data through the
 * host. Nothing here is a mock-up of the component, it is the component.
 */
export function ComponentEditor({
  def,
  refs,
  initialName,
  initialOptions,
  initialCode,
  onClose,
  onAdd,
  onSave,
  onDelete,
  onDuplicate,
  initialDomain,
}: {
  def: ComponentDef;
  refs: DataRef[];
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
  /**
   * Stage a copy of this tile over the canvas, as the editor currently shows
   * it. Nothing is created yet: the copy hovers over a dimmed canvas, and
   * grabbing it enters the ordinary drag-ghost-drop — the drop says where,
   * and letting go anywhere else costs nothing.
   */
  onDuplicate?: (spec: ComponentSpec) => void;
  /** The workspace's subject, for the explorer to open on. */
  initialDomain?: string;
}) {
  const [options, setOptions] = useState<Record<string, string>>(() =>
    withDefaults(def, initialOptions),
  );
  /*
    The references this component is built from, editable in place for a map.

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
  // Carried for the spec (a refined component keeps its name), not shown as a
  // field — a tile's title is generated, and a rename box here named nothing.
  const name = initialName ?? def.name;
  const [code, setCode] = useState<string | null>(initialCode ?? null);
  const theme = useTheme();
  const tzPref = useTimeZone();
  /*
    The same two stages the build panel takes: choose what, then choose how.
    Editing opens on the preview because the tile already has data — but the
    data is not sealed in. "Data ›" flips the pane to the same explorer the
    create path uses, seeded with this tile's references, so adding a series
    to an existing chart is the gesture it was when the chart was made.
  */
  const [stage, setStage] = useState<"preview" | "data">("preview");

  const toggleRef = (ref: DataRef) => {
    const same = (r: DataRef) =>
      r.snippet === ref.snippet && r.label === ref.label;
    setLayers((prev) =>
      prev.some(same) ? prev.filter((r) => !same(r)) : [...prev, ref],
    );
    // Data is part of what a refinement was written against.
    setCode(null);
  };

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

  // A settings change drops frozen source, because a refinement was written
  // against the code the old settings produced — regenerated, the component
  // follows the settings again.
  const set = (key: string, value: string) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
    setCode(null);
  };

  // Frozen source already passed the gate with these refs; only a regenerated
  // component has to answer to `accepts` again.
  const verdict: { ok: boolean; why?: string } = code
    ? { ok: true }
    : def.accepts(layers);

  // The frame's missing parent — without it every query dies on the timeout.
  const previewFrame = usePreviewHost();
  // Preview-only layout: span the grid and fill the box. `spec` itself keeps
  // the small default, because it is also what a save places.
  const previewUrl = `/api/workspace/preview?bare=1&naked=1&theme=${theme}&tz=${encodeURIComponent(tzPref)}&spec=${encodeURIComponent(
    JSON.stringify({ ...spec, layout: previewLayout(def.kind) }),
  )}`;

  /*
    The two stages wear exactly the create path's clothes, because they are the
    create path's stages. Data: the explorer takes the whole column, and its
    own "Next ›" is the way back. Preview: the selection sits above the pane in
    the same bordered strip the build step uses — the "‹ Data" way back, the
    count, the chips removable in place — and the editor is its own box below,
    the way the build panel is. One layout for one activity; the editor being
    arranged differently was only ever a thing to relearn.
  */
  if (stage === "data") {
    return (
      <div className="h-full min-h-0">
        <DataExplorer
          initialDomain={initialDomain}
          selected={layers}
          onToggle={toggleRef}
          onClear={() => {
            setLayers([]);
            setCode(null);
          }}
          verdict={verdict}
          onNext={() => setStage("preview")}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-col gap-1.5 rounded-lg border border-line bg-surface px-3 py-2">
        <button
          onClick={() => setStage("data")}
          className="flex items-center gap-2 text-left text-[12px] text-muted transition-colors hover:text-ink"
        >
          ‹ Data
          <span className="font-mono text-[10px] text-faint">
            {layers.length} selected
          </span>
        </button>
        <SelectionStrip
          selected={layers}
          onRemove={toggleRef}
          onClear={() => {
            setLayers([]);
            setCode(null);
          }}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <button
            onClick={onClose}
            className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase hover:text-ink"
          >
            ← Back
          </button>
          <span className="ml-auto truncate font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
            {name}
          </span>
          {/*
            Duplicate lives up here, beside the tile's name, not in the footer:
            the footer is the tile's own verdict (keep the change, take it off,
            or walk away), and a copy is none of those — it acts on the canvas.
            Same quiet voice as Back, so it reads as a thing the header offers
            rather than a fourth answer to the footer's question.
          */}
          {onDuplicate && (
            <button
              onClick={() => onDuplicate(spec)}
              className="shrink-0 font-mono text-[10px] tracking-[0.14em] text-faint uppercase hover:text-ink"
            >
              Duplicate
            </button>
          )}
        </div>

        <PreviewPane
          def={def}
          refs={layers}
          live={verdict.ok}
          why={verdict.why}
          tunable={!code}
          options={options}
          onOption={set}
          src={previewUrl}
          // Keyed by the URL, which is the spec: a settings change reloads
          // the real thing rather than mutating a stale frame.
          frameKey={previewUrl}
          frameRef={previewFrame}
          layersEditor={
            def.kind === "map" ? (
              <MapLayers layers={layers} onChange={setLayers} />
            ) : undefined
          }
        />

        {/*
          Two footers, because there are two situations and they are not the
          same question. Building something new asks "where does this go" —
          onto the screen, or into your components for next time. Editing a
          tile that is already on the screen asks: keep the change, take the
          tile off, or walk away. Cancel alone at the left — it is the one
          that changes nothing — and the tile's own pair at the right, the
          way a dialog ends. Remove wears `danger` like every other control
          that takes something away: it is the one act here that is not
          undone by pressing the other button.
        */}
        <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
          {onDelete ? (
            <>
              <Button size="sm" onClick={onClose}>
                Cancel
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Button tone="danger" size="sm" onClick={onDelete}>
                  Remove
                </Button>
                <Button tone="primary" size="sm" onClick={() => onAdd(spec)}>
                  Save
                </Button>
              </div>
            </>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" onClick={() => onSave(spec)}>
                Save
              </Button>
              <Button tone="primary" size="sm" onClick={() => onAdd(spec)}>
                Add to dashboard
              </Button>
            </div>
          )}
        </div>
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
