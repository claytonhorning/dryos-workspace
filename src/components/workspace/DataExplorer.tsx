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
  coverageLabel,
  domainOf,
  domains,
  entityCountLabel,
  entityRef,
  isoOf,
  isos,
  mapTreatment,
  pinStreams,
  streamRef,
  type MapTreatment,
} from "@/lib/workspace/catalog";
import {
  PIN_LAYER_WHY,
  type ComponentKind,
} from "@/lib/workspace/components";
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

/** The domain select's last option: every domain at once. */
export const EVERYTHING = "all";

/** A domain name the catalogue has, or the blend. */
export function knownDomain(d?: string): d is string {
  return d === EVERYTHING || (d !== undefined && domains().includes(d));
}

/** What the explorer opens on: the workspace's subject if it has one. */
export function defaultDomain(initial?: string): string {
  return knownDomain(initial) ? initial : (domains()[0] ?? "Energy");
}

/**
 * The domain select — Energy, Weather, Everything. One component so the tab
 * row above the panel and the explorer's own fallback draw the same control.
 */
export function DomainSelect({
  value,
  onChange,
  size = "md",
  align = "left",
}: {
  value: string;
  onChange: (domain: string) => void;
  size?: "md" | "sm";
  align?: "left" | "right";
}) {
  const all = useMemo(() => domains(), []);
  return (
    <Select
      value={value}
      onChange={onChange}
      options={[
        ...all.map((d) => ({ value: d, label: d })),
        { value: EVERYTHING, label: "Everything" },
      ]}
      aria-label="Domain"
      size={size}
      align={align}
      className="shrink-0"
    />
  );
}

export function DataExplorer({
  selected,
  onToggle,
  onClear,
  onNext,
  verdict,
  shape,
  initialDomain,
  domain: controlled,
  onDomainChange,
}: {
  selected: DataRef[];
  /**
   * The shape the data is for, when one was chosen first. Most shapes read
   * the catalogue as it is; the map reads it at a different grain. A map is
   * a stack of layers, a layer is one stream the map can place, and "add
   * data" on a map only ever offers spatial data — so for the map the list
   * is filtered to what `mapTreatment` can draw, each card says how much of
   * the stream it places, and one click takes the whole stream as a layer.
   * Narrowing to a tier or a search is the second gesture, not the first.
   */
  shape?: ComponentKind;
  /**
   * The domain, when the parent owns it. The build panel's shelf shows the
   * same select in its heading and filters what is published by it, so the
   * page holds the value and the two controls read one setting. Absent, the
   * explorer keeps its own, for the tile editor's data stage. Either way the
   * explorer draws the control: it is the coarsest filter over the list.
   */
  domain?: string;
  onDomainChange?: (domain: string) => void;
  /**
   * What the selection is for, when a shape was chosen first: its `accepts`
   * verdict on the selection so far. The footer reads the reason out while
   * it refuses, and Next waits until it does not.
   */
  verdict?: { ok: boolean; why?: string };
  /**
   * The workspace's subject, if it has one — a domain name or `"all"`. The
   * explorer opens on it and then belongs to the reader; it arrives after
   * mount when the page is still fetching the workspace, so it is applied
   * once as it lands rather than only read at first render.
   */
  initialDomain?: string;
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
  const [own, setOwn] = useState(() => defaultDomain(initialDomain));
  const domain = controlled ?? own;
  const setDomain = onDomainChange ?? setOwn;
  const [category, setCategory] = useState(ALL);
  /** Grid operator within the domain, or ALL. Only Energy has any. */
  const [iso, setIso] = useState(ALL);
  useEffect(() => {
    if (controlled === undefined && knownDomain(initialDomain)) setOwn(initialDomain!);
  }, [initialDomain, controlled]);
  // A new domain is a new question: the chip and the operator start over,
  // whichever side of the panel changed it.
  useEffect(() => {
    setCategory(ALL);
    setIso(ALL);
  }, [domain]);
  const everything = domain === EVERYTHING;
  const mapping = shape === "map";
  /** The stream already drawn as pins, if any — a second one is refused. */
  const pinsOn = useMemo(() => pinStreams(selected), [selected]);
  const [query, setQuery] = useState("");
  /** The set being read at level two, or null for the catalogue. */
  const [drill, setDrill] = useState<Schema | null>(null);

  const refs = useMemo(() => catalogRefs(), []);
  const cats = useMemo(
    () => [ALL, ...categories(everything ? undefined : domain)],
    [domain, everything],
  );
  // Which grid operators the domain has. Weather has none, and the blend
  // offers none either: an ISO is a way of narrowing Energy, not the world.
  const operators = useMemo(
    () => (everything ? [] : isos(domain)),
    [domain, everything],
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
        (!everything && domainOf(s) !== domain) ||
        (mapping && mapTreatment(s) === null) ||
        (iso !== ALL && isoOf(s) !== iso) ||
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
      // The select names the domain, so headings drop it — unless the select
      // says everything, when the domain is the one thing a heading must say.
      const heading = (everything ? s.path : s.path.slice(1)).join(" › ");
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
  }, [refs, domain, everything, iso, category, query, mapping]);

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
          verdict={verdict}
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
          Three rows, coarse to fine. The domain first and alone: it is the
          subject you work in, chosen once, and it decides what the two rows
          under it can offer. Then search beside the grid operator, which is
          where the domain was — both narrow what is on screen, and inside
          Energy the operator is the coarser of the two. Then the chips.
        */}
        <div className="flex">
          <DomainSelect value={domain} onChange={setDomain} />
        </div>
        <div className="flex items-stretch gap-1.5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search data…"
            className="w-full min-w-0 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
          />
          {/*
            The operator only exists once a domain that has any is chosen —
            offered on Weather it would be a select with one answer, and on
            the blend it would narrow the weather to nothing.
          */}
          {operators.length > 0 && (
            <Select
              value={iso}
              onChange={(i) => {
                setIso(i);
                setCategory(ALL);
              }}
              options={[
                { value: ALL, label: "All ISOs" },
                ...operators.map((i) => ({ value: i, label: i })),
              ]}
              aria-label="Grid operator"
              align="right"
              className="shrink-0"
            />
          )}
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
            {mapping && !query.trim()
              ? `Nothing in ${everything ? "the catalogue" : domain} has a place the map can draw.`
              : `Nothing in ${everything ? "the catalogue" : domain} matches “${query}”.`}
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
                  mapping && e.streamRef ? (
                    <LayerRow
                      key={e.schema.id}
                      schema={e.schema}
                      treatment={mapTreatment(e.schema)!}
                      selected={chosen.has(
                        `${e.streamRef.snippet}::${e.streamRef.label}`,
                      )}
                      picked={countPicked(selected, e.schema)}
                      blocked={
                        pinsOn.length > 0 &&
                        mapTreatment(e.schema)!.how === "pins" &&
                        !pinsOn.includes(e.schema.id)
                      }
                      onSelect={() => onToggle(e.streamRef!)}
                      onNarrow={
                        hasEntities(e.schema) &&
                        mapTreatment(e.schema)!.how === "pins"
                          ? () => setDrill(e.schema)
                          : undefined
                      }
                    />
                  ) : hasEntities(e.schema) ? (
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
            : mapping
              ? "Click a stream to draw it as a layer"
              : "Click a box to select it"
        }
        verdict={verdict}
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
  verdict,
  onNext,
}: {
  count: number;
  hint: string;
  verdict?: { ok: boolean; why?: string };
  onNext?: () => void;
}) {
  /*
    The shape's own reason, while there is one: "pick exactly two series" is
    the instruction, and it belongs on the line that counts what is picked.
    Next is disabled rather than hidden so the way on is always in the same
    place — it only waits.
  */
  const refused = verdict !== undefined && !verdict.ok;
  const line = refused ? verdict.why! : hint;
  return (
    <div className="flex items-center gap-2 border-t border-line px-3 py-1.5">
      <p
        className={cx(
          "min-w-0 truncate font-mono text-[9.5px]",
          refused ? "text-muted" : "text-faint",
        )}
      >
        {count > 0 ? `${count} selected · ${line}` : line}
      </p>
      {onNext && (
        <button
          onClick={onNext}
          disabled={refused}
          className={cx(
            "ml-auto shrink-0 rounded-md border px-2.5 py-1 text-[12px] transition-colors",
            refused
              ? "cursor-not-allowed border-line text-faint"
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

/**
 * A stream on the map's shelf: the whole of it as one layer, in one click.
 *
 * The same card as `DrillRow` at a different grain. A chart is built out of
 * rows, so a large stream opens into its entities; a map is built out of
 * layers, so the click takes the stream whole and the drill is the second
 * gesture — "narrow ›" — for a tier or a search of it. The coverage line is
 * read *before* the click: "8 of 9 have known locations" and "698 of 1,118
 * have known locations" are facts to choose on, and the map's own
 * `accepts` used to be the first place they surfaced, after the fact, on the
 * footer.
 *
 * `blocked` is the second stream of pins. The map draws one layer of them
 * (see `pinStreams`), and a card that could be clicked into a refusal is
 * worse than one that says why it cannot be.
 */
function LayerRow({
  schema,
  treatment,
  selected,
  picked,
  blocked,
  onSelect,
  onNarrow,
}: {
  schema: Schema;
  treatment: MapTreatment;
  selected: boolean;
  picked: number;
  blocked: boolean;
  onSelect: () => void;
  onNarrow?: () => void;
}) {
  return (
    <div
      className={cx(
        "flex w-full flex-col rounded border transition-colors",
        selected
          ? "border-accent-line bg-accent-dim"
          : blocked
            ? "border-line bg-surface-2 opacity-50"
            : "border-line bg-surface-2 hover:border-accent-line",
      )}
    >
      <button
        onClick={onSelect}
        disabled={blocked}
        title={blocked ? PIN_LAYER_WHY : undefined}
        className="flex w-full flex-col gap-0.5 px-2 pt-1.5 text-left disabled:cursor-not-allowed"
      >
        <span className="flex items-center gap-1.5">
          <span
            className={cx(
              "truncate font-mono text-[11px]",
              selected ? "text-accent" : "text-ink",
            )}
          >
            {schema.name}
          </span>
          {/* Entities picked one at a time from inside the set — a partial
              layer, said in the same words the drill card uses. */}
          {picked > 0 && !selected && (
            <span className="shrink-0 rounded-full border border-accent-line bg-accent-dim px-1.5 py-px font-mono text-[9px] text-accent">
              {picked} picked
            </span>
          )}
          {selected && (
            <span className="ml-auto shrink-0 text-[11px] text-accent">
              ✓
            </span>
          )}
        </span>
        <span className="truncate font-mono text-[9.5px] text-faint">
          {blurbLead(schema)}
        </span>
        {/* How much of it the map can place — the line this card exists for. */}
        <span className="truncate font-mono text-[9.5px] text-muted">
          {coverageLabel(treatment)}
        </span>
        <MetaBadges cadence={schema.cadence.label} />
      </button>
      <div className="flex items-center px-2 pb-1.5 pt-0.5">
        {blocked ? (
          <span className="truncate font-mono text-[9.5px] text-faint">
            {PIN_LAYER_WHY}
          </span>
        ) : onNarrow ? (
          <button
            onClick={onNarrow}
            className="font-mono text-[9.5px] text-muted transition-colors hover:text-accent"
          >
            narrow to a tier or a search ›
          </button>
        ) : null}
      </div>
    </div>
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
  /**
   * The set, in hand: every entity the one fetch returned, up to the API's
   * cap of 2,000. Tiers and search are filters over this list — the endpoint
   * answers once per set, and pressing a tier chip or typing a letter never
   * asks it again. It did once: the set opened with two calls in series
   * (the tiers, then the hubs) and one more per keystroke, each a full
   * aggregate over the table, which was fourteen seconds a call against
   * the hosted database. The endpoint is milliseconds now and this list is
   * a thousand names, so there is nothing left for a second call to find.
   */
  const [all, setAll] = useState<EntityRow[]>([]);
  /** How many entities the stream really holds — past the cap for the
   *  bus-level streams, which is the one case a search still asks the API. */
  const [total, setTotal] = useState(schema.entities.count);
  /** The fetch has delivered — before that, an empty list means "still
   *  looking", not "nothing matches". */
  const [settled, setSettled] = useState(false);
  /** Why the entity list could not be read, or null. Shown in place of it. */
  const [failed, setFailed] = useState<string | null>(null);
  /**
   * Matches from past the cap, and the query they answer. Only a stream too
   * big to hold whole ever has any; they land underneath, labelled, without
   * disturbing what is already on screen.
   */
  const [far, setFar] = useState<{
    q: string;
    rows: EntityRow[];
  } | null>(null);
  const [farBusy, setFarBusy] = useState(false);

  // Once per set. The response carries the tiers and the true entity count
  // beside the rows, so one call opens the view.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const url = new URL(
          "/api/workspace/entities",
          window.location.origin,
        );
        url.searchParams.set("dataset", schema.dataset!);
        url.searchParams.set("limit", "2000");
        const res = await fetch(url);
        const json = await res.json();
        if (!live) return;
        if (!res.ok) {
          // Say so. Rendered as an empty set, an API that does not know the
          // dataset reads as a stream with nothing in it — a 404 dressed as
          // "Nothing matches".
          setFailed(json.error ?? `HTTP ${res.status}`);
          setAll([]);
          setSettled(true);
          return;
        }
        setFailed(null);
        if (json.facets) {
          setFacets(json.facets);
          // Open on the smallest readable tier — the hubs, not an
          // alphabetical slice of the resource nodes.
          const tiers = Object.entries(
            json.facets as Record<string, number>,
          )
            .filter(([, n]) => n > 1 && n <= 12)
            .sort((a, b) => a[1] - b[1]);
          if (tiers[0]) setFacet(tiers[0][0]);
        }
        if (typeof json.coverage?.nodes === "number") {
          setTotal(json.coverage.nodes);
        }
        setAll(json.nodes ?? []);
        setSettled(true);
      } catch {
        if (!live) return;
        setFailed("The delivery API is not reachable.");
        setAll([]);
        setSettled(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [schema.dataset]);

  /** The tier in view, or the whole set when none is chosen. */
  const rows = useMemo(
    () => (facet ? all.filter((r) => r.nodeType === facet) : all),
    [all, facet],
  );

  /*
    What the cap left out, for a query the rows in hand cannot answer. It is
    deliberately not what you are shown first: it lands when it lands, and
    nothing waits for it.
  */
  const beyond = Math.max(0, total - all.length);
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
    one-liner says Austin even though its id does not. A search runs over the
    whole set, not the tier — the tier chips hide while typing — but the open
    tier's matches lead, because HB_NORTH is the answer to "north" more often
    than a resource node with the word in it.
  */
  const needle = q.trim().toLowerCase();
  const matches = (r: EntityRow) =>
    r.node.toLowerCase().includes(needle) ||
    (r.nodeType ?? "").toLowerCase().includes(needle) ||
    (entityNote(r.node) ?? "").toLowerCase().includes(needle);
  const here = needle ? rows.filter(matches) : rows;
  const seen = new Set(here.map((r) => r.node));
  const elsewhere: EntityRow[] = [];
  if (needle) {
    const rest = facet ? all.filter(matches) : [];
    for (const r of [...rest, ...(far?.q === q.trim() ? far.rows : [])]) {
      if (!seen.has(r.node)) {
        seen.add(r.node);
        elsewhere.push(r);
      }
    }
  }

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
        {/* The one fetch is the only wait; after it, nothing here is. */}
        {!settled ? (
          <p className="px-1 py-1.5 text-[11.5px] text-faint">
            Loading…
          </p>
        ) : (
          <>
            {failed ? (
              <p className="px-1 py-1.5 text-[11.5px] text-warn">
                Couldn&rsquo;t list the entities: {failed}
              </p>
            ) : (
              here.length === 0 &&
              elsewhere.length === 0 &&
              !farBusy && (
                <p className="px-1 py-1.5 text-[11.5px] text-faint">
                  {q ? <>Nothing matches “{q}”.</> : "Nothing collected yet."}
                </p>
              )
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
              What the tier in view does not hold: the other tiers, and on a
              stream past the cap whatever the API found. Below the fold
              rather than mixed in, so the tier's own matches stay where
              they are while the rest arrives.
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
        "flex w-full flex-col gap-0.5 rounded px-1.5 py-1 text-left transition-colors",
        picked ? "bg-accent-dim" : "hover:bg-surface-2",
      )}
    >
      {/*
        One line per entity: the name and its tier on the left, what is on
        offer on the right. Stacked, the count and the freshness took a
        second line under every row and the right half of the panel held
        nothing, so a set of thousands showed a dozen at a time. The note,
        where there is one, is the only thing that earns a second line.
      */}
      <span className="flex w-full items-baseline gap-2">
        <span
          className={cx(
            "shrink-0 font-mono text-[12px]",
            picked ? "text-accent" : "text-ink",
          )}
        >
          {row.node}
        </span>
        {row.nodeType && (
          <span className="min-w-0 truncate text-[10px] text-faint">
            {row.nodeType}
          </span>
        )}
        {/*
          What you are actually being offered: how much of it there is, and
          whether it is still coming. "obs" said neither — it was a count with
          no noun and no time attached to it.
        */}
        <span
          title={
            row.firstSeen
              ? `${row.observations.toLocaleString()} readings from ${new Date(
                  row.firstSeen,
                ).toLocaleString()} to ${new Date(row.lastSeen ?? row.firstSeen).toLocaleString()}`
              : undefined
          }
          className="ml-auto flex shrink-0 items-baseline gap-1.5 whitespace-nowrap font-mono text-[9.5px] text-faint"
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
      </span>
      {note && (
        <span className="text-[11px] leading-snug text-muted">
          {note}
        </span>
      )}
    </button>
  );
}
