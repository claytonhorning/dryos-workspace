"use client";

import { useEffect, useMemo, useState } from "react";
import { cx } from "@/components/ui";
import { DataChip } from "@/components/workspace/DataChip";
import {
  SCHEMAS,
  type DataRef,
  type Schema,
  categories,
  categoryOf,
  catalogRefs,
  domainOf,
  domainSummary,
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
  const summary = useMemo(() => domainSummary(domain), [domain]);

  const chosen = useMemo(
    () => new Set(selected.map((r) => `${r.snippet}::${r.label}`)),
    [selected],
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SCHEMAS.filter((s) => domainOf(s) === domain)
      .map((schema) => ({
        schema,
        refs: refs.filter(
          (r) =>
            r.schemaId === schema.id &&
            (category === ALL || categoryOf(schema) === category) &&
            (!q ||
              r.label.toLowerCase().includes(q) ||
              r.path.toLowerCase().includes(q) ||
              (r.sublabel ?? "").toLowerCase().includes(q)),
        ),
      }))
      .filter((g) => g.refs.length > 0);
  }, [refs, domain, category, query]);

  const shown = groups.reduce((n, g) => n + g.refs.length, 0);

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
        <span className="font-mono text-[9.5px] text-faint">
          {summary.live} live · {summary.total - summary.live} mock
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
                  {g.schema.entityKey
                    ? `all ${entityCountLabel(g.schema)}`
                    : entityCountLabel(g.schema)}
                </span>
              </h3>
              {needsPicking(g.schema) ? (
                <DrillRow
                  schema={g.schema}
                  picked={
                    selected.filter(
                      (r) => r.kind === "entity" && r.schemaId === g.schema.id,
                    ).length
                  }
                  onOpen={() => setDrill(g.schema)}
                />
              ) : (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {g.refs.map((r) => (
                    <DataChip
                      key={`${r.snippet}-${r.label}`}
                      refr={r}
                      selected={chosen.has(`${r.snippet}::${r.label}`)}
                      onClick={() => onToggle(r)}
                    />
                  ))}
                </div>
              )}
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

/**
 * The size of the set decides the gesture. A stream that fans out takes
 * everything by default — eight fuels is a chart. A stream of a thousand
 * settlement points is a question, so it opens instead of selecting.
 */
function needsPicking(schema: Schema): boolean {
  return Boolean(schema.dataset) && !schema.entityKey && schema.entities.count > 12;
}

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
      className="flex w-full items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-2 text-left transition-colors hover:border-line-strong"
    >
      <div className="min-w-0">
        <div className="truncate text-[12.5px] text-ink">{schema.name}</div>
        <div className="truncate text-[10.5px] text-faint">
          {entityCountLabel(schema)} — open to choose which
        </div>
      </div>
      {picked > 0 && (
        <span className="ml-auto shrink-0 rounded-full border border-accent-line bg-accent-dim px-2 py-[2px] font-mono text-[10px] text-accent">
          {picked} picked
        </span>
      )}
      <span className={cx("shrink-0 text-faint", picked > 0 ? "" : "ml-auto")}>
        ›
      </span>
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
  const [facets, setFacets] = useState<Record<string, number> | null>(null);
  const [rows, setRows] = useState<EntityRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);

  const mine = selected.filter(
    (r) => r.kind === "entity" && r.schemaId === schema.id,
  );

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

  const activeCount = facet && facets ? facets[facet] : schema.entities.count;
  const addableAll =
    facet != null && activeCount != null && activeCount <= 12 && !q.trim();

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
        {mine.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {mine.map((r) => (
              <button
                key={r.label}
                onClick={() => onToggle(r)}
                title="Remove"
                className="rounded-full border border-accent-line bg-accent-dim px-2 py-[2px] font-mono text-[10.5px] text-accent"
              >
                {r.label} ✕
              </button>
            ))}
          </div>
        )}

        {addableAll && (
          <button
            onClick={() => {
              for (const row of rows) {
                const ref = entityRef(schema, row.node);
                if (!chosen.has(`${ref.snippet}::${ref.label}`)) onToggle(ref);
              }
            }}
            className="mb-1.5 w-full rounded-md border border-dashed border-accent-line px-2.5 py-1.5 text-left text-[11.5px] text-accent transition-colors hover:bg-accent-dim"
          >
            Add all {activeCount} — a set this size is a chart
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
            const ref = entityRef(schema, row.node);
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
