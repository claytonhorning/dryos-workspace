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
  entityRef,
} from "@/lib/workspace/catalog";

/**
 * The data explorer: everything there is, two levels down, one click from a page.
 *
 * Domain and category are different kinds of decision, so they get different
 * controls. The domain — Energy, Weather, Aviation — is the subject you work in;
 * you choose it once and leave it, so it sits in a select at the top right where
 * a setting belongs. The category is what you flick between inside that subject,
 * so those are chips.
 *
 * Every box is the same `DataRef` a tool call produced, so nothing downstream
 * knows the difference. Selecting one carries it to the component tray beside
 * this, which is the only thing that does anything with data.
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
          placeholder="Filter — altitude, load, $/MWh…"
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
                {/* How much is in the set — the fact that decides whether a
                    chart takes all of it or asks which. */}
                <span className="ml-auto normal-case tracking-normal text-muted">
                  {g.schema.entityKey
                    ? `all ${g.schema.entities.count} ${g.schema.entities.label}`
                    : `${g.schema.entities.count.toLocaleString()} ${g.schema.entities.label}`}
                </span>
              </h3>
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
              {needsPicking(g.schema) && (
                <EntityPicker
                  schema={g.schema}
                  selected={selected}
                  chosen={chosen}
                  onToggle={onToggle}
                />
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
 * The size of the set decides the gesture. A stream that fans out (an
 * `entityKey`) takes everything by default — eight fuels is a chart. A stream
 * of a thousand settlement points is a question, so it gets a picker instead:
 * which ones do you mean?
 */
function needsPicking(schema: Schema): boolean {
  return Boolean(schema.dataset) && !schema.entityKey && schema.entities.count > 12;
}

function EntityPicker({
  schema,
  selected,
  chosen,
  onToggle,
}: {
  schema: Schema;
  selected: DataRef[];
  chosen: Set<string>;
  onToggle: (ref: DataRef) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<
    { node: string; nodeType: string | null; observations: number }[]
  >([]);
  const [busy, setBusy] = useState(false);

  // What is already picked from this stream, so it can be reviewed and
  // removed without re-finding it in the search results.
  const mine = selected.filter(
    (r) => r.kind === "entity" && r.schemaId === schema.id,
  );

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const url = new URL("/api/workspace/entities", window.location.origin);
        url.searchParams.set("dataset", schema.dataset!);
        if (q.trim()) url.searchParams.set("q", q.trim());
        const res = await fetch(url);
        const json = await res.json();
        setRows(res.ok ? (json.nodes ?? []) : []);
      } catch {
        setRows([]);
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [open, q, schema.dataset]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-1.5 w-full rounded-md border border-dashed border-line px-2.5 py-1.5 text-left text-[11.5px] text-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        Pick from {schema.entities.count.toLocaleString()} {schema.entities.label}…
        {mine.length > 0 && (
          <span className="ml-1.5 text-accent">{mine.length} picked</span>
        )}
      </button>
    );
  }

  return (
    <div className="mt-1.5 rounded-md border border-line bg-surface-2 p-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${schema.entities.count.toLocaleString()} ${schema.entities.label}…`}
          className="w-full rounded border border-line bg-surface px-2 py-1 text-[12px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
        />
        <button
          onClick={() => setOpen(false)}
          className="shrink-0 rounded border border-line px-1.5 py-1 text-[10px] text-faint hover:text-ink"
        >
          ✕
        </button>
      </div>
      {mine.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
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
      <div className="mt-1.5 max-h-44 overflow-y-auto">
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
            return (
              <button
                key={row.node}
                onClick={() => onToggle(ref)}
                className={cx(
                  "flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left text-[12px] transition-colors",
                  picked ? "bg-accent-dim text-accent" : "text-ink hover:bg-surface",
                )}
              >
                <span className="font-mono">{row.node}</span>
                {row.nodeType && (
                  <span className="text-[10px] text-faint">{row.nodeType}</span>
                )}
                <span className="ml-auto font-mono text-[10px] text-faint">
                  {row.observations.toLocaleString()} obs
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
