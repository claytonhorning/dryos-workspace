"use client";

import { useMemo, useState } from "react";
import {
  SCHEMAS,
  catalogRefs,
  coverageLabel,
  creditChip,
  domainOf,
  mapTreatment,
  pinStreams,
  schemaFor,
  type DataRef,
} from "@/lib/workspace/catalog";
import { PIN_LAYER_WHY, pinsAgree } from "@/lib/workspace/components";

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
 * name and no coordinate, so a nodal layer can only place the entities the
 * API's reference table reaches or `geo.ts` knows — and "698 of 1,118 have
 * known locations" is a fact somebody can act on, where a layer that quietly
 * drew two thirds of itself is just wrong on screen with no way to tell.
 */
export function MapLayers({
  layers,
  onChange,
}: {
  layers: DataRef[];
  /**
   * Absent, the list only says what is there — a published map brings its
   * own layers and a preview of it is not the place to change them.
   */
  onChange?: (next: DataRef[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const editable = onChange !== undefined;
  /** The streams already drawn as pins — another joins only if `pinsAgree`. */
  const pinsOn = useMemo(() => pinStreams(layers), [layers]);

  const move = (i: number, by: number) => {
    const next = [...layers];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange?.(next);
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

    /*
      The map draws one measure of pins — see `pinsAgree` — so once one is
      on, every stream of pins that reads another is out. They are listed
      rather than hidden, since hidden reads as "not mappable", but listed
      *once*, under the reason, as names: fifteen greyed rows each repeating
      the sentence buried the one live row — the wind field — under it.
    */
    const blocked = rows.filter(
      (row) =>
        row.t.how === "pins" &&
        pinsOn.length > 0 &&
        !pinsOn.includes(row.ref.schemaId) &&
        !pinsAgree([...layers, row.ref]),
    );
    const open = rows.filter((row) => !blocked.includes(row));

    const byDomain = new Map<string, typeof rows>();
    for (const row of open) {
      const d = domainOf(row.schema);
      byDomain.set(d, [...(byDomain.get(d) ?? []), row]);
    }
    return { open: [...byDomain.entries()], blocked };
  }, [layers, pinsOn]);

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
              {editable && (
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
                    onClick={() => onChange?.(layers.filter((_, j) => j !== i))}
                    aria-label={`Remove ${r.label}`}
                    className="rounded px-1 text-[11px] text-muted transition-colors hover:text-fail"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {layers.length === 0 && (
          <p className="rounded border border-dashed border-line px-2 py-2 text-[11px] text-faint">
            No layers. A map with nothing on it draws Texas and no more.
          </p>
        )}
      </div>

      {editable && (
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="mt-1.5 w-full rounded border border-dashed border-line py-1.5 text-[11px] text-muted transition-colors hover:border-accent-line hover:text-accent"
        >
          {adding ? "Close" : "+ Add a layer"}
        </button>
      )}

      {editable && adding && (
        <div className="mt-1.5 max-h-64 overflow-y-auto rounded border border-line bg-surface-2 p-1.5">
          {available.open.length === 0 &&
            available.blocked.length === 0 && (
              <p className="px-1 py-2 text-[11px] text-faint">
                Everything the map can draw is already on it.
              </p>
            )}
          {available.open.map(([domain, rows]) => (
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
                    {" · "}
                    {creditChip(ref.tokens)}
                  </div>
                </button>
              ))}
            </div>
          ))}
          {available.blocked.length > 0 && (
            <div className="mt-1.5 border-t border-line pt-1.5">
              <div className="px-1 pb-1 font-mono text-[9px] tracking-[0.13em] text-faint uppercase">
                One measure of pins per map
              </div>
              <p className="px-1 pb-1 text-[10px] leading-snug text-faint">
                {PIN_LAYER_WHY} Take{" "}
                {layers.find((r) => pinsOn.includes(r.schemaId))?.label ??
                  "the current one"}{" "}
                off to draw one of these instead:
              </p>
              <p className="px-1 text-[10.5px] leading-snug text-muted opacity-60">
                {available.blocked.map((row) => row.ref.label).join(" · ")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
