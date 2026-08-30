"use client";

import { useEffect, useMemo, useState } from "react";
import { cx } from "@/components/ui";
import { DataChip, MetaBadges } from "@/components/workspace/DataChip";
import {
  SCHEMAS,
  type DataRef,
  type Schema,
  categories,
  categoryOf,
  catalogRefs,
  domainOf,
  domains,
  entityCountLabel,
  entityRef,
} from "@/lib/workspace/catalog";
import { entityNote } from "@/lib/workspace/entityNotes";

/**
 * The data explorer: two levels, one panel, no modal.
 *
 * Level one is the catalogue — every stream, grouped by category, each with
 * its count, because the size of a set is the fact that decides the gesture.
 * A stream small enough to read is taken whole with one click, exactly as
 * before. A stream of a thousand entities is a question, so clicking it
 * navigates *into* the set instead of guessing an entity.
 *
 * Level two is the set: its tiers as chips (hubs, load zones — derived from
 * the data, not declared), the entities under the active tier with their
 * meanings and coverage, and search over the rest. A tier small enough to
 * read can be taken whole too — the same rule, one level down.
 *
 * The selection outlives the navigation. The best questions span sets — a
 * spread needs a pick from two streams — so chips accumulate globally and the
 * footer counts them wherever you are.
 */
const ALL = "All";

export function DataExplorer({
  selected,
  onToggle,
}: {
  selected: DataRef[];
  onToggle: (ref: DataRef) => void;
}) {
  const all = useMemo(() => domains(), []);
  const [domain, setDomain] = useState(all[0] ?? "Energy");
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState("");
  /** The set being read at level two, or null for the catalogue. */
  const [drill, setDrill] = useState<Schema | null>(null);

  const refs = useMemo(() => catalogRefs(), []);
  const cats = useMemo(() => [ALL, ...categories(domain)], [domain]);

  const chosen = useMemo(
    () => new Set(selected.map((r) => `${r.snippet}::${r.label}`)),
    [selected],
  );

  // One card per stream. The card is the stream; what is inside it is the
  // set view's business.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SCHEMAS.filter(
      (s) =>
        domainOf(s) === domain &&
        (category === ALL || categoryOf(s) === category) &&
        (!q ||
          s.name.toLowerCase().includes(q) ||
          s.path.join(" ").toLowerCase().includes(q) ||
          s.variables.some(
            (v) =>
              v.label.toLowerCase().includes(q) ||
              v.key.toLowerCase().includes(q) ||
              v.unit.toLowerCase().includes(q),
          )),
    ).map((schema) => ({
      schema,
      streamRef: refs.find((r) => r.schemaId === schema.id && r.kind === "schema"),
    }));
  }, [refs, domain, category, query]);

  const shown = groups.length;

  if (drill) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
        <SetView
          schema={drill}
          selected={selected}
          chosen={chosen}
          onToggle={onToggle}
          onBack={() => setDrill(null)}
        />
        <p className="border-t border-line px-3 py-1.5 font-mono text-[9.5px] text-faint">
          {selected.length > 0
            ? `${selected.length} selected · picks from other sets are kept`
            : "Pick entities, then drag a component onto the page"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
          Data
        </span>

        <select
          value={domain}
          onChange={(e) => {
            setDomain(e.target.value);
            setCategory(ALL);
          }}
          aria-label="Domain"
          className="ml-auto rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px] text-ink outline-none focus:border-line-strong"
        >
          {all.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2 border-b border-line px-2.5 py-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter — load, spread, $/MWh…"
          className="w-full rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
        />
        <div className="dr-scroll flex gap-1 overflow-x-auto">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cx(
                "shrink-0 rounded-full border px-2.5 py-[3px] text-[11.5px] transition-colors",
                c === category
                  ? "border-accent-line bg-accent-dim text-accent"
                  : "border-line text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="dr-scroll min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        {shown === 0 ? (
          <p className="px-0.5 py-3 text-[12.5px] text-faint">
            Nothing in {domain} matches “{query}”.
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.schema.id} className="mb-3 last:mb-0">
              <h3 className="flex items-baseline px-0.5 pb-1.5 font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
                {g.schema.path.slice(1).join(" › ")}
                <span className="ml-auto normal-case tracking-normal text-muted">
                  {entityCountLabel(g.schema)}
                </span>
              </h3>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {/* A stream with entities opens; one with a single series has
                    nothing to choose, so its card selects directly. Same card,
                    same height — only the affordance differs. */}
                {hasEntities(g.schema) ? (
                  <DrillRow
                    schema={g.schema}
                    picked={countPicked(selected, g.schema)}
                    onOpen={() => setDrill(g.schema)}
                  />
                ) : (
                  g.streamRef && (
                    <DataChip
                      refr={g.streamRef}
                      selected={chosen.has(
                        `${g.streamRef.snippet}::${g.streamRef.label}`,
                      )}
                      onClick={() => onToggle(g.streamRef!)}
                    />
                  )
                )}
              </div>
            </section>
          ))
        )}
      </div>

      <p className="border-t border-line px-3 py-1.5 font-mono text-[9.5px] text-faint">
        {selected.length > 0
          ? `${selected.length} selected · click again to remove`
          : "Click a box to select it, then drag a component onto the page"}
      </p>
    </div>
  );
}

/** A stream with more than one entity has something to choose. */
function hasEntities(schema: Schema): boolean {
  return Boolean(schema.dataset) && schema.entities.count > 1;
}

/** Entities picked from this stream, for the card's badge. */
function countPicked(selected: DataRef[], schema: Schema): number {
  return selected.filter(
    (r) =>
      r.schemaId === schema.id && (r.kind === "entity" || r.kind === "schema"),
  ).length;
}

/**
 * A large stream on the shelf — the same card as every other stream, because
 * a row among cards read as a lesser thing rather than a different gesture.
 * Only the affordance differs: `›` where a selectable card would tick.
 */
function DrillRow({
  schema,
  picked,
  onOpen,
}: {
  schema: Schema;
  picked: number;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="group flex w-full flex-col gap-0.5 rounded border border-line bg-surface-2 px-2 py-1.5 text-left transition-colors hover:border-accent-line"
    >
      <span className="flex items-center gap-1.5">
        <span className="truncate font-mono text-[11px] text-ink">
          {schema.name}
        </span>
        {picked > 0 && (
          <span className="shrink-0 rounded-full border border-accent-line bg-accent-dim px-1.5 py-px font-mono text-[9px] text-accent">
            {picked} picked
          </span>
        )}
        <span className="ml-auto shrink-0 text-[11px] text-faint group-hover:text-ink">
          ›
        </span>
      </span>
      <span className="truncate font-mono text-[9.5px] text-faint">
        {entityCountLabel(schema)} · choose which
      </span>
      <MetaBadges cadence={schema.cadence.label} tokens={schema.tokens} />
    </button>
  );
}

interface EntityRow {
  node: string;
  nodeType: string | null;
  observations: number;
}

/**
 * Level two: one set, opened.
 *
 * The tiers come back from the data (`facets` on the nodes API), and the same
 * size rule applies one level down: a tier of seven hubs gets an "add all"
 * because seven is a chart, while the resource-node tier stays search-only.
 * The view opens on the smallest meaningful tier rather than on an
 * alphabetical slice of a thousand — the hubs are what people came for, and
 * burying them under A-through-G resource nodes helps nobody.
 */
function SetView({
  schema,
  selected,
  chosen,
  onToggle,
  onBack,
}: {
  schema: Schema;
  selected: DataRef[];
  chosen: Set<string>;
  onToggle: (ref: DataRef) => void;
  onBack: () => void;
}) {
  const [q, setQ] = useState("");
  const [facet, setFacet] = useState<string | null>(null);
  // Which measure a picked entity refers to. Most streams have one; the rest
  // get a radio, because "wind actual" and "wind forecast" are different picks.
  const [varKey, setVarKey] = useState(schema.variables[0]?.key);
  // The whole stream as one reference — the fan-out pick, for streams small
  // enough to take whole. It stays live as entities come and go at the source.
  const streamRef = useMemo(
    () => catalogRefs().find((r) => r.schemaId === schema.id && r.kind === "schema"),
    [schema.id],
  );
  const [facets, setFacets] = useState<Record<string, number> | null>(null);
  const [rows, setRows] = useState<EntityRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const url = new URL("/api/workspace/entities", window.location.origin);
        url.searchParams.set("dataset", schema.dataset!);
        if (q.trim()) url.searchParams.set("q", q.trim());
        if (facet && !q.trim()) url.searchParams.set("node_type", facet);
        url.searchParams.set("limit", "24");
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok) {
          setRows([]);
          return;
        }
        setRows(json.nodes ?? []);
        if (json.facets && !opened) {
          setFacets(json.facets);
          // Open on the smallest readable tier — the hubs, not an
          // alphabetical slice of the resource nodes.
          const tiers = Object.entries(json.facets as Record<string, number>)
            .filter(([, n]) => n > 1 && n <= 12)
            .sort((a, b) => a[1] - b[1]);
          if (tiers[0]) setFacet(tiers[0][0]);
          setOpened(true);
        }
      } catch {
        setRows([]);
      } finally {
        setBusy(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [schema.dataset, q, facet, opened]);

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button
          onClick={onBack}
          className="shrink-0 rounded border border-line px-1.5 py-[3px] text-[11px] text-muted hover:border-line-strong hover:text-ink"
        >
          ‹ All data
        </button>
        <span className="truncate text-[12.5px] text-ink">{schema.name}</span>
        <span className="ml-auto shrink-0 font-mono text-[9.5px] text-faint">
          {entityCountLabel(schema)}
        </span>
      </div>

      <div className="flex flex-col gap-2 border-b border-line px-2.5 py-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${entityCountLabel(schema)}…`}
          className="w-full rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
        />
        {schema.variables.length > 1 && (
          <div className="dr-scroll flex gap-1 overflow-x-auto">
            {schema.variables.map((v) => (
              <button
                key={v.key}
                onClick={() => setVarKey(v.key)}
                className={cx(
                  "shrink-0 rounded-full border px-2.5 py-[3px] text-[10.5px] transition-colors",
                  v.key === varKey
                    ? "border-accent-line bg-accent-dim text-accent"
                    : "border-line text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
        {facets && !q.trim() && (
          <div className="dr-scroll flex gap-1 overflow-x-auto">
            {Object.entries(facets)
              .sort((a, b) => a[1] - b[1])
              .map(([kind, n]) => (
                <button
                  key={kind}
                  onClick={() => setFacet(facet === kind ? null : kind)}
                  className={cx(
                    "shrink-0 rounded-full border px-2.5 py-[3px] font-mono text-[10.5px] transition-colors",
                    kind === facet
                      ? "border-accent-line bg-accent-dim text-accent"
                      : "border-line text-muted hover:border-line-strong hover:text-ink",
                  )}
                >
                  {kind} · {n.toLocaleString()}
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="dr-scroll min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        {schema.entityKey && streamRef && (
          <button
            onClick={() => onToggle(streamRef)}
            className={cx(
              "mb-1.5 w-full rounded-md border px-2.5 py-1.5 text-left text-[11.5px] transition-colors",
              chosen.has(`${streamRef.snippet}::${streamRef.label}`)
                ? "border-accent-line bg-accent-dim text-accent"
                : "border-dashed border-accent-line text-accent hover:bg-accent-dim",
            )}
          >
            {chosen.has(`${streamRef.snippet}::${streamRef.label}`) ? "✓ " : ""}
            All {schema.entities.count} as one selection — stays current as the
            set changes
          </button>
        )}

        {busy && rows.length === 0 ? (
          <p className="px-1 py-1.5 text-[11.5px] text-faint">Searching…</p>
        ) : rows.length === 0 ? (
          <p className="px-1 py-1.5 text-[11.5px] text-faint">
            Nothing matches “{q}”.
          </p>
        ) : (
          rows.map((row) => {
            const ref = entityRef(schema, row.node, varKey);
            const picked = chosen.has(`${ref.snippet}::${ref.label}`);
            const note = entityNote(row.node);
            return (
              <button
                key={row.node}
                onClick={() => onToggle(ref)}
                className={cx(
                  "flex w-full flex-col gap-0.5 rounded px-1.5 py-1.5 text-left transition-colors",
                  picked ? "bg-accent-dim" : "hover:bg-surface-2",
                )}
              >
                <span className="flex w-full items-baseline gap-2">
                  <span
                    className={cx(
                      "font-mono text-[12px]",
                      picked ? "text-accent" : "text-ink",
                    )}
                  >
                    {row.node}
                  </span>
                  {row.nodeType && (
                    <span className="text-[10px] text-faint">{row.nodeType}</span>
                  )}
                  <span className="ml-auto font-mono text-[10px] text-faint">
                    {row.observations.toLocaleString()} obs
                  </span>
                </span>
                {note && (
                  <span className="text-[11px] leading-snug text-muted">
                    {note}
                  </span>
                )}
              </button>
            );
          })
        )}
        {!q.trim() && facet == null && (
          <p className="px-1 pt-1.5 text-[10.5px] text-faint">
            Showing the first {rows.length} alphabetically — search or pick a
            tier to narrow.
          </p>
        )}
      </div>
    </>
  );
}
