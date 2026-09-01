"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cx } from "@/components/ui";
import {
  DataChip,
  MetaBadges,
  SelectionStrip,
} from "@/components/workspace/DataChip";
import { Select } from "@/components/Select";
import {
  SCHEMAS,
  type DataRef,
  type Schema,
  blurbLead,
  categories,
  categoryOf,
  catalogRefs,
  domainOf,
  domains,
  entityCountLabel,
  entityRef,
  streamRef,
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
  onClear,
  onNext,
}: {
  selected: DataRef[];
  onToggle: (ref: DataRef) => void;
  /** Drop the whole selection. */
  onClear?: () => void;
  /**
   * On to choosing a component.
   *
   * The panel used to carry this in a bar of its own under the explorer, which
   * put the count in two places and the selection in two places. It is one
   * control at the end of the line that already says what is selected.
   */
  onNext?: () => void;
}) {
  const all = useMemo(() => domains(), []);
  const [domain, setDomain] = useState(all[0] ?? "Energy");
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState("");
  /** The set being read at level two, or null for the catalogue. */
  const [drill, setDrill] = useState<Schema | null>(null);

  const refs = useMemo(() => catalogRefs(), []);
  const cats = useMemo(
    () => [ALL, ...categories(domain)],
    [domain],
  );

  const chosen = useMemo(
    () =>
      new Set(
        selected.map((r) => `${r.snippet}::${r.label}`),
      ),
    [selected],
  );

  // One card per stream, one section per heading. Streams that share a
  // path — the SCED LMP and the settlement point price both live at
  // Pricing › Real-time — sit under one heading rather than repeating it,
  // because to the reader they are two answers to the same question.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bySection = new Map<
      string,
      { schema: Schema; streamRef?: DataRef }[]
    >();
    for (const s of SCHEMAS) {
      if (
        domainOf(s) !== domain ||
        (category !== ALL && categoryOf(s) !== category) ||
        (q &&
          !s.name.toLowerCase().includes(q) &&
          !s.path.join(" ").toLowerCase().includes(q) &&
          !s.variables.some(
            (v) =>
              v.label.toLowerCase().includes(q) ||
              v.key.toLowerCase().includes(q) ||
              v.unit.toLowerCase().includes(q),
          ))
      )
        continue;
      const heading = s.path.slice(1).join(" › ");
      const entry = {
        schema: s,
        streamRef: refs.find(
          (r) => r.schemaId === s.id && r.kind === "schema",
        ),
      };
      const list = bySection.get(heading);
      if (list) list.push(entry);
      else bySection.set(heading, [entry]);
    }
    return [...bySection.entries()].map(
      ([heading, entries]) => ({ heading, entries }),
    );
  }, [refs, domain, category, query]);

  const shown = groups.length;

  if (drill) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
        <SetView
          schema={drill}
          chosen={chosen}
          onToggle={onToggle}
          onBack={() => setDrill(null)}
          strip={
            <SelectionStrip
              selected={selected}
              onRemove={onToggle}
              onClear={onClear}
              label="Selected"
              className="border-b border-line px-2.5 py-1.5"
            />
          }
        />
        <Footer
          count={selected.length}
          hint={
            selected.length > 0
              ? "picks from other sets are kept"
              : "Pick entities to build with"
          }
          onNext={onNext}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
      {/*
        No title row. It held the word "Data" and the chips, and the chips were
        wrong there — four of them wrapped their cadence and price into a block
        taller than the catalogue underneath. With them moved below the filters
        the row had one word left in it, which is not worth a band of a panel
        whose scarcest resource is height. The stage is named by the step you
        came through and by the back button that leaves it.
      */}
      <div className="flex flex-col gap-2 border-b border-line px-2.5 py-2">
        {/*
          Search and domain on one line: both narrow what is on screen, and the
          domain is the coarser of the two — the subject you work in, chosen
          once, so it stays a select rather than becoming another chip.
        */}
        <div className="flex items-stretch gap-1.5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search data…"
            className="w-full min-w-0 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
          />
          <Select
            value={domain}
            onChange={(d) => {
              setDomain(d);
              setCategory(ALL);
            }}
            options={all.map((d) => ({
              value: d,
              label: d,
            }))}
            aria-label="Domain"
            align="right"
            className="shrink-0"
          />
        </div>
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

      {/* Narrow, pick, see what you have — in that order, all above the list. */}
      <SelectionStrip
        selected={selected}
        onRemove={onToggle}
        onClear={onClear}
        label="Selected"
        className="border-b border-line px-2.5 py-1.5"
      />

      <div className="dr-scroll min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        {shown === 0 ? (
          <p className="px-0.5 py-3 text-[12.5px] text-faint">
            Nothing in {domain} matches “{query}”.
          </p>
        ) : (
          groups.map((g) => (
            <section
              key={g.heading}
              className="mb-3 last:mb-0"
            >
              {/* No count out here: it rides on each card as a chip, beside
                  the cadence and the price, where a heading shared by two
                  streams could not carry it anyway. */}
              <h3 className="px-0.5 pb-1.5 font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
                {g.heading}
              </h3>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {/* A stream with entities opens; one with a single series has
                    nothing to choose, so its card selects directly. Same card,
                    same height — only the affordance differs. */}
                {g.entries.map((e) =>
                  hasEntities(e.schema) ? (
                    <DrillRow
                      key={e.schema.id}
                      schema={e.schema}
                      picked={countPicked(
                        selected,
                        e.schema,
                      )}
                      onOpen={() => setDrill(e.schema)}
                    />
                  ) : (
                    e.streamRef && (
                      <DataChip
                        key={e.schema.id}
                        refr={e.streamRef}
                        selected={chosen.has(
                          `${e.streamRef.snippet}::${e.streamRef.label}`,
                        )}
                        onClick={() =>
                          onToggle(e.streamRef!)
                        }
                      />
                    )
                  ),
                )}
              </div>
            </section>
          ))
        )}
      </div>

      <Footer
        count={selected.length}
        hint={
          selected.length > 0
            ? "click again to remove"
            : "Click a box to select it"
        }
        onNext={onNext}
      />
    </div>
  );
}

/**
 * The line at the foot of either level: what is selected, and the way on.
 *
 * The button lives here rather than in a bar below the panel because this line
 * already says how many are selected, and the answer to "now what" belongs
 * beside the thing it is counting. It is accent-filled: quiet furniture is
 * right for the count and wrong for the only forward step on the screen.
 */
function Footer({
  count,
  hint,
  onNext,
}: {
  count: number;
  hint: string;
  onNext?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-line px-3 py-1.5">
      <p className="min-w-0 truncate font-mono text-[9.5px] text-faint">
        {count > 0 ? `${count} selected · ${hint}` : hint}
      </p>
      {onNext && (
        <button
          onClick={onNext}
          disabled={count === 0}
          className={cx(
            "ml-auto shrink-0 rounded-md border px-2.5 py-1 text-[12px] transition-colors",
            count === 0
              ? "border-line text-faint"
              : "border-accent-line bg-accent-dim text-accent hover:brightness-110",
          )}
        >
          Next ›
        </button>
      )}
    </div>
  );
}

/** A stream with more than one entity has something to choose. */
function hasEntities(schema: Schema): boolean {
  return (
    Boolean(schema.dataset) && schema.entities.count > 1
  );
}

/** Entities picked from this stream, for the card's badge. */
function countPicked(
  selected: DataRef[],
  schema: Schema,
): number {
  return selected.filter(
    (r) =>
      r.schemaId === schema.id &&
      (r.kind === "entity" || r.kind === "schema"),
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
      {/* One sentence of what the stream is: two cards under one heading
          need more than their names to be told apart. */}
      <span className="truncate font-mono text-[9.5px] text-faint">
        {blurbLead(schema)}
      </span>
      <MetaBadges
        cadence={schema.cadence.label}
        entities={schema.entities.count}
      />
    </button>
  );
}

interface EntityRow {
  node: string;
  nodeType: string | null;
  observations: number;
  /** ISO timestamps of the oldest and newest reading held for this entity. */
  firstSeen?: string | null;
  lastSeen?: string | null;
}

/**
 * How long ago the last reading landed, in as few characters as it takes.
 *
 * The count says how much history there is; this says whether it is still
 * arriving, which is the other half of "can I build on this" and the half a
 * row of numbers never showed. A stream that stopped three days ago looks
 * exactly like a healthy one until somebody says so.
 */
function freshness(
  iso?: string | null,
): { short: string; stale: boolean } | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 2) return { short: "just now", stale: false };
  if (mins < 60)
    return { short: `${mins}m ago`, stale: false };
  const hours = Math.round(mins / 60);
  if (hours < 24)
    return { short: `${hours}h ago`, stale: hours >= 6 };
  const days = Math.round(hours / 24);
  return { short: `${days}d ago`, stale: true };
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
  chosen,
  onToggle,
  onBack,
  strip,
}: {
  schema: Schema;
  chosen: Set<string>;
  onToggle: (ref: DataRef) => void;
  onBack: () => void;
  /** The selection, in the same place it sits one level up. */
  strip?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [facet, setFacet] = useState<string | null>(null);
  // Which measure a picked entity refers to. Most streams have one; the rest
  // get a radio, because "wind actual" and "wind forecast" are different picks.
  const [varKey, setVarKey] = useState(
    schema.variables[0]?.key,
  );
  const [facets, setFacets] = useState<Record<
    string,
    number
  > | null>(null);
  /** The tier in view, unfiltered. Typing never refetches this. */
  const [rows, setRows] = useState<EntityRow[]>([]);
  const [opened, setOpened] = useState(false);
  /** A fetch has actually delivered rows for the current view — before that,
   *  an empty list means "still looking", not "nothing matches". */
  const [settled, setSettled] = useState(false);
  /**
   * Matches from outside the tier in view, and the query they answer.
   *
   * The entity endpoint aggregates observation counts per node and takes two
   * to three seconds on a stream of a thousand — per keystroke, when the
   * search box drove it. So it no longer does: typing filters the rows already
   * in hand, instantly, and the slow query only runs to find what is *not* in
   * hand. Those arrive underneath, labelled, without disturbing what was
   * already on screen.
   */
  const [far, setFar] = useState<{
    q: string;
    rows: EntityRow[];
  } | null>(null);
  const [farBusy, setFarBusy] = useState(false);

  // The tier: fetched when the set opens and when a tier chip is pressed, and
  // at no other time.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const url = new URL(
          "/api/workspace/entities",
          window.location.origin,
        );
        url.searchParams.set("dataset", schema.dataset!);
        if (facet) url.searchParams.set("node_type", facet);
        url.searchParams.set("limit", "2000");
        const res = await fetch(url);
        const json = await res.json();
        if (!live) return;
        if (!res.ok) {
          setRows([]);
          setSettled(true);
          return;
        }
        if (json.facets && !opened) {
          setFacets(json.facets);
          // Open on the smallest readable tier — the hubs, not an
          // alphabetical slice of the resource nodes. When a tier is chosen,
          // the unfiltered rows this first fetch returned are never shown:
          // painting them for a beat and then jumping to the tier read as a
          // glitch, and the second fetch is the one that matters.
          const tiers = Object.entries(
            json.facets as Record<string, number>,
          )
            .filter(([, n]) => n > 1 && n <= 12)
            .sort((a, b) => a[1] - b[1]);
          setOpened(true);
          if (tiers[0]) {
            setFacet(tiers[0][0]);
            return;
          }
        }
        setRows(json.nodes ?? []);
        setSettled(true);
      } catch {
        if (!live) return;
        setRows([]);
        setSettled(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [schema.dataset, facet, opened]);

  /*
    The rest of the stream, for a query the tier cannot answer on its own. It
    is deliberately not what you are shown first: it lands when it lands, and
    nothing waits for it.
  */
  const beyond = Math.max(
    0,
    schema.entities.count - rows.length,
  );
  useEffect(() => {
    const query = q.trim();
    if (!query || beyond === 0) {
      setFar(null);
      setFarBusy(false);
      return;
    }
    let live = true;
    setFarBusy(true);
    const t = setTimeout(async () => {
      try {
        const url = new URL(
          "/api/workspace/entities",
          window.location.origin,
        );
        url.searchParams.set("dataset", schema.dataset!);
        url.searchParams.set("q", query);
        url.searchParams.set("limit", "2000");
        const res = await fetch(url);
        const json = await res.json();
        if (!live) return;
        setFar({
          q: query,
          rows: res.ok ? (json.nodes ?? []) : [],
        });
      } catch {
        if (live) setFar({ q: query, rows: [] });
      } finally {
        if (live) setFarBusy(false);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [schema.dataset, q, beyond]);

  /*
    The filter itself: over the rows in hand, on every keystroke, no network.
    It reads the note as well as the name, so "austin" finds the node whose
    one-liner says Austin even though its id does not.
  */
  const needle = q.trim().toLowerCase();
  const here = needle
    ? rows.filter(
        (r) =>
          r.node.toLowerCase().includes(needle) ||
          (r.nodeType ?? "")
            .toLowerCase()
            .includes(needle) ||
          (entityNote(r.node) ?? "")
            .toLowerCase()
            .includes(needle),
      )
    : rows;
  const seen = new Set(here.map((r) => r.node));
  const elsewhere =
    needle && far?.q === q.trim()
      ? far.rows.filter((r) => !seen.has(r.node))
      : [];

  /*
    Select-all: the whole view in hand as one chip.

    This is the map gesture. The set view's grain is series — pick a handful,
    each its own chip — and a map's grain is streams, which one-at-a-time
    picking cannot reach. So whatever the view currently shows is selectable
    whole: the unfiltered stream as the fan-out chip (all 1,118, no
    enumeration), a tier or a search as a subset chip that names its entities
    outright. One chip either way, priced as one query, and pressing it again
    puts it back.

    Enumerated subsets stop at 200 entities: past that the list is most of
    the stream anyway, and it travels inside every spec and preview URL — the
    8KB request-line lesson applies. The whole stream needs no list, so it
    has no cap.
  */
  const SUBSET_CAP = 200;
  const scope = needle
    ? {
        label: `matching “${q.trim()}”`,
        rows: [...here, ...elsewhere],
      }
    : facet
      ? { label: facet, rows }
      : null;
  const allRef = scope
    ? settled &&
      scope.rows.length > 0 &&
      scope.rows.length <= SUBSET_CAP
      ? streamRef(schema, varKey, {
          label: scope.label,
          entities: scope.rows.map((r) => r.node),
        })
      : null
    : streamRef(schema, varKey);
  const allCount = scope
    ? scope.rows.length
    : schema.entities.count;
  const allPicked = allRef
    ? chosen.has(`${allRef.snippet}::${allRef.label}`)
    : false;

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button
          onClick={onBack}
          className="shrink-0 rounded border border-line px-1.5 py-[3px] text-[11px] text-muted hover:border-line-strong hover:text-ink"
        >
          ‹ All data
        </button>
        <span className="truncate text-[12.5px] text-ink">
          {schema.name}
        </span>
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
                  onClick={() =>
                    setFacet(facet === kind ? null : kind)
                  }
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
        {/* One chip for the whole view — see the select-all comment above. */}
        {allRef ? (
          <button
            onClick={() => onToggle(allRef)}
            className={cx(
              "w-full rounded border border-dashed px-2.5 py-1.5 text-left text-[11.5px] transition-colors",
              allPicked
                ? "border-accent-line bg-accent-dim text-accent"
                : "border-line text-muted hover:border-accent-line hover:text-accent",
            )}
          >
            {allPicked ? "✓ Selected" : "Select"} all{" "}
            {scope ? scope.label : "of this stream"} ·{" "}
            {allCount.toLocaleString()}{" "}
            {allCount === 1 ? "entity" : "entities"}
          </button>
        ) : scope &&
          settled &&
          scope.rows.length > SUBSET_CAP ? (
          <p className="px-0.5 text-[10.5px] leading-snug text-faint">
            {scope.rows.length.toLocaleString()} is too many
            to carry as one selection — narrow further, or
            select the whole stream.
          </p>
        ) : null}
      </div>

      {/* Under the filters, exactly where it sits one level up. */}
      {strip}

      <div className="dr-scroll min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        {/* Only the first load can be a wait; after it, typing never is. */}
        {!settled && rows.length === 0 ? (
          <p className="px-1 py-1.5 text-[11.5px] text-faint">
            Loading…
          </p>
        ) : (
          <>
            {here.length === 0 &&
              elsewhere.length === 0 &&
              !farBusy && (
                <p className="px-1 py-1.5 text-[11.5px] text-faint">
                  Nothing matches “{q}”.
                </p>
              )}

            {here.map((row) => (
              <EntityButton
                key={row.node}
                schema={schema}
                row={row}
                varKey={varKey}
                chosen={chosen}
                onToggle={onToggle}
              />
            ))}

            {/*
              What the tier in view does not hold. Below the fold rather than
              mixed in, because these arrived a beat later and moving what
              somebody is already reading is worse than labelling the rest.
            */}
            {elsewhere.length > 0 && (
              <>
                <p className="mt-2 px-1 pb-1 font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
                  Elsewhere in this stream
                </p>
                {elsewhere.map((row) => (
                  <EntityButton
                    key={row.node}
                    schema={schema}
                    row={row}
                    varKey={varKey}
                    chosen={chosen}
                    onToggle={onToggle}
                  />
                ))}
              </>
            )}

            {/* Said quietly, at the end, while the slow half is still out. */}
            {farBusy && needle && (
              <p className="px-1 py-1.5 font-mono text-[10px] text-faint">
                looking through the other{" "}
                {beyond.toLocaleString()}…
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

/** One entity in the set view — the same row wherever it was found. */
function EntityButton({
  schema,
  row,
  varKey,
  chosen,
  onToggle,
}: {
  schema: Schema;
  row: EntityRow;
  varKey: string;
  chosen: Set<string>;
  onToggle: (ref: DataRef) => void;
}) {
  const ref = entityRef(schema, row.node, varKey);
  const picked = chosen.has(`${ref.snippet}::${ref.label}`);
  const note = entityNote(row.node);
  const fresh = freshness(row.lastSeen);
  return (
    <button
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
          <span className="text-[10px] text-faint">
            {row.nodeType}
          </span>
        )}
      </span>
      {note && (
        <span className="text-[11px] leading-snug text-muted">
          {note}
        </span>
      )}
      {/*
        What you are actually being offered: how much of it there is, and
        whether it is still coming. "obs" said neither — it was a count with no
        noun and no time attached to it.
      */}
      <span
        title={
          row.firstSeen
            ? `${row.observations.toLocaleString()} readings from ${new Date(
                row.firstSeen,
              ).toLocaleString()} to ${new Date(row.lastSeen ?? row.firstSeen).toLocaleString()}`
            : undefined
        }
        className="flex w-full items-baseline gap-1.5 font-mono text-[9.5px] text-faint"
      >
        <span>
          {row.observations.toLocaleString()} readings
        </span>
        {fresh && (
          <>
            <span className="text-line-strong">·</span>
            <span
              className={cx(fresh.stale && "text-warn")}
            >
              last collected {fresh.short}
            </span>
          </>
        )}
      </span>
    </button>
  );
}
