import {
  entityCountLabel,
  entityRef,
  makeRef,
  querySnippet,
  schemaById,
  streamRef,
  withTally,
  type DataRef,
  type Schema,
} from "./catalog";
import {
  DEFAULT_LAYOUT,
  GRID,
  emitsPicks,
  followable,
  type ComponentKind,
  type ComponentSpec,
} from "./components";

/**
 * Components — and wired groups of them — somebody published.
 *
 * The Community tab of the build panel, beside the base shapes. Everything
 * here is Dryos-published today — the same honest
 * placeholder the community tab on the shelf carries, and the same reason:
 * a roster with nowhere to put an outside author never grows one.
 *
 * Declared as **recipes, not specs**. A published component names its stream
 * and its entities; the `DataRef`s are rebuilt from today's catalogue every
 * time the list is read, so a cadence or a token price that changes is right
 * here without anyone editing a frozen copy. Exactly the reasoning behind
 * `Revision.refs` sitting beside `Revision.intent`.
 *
 * None of these carry `custom` source, which is deliberate: a published
 * component that is a shape plus a selection can be previewed, re-tuned and
 * refined by whoever takes it. Frozen source can only be run.
 */

export interface PublishedComponent extends ComponentSpec {
  id: string;
  name: string;
  author: string;
  blurb: string;
}

/** One component's worth of recipe: a shape and the data it reads. */
interface Piece {
  kind: ComponentKind;
  schemaId: string;
  /**
   * The entities it charts. Omitted means the whole stream — which for a
   * stream with an `entityKey` fans out to every entity it has, including
   * ones the source adds later.
   */
  entities?: string[];
  /**
   * Further whole streams stacked under `schemaId` — a map's other layers.
   * Only a map takes more than one stream, and only streams that agree on
   * the measure (`pinsAgree`); a recipe naming any other pair is refused by
   * the map's own `accepts` when it is dragged, the same as a hand-picked one.
   */
  layers?: string[];
  options?: Record<string, string>;
  layout?: { w: number; h: number };
  /** Which variable the whole-stream reference reads — a tally's count or value. */
  variable?: string;
  /** An event stream's narrowing, as the explorer's filters would make it. */
  tally?: DataRef["tally"];
  /** Its place within a group, from the anchor; absent, it stacks. */
  at?: { x: number; y: number };
  /**
   * Series from other streams drawn beside it — storage against a price on
   * a second axis. Each is one entity, or a stream's own variable.
   */
  with?: { schemaId: string; entity?: string; variable?: string; label?: string }[];
  /**
   * What the header calls a stream or tally reference — "EV charger" where
   * the chip's own "Austin construction permits · EV charger" is cut off
   * before the part that differs. Never on an entity, whose label is its node.
   */
  label?: string;
}

/** A piece as a recipe file spells it — what `scripts/seed-page --recipe` reads. */
export type RecipePiece = Piece;

interface Recipe extends Piece {
  slug: string;
  name: string;
  blurb: string;
  /** Who published it. Dryos for now; the shelf is meant to take others. */
  author: string;
}

const PUBLISHED: Recipe[] = [
  {
    slug: "rt-lmp-everywhere",
    name: "Real-time LMP, every operator",
    blurb:
      "Every placed node in ERCOT, MISO, PJM, SPP, CAISO, NYISO and ISO-NE on one map, colored by its newest price on one scale.",
    author: "Dryos",
    kind: "map",
    schemaId: "energy.power.realtime",
    layers: [
      "energy.miso.realtime",
      "energy.pjm.rtbus",
      "energy.spp.realtime",
      "energy.caiso.realtime",
      "energy.nyiso.realtime",
      "energy.isone.realtime",
    ],
    layout: { w: 12, h: 420 },
  },
  {
    slug: "hub-prices",
    name: "Hub prices",
    blurb: "Real-time LMP at the four trading hubs, over a day.",
    author: "Dryos",
    kind: "chart",
    schemaId: "energy.power.realtime",
    entities: ["HB_HOUSTON", "HB_NORTH", "HB_SOUTH", "HB_WEST"],
    options: { window: "-24h", shape: "line" },
    layout: { w: 8, h: 300 },
  },
  {
    slug: "fuel-mix",
    name: "Fuel mix",
    blurb: "What is generating right now, stacked by fuel — the shape behind the price.",
    author: "Dryos",
    kind: "chart",
    schemaId: "energy.power.genmix",
    options: { window: "-24h", shape: "stacked", order: "size" },
    layout: { w: 8, h: 300 },
  },
  {
    slug: "load-by-zone",
    name: "Load by zone",
    blurb: "Metered demand across the forecast zones, latest hour, side by side.",
    author: "Dryos",
    kind: "bar",
    schemaId: "energy.load.actualfz",
    options: { sort: "size", orient: "v" },
    layout: { w: 6, h: 260 },
  },
  {
    slug: "north-hub",
    name: "North hub",
    blurb: "One number: the last settled price at HB_NORTH.",
    author: "Dryos",
    kind: "ticker",
    schemaId: "energy.power.realtime",
    entities: ["HB_NORTH"],
  },
  {
    slug: "zone-weather",
    name: "Texas temperatures",
    blurb:
      "The hourly temperature forecast for Austin and San Antonio, Dallas–Fort Worth and Houston.",
    author: "Dryos",
    kind: "chart",
    schemaId: "weather.forecast.zone",
    entities: ["SOUTH_C", "NORTH_C", "COAST"],
    options: { window: "-24h", shape: "line" },
    layout: { w: 8, h: 300 },
  },
  {
    slug: "austin-solar",
    name: "Austin solar & battery permits",
    blurb: "Permits for rooftop solar and home batteries in Austin, counted by week over the past year.",
    author: "Dryos",
    kind: "chart",
    schemaId: "property.permits.austin",
    variable: "samples",
    tally: { where: { subject: ["Solar & battery"] } },
    label: "Solar & battery",
    options: { window: "-365d", shape: "area" },
    layout: { w: 8, h: 300 },
  },
];

/** The whole-stream reference the explorer would hand over for a schema. */
function wholeRef(schema: Schema): DataRef {
  return makeRef(schema, {
    kind: "schema",
    label: schema.name,
    sublabel: entityCountLabel(schema),
    snippet: querySnippet(schema),
  });
}

/** A recipe's references, rebuilt against the catalogue as it stands now. */
function refsOf(recipe: Piece): DataRef[] | null {
  // A title reads nothing; a reference on it would wear the stream's name.
  if (recipe.kind === "text") return [];
  const named = (ref: DataRef, label?: string) =>
    label && ref.kind !== "entity" ? { ...ref, label } : ref;
  const own = ownRefs(recipe)?.map((r) => named(r, recipe.label)) ?? null;
  if (!own || !recipe.with) return own;
  const more = recipe.with.map((w) => {
    const s = schemaById(w.schemaId);
    if (!s) return null;
    return w.entity
      ? entityRef(s, w.entity, w.variable)
      : named(streamRef(s, w.variable), w.label);
  });
  return more.some((r) => !r) ? null : [...own, ...(more as DataRef[])];
}

function ownRefs(recipe: Piece): DataRef[] | null {
  const schema = schemaById(recipe.schemaId);
  if (!schema) return null;
  // An event stream's recipe is the explorer's own chip: the variable it
  // counts or totals, and the narrowing its filters would have made.
  if (!recipe.entities && (recipe.variable || recipe.tally)) {
    const ref = streamRef(schema, recipe.variable);
    return [recipe.tally ? withTally(ref, schema, recipe.tally) : ref];
  }
  if (!recipe.entities) {
    const layers = (recipe.layers ?? []).map((id) => schemaById(id));
    if (layers.some((s) => !s)) return null;
    return [schema, ...(layers as Schema[])].map(wholeRef);
  }
  return recipe.entities.map((node) => entityRef(schema, node));
}

/**
 * The published shelf. A recipe naming a stream the catalogue no longer has is
 * dropped rather than shown broken — the alternative is a card that fails only
 * once somebody drags it onto their screen.
 */
export function communityComponents(): PublishedComponent[] {
  return PUBLISHED.flatMap((r) => {
    const refs = refsOf(r);
    if (!refs) return [];
    return [
      {
        id: r.slug,
        name: r.name,
        blurb: r.blurb,
        author: r.author,
        kind: r.kind,
        refs,
        options: r.options,
        layout: r.layout ?? DEFAULT_LAYOUT[r.kind],
      },
    ];
  });
}

export function communityComponent(slug: string): PublishedComponent | undefined {
  return communityComponents().find((c) => c.id === slug);
}

/* ── Wired groups ──────────────────────────────────────────────────────── */

/**
 * A published group: several components that answer each other, landing as
 * one drop. The same shape a staged group carries through the drag payload —
 * `wireTo` is group-relative, and the edit route resolves it to manifest
 * slots at placement because only the server knows where the group will sit.
 */
export interface PublishedGroupMember {
  kind: ComponentKind;
  refs: DataRef[];
  options?: Record<string, string>;
  layout: { w: number; h: number };
  wireTo?: number;
  /** Its place within the group, from the anchor; absent, it stacks. */
  at?: { x: number; y: number };
}

export interface PublishedGroup {
  id: string;
  name: string;
  author: string;
  blurb: string;
  /** In stacking order: the first source drives every follower under it. */
  members: PublishedGroupMember[];
}

interface GroupRecipe {
  slug: string;
  name: string;
  blurb: string;
  author: string;
  /**
   * Members in stacking order. Wiring is not written down: every chart and
   * ticker follows the first source in the list — the same rule the staging
   * tray applies — so a recipe cannot carry a stale index.
   */
  members: Piece[];
}

/** The permit subjects that are a home wiring itself for the grid (`permit_classes.py`). */
const ELECTRIFY = ["Solar & battery", "EV charger", "Generator"] as const;

const PUBLISHED_GROUPS: GroupRecipe[] = [
  /*
    Energy and property as one story: the grid Texas runs on now — solar
    through the afternoon, grid batteries charging on the cheap midday price
    and discharging into the evening peak (2026-09-12: 8 GW in at $19, 11.8
    GW out at $62 as solar fell from 16 GW to 2) — and Austin's homes doing
    the same thing at their own scale, in the permits for rooftop solar,
    batteries, EV chargers and standby generators (solar & battery went from
    10–30 a week in June to 50–76 a week by late August). The headings
    describe the shape rather than the figures, so they stay true.

    The price map is listed before the permits map on purpose: a group has
    one pick source, the first map, and only the price tiles follow it —
    the permit tiles are on another stream (see `onSource`).
  */
  {
    slug: "austin-plugs-in",
    name: "Austin plugs in · grid and homes",
    blurb:
      "ERCOT's solar and grid batteries beside Austin's permits for rooftop solar, home batteries, EV chargers and generators — the grid, and the homes wiring themselves for it.",
    author: "Dryos",
    members: [
      {
        kind: "text",
        schemaId: "",
        options: { text: "Austin is building its own grid, one roof at a time." },
        layout: { w: 12, h: 56 },
        at: { x: 0, y: 0 },
      },
      {
        kind: "text",
        schemaId: "",
        options: {
          text: "Permits for rooftop solar, batteries, EV chargers and standby generators, beside the ERCOT grid they plug into",
          color: "muted",
        },
        layout: { w: 12, h: 40 },
        at: { x: 0, y: 58 },
      },
      ...(["Solar & battery", "EV charger", "Generator"] as const).map((subject, i) => ({
        kind: "ticker" as const,
        schemaId: "property.permits.austin",
        variable: "samples",
        tally: { where: { subject: [subject] } },
        label: subject,
        layout: { w: 3, h: 120 },
        at: { x: i * 3, y: 108 },
      })),
      {
        kind: "ticker",
        schemaId: "energy.power.realtime",
        entities: ["LZ_AEN"],
        layout: { w: 3, h: 120 },
        at: { x: 9, y: 108 },
      },
      {
        kind: "text",
        schemaId: "",
        options: {
          text: "1 · The grid — solar floods the afternoon, batteries carry the evening",
          color: "s3",
        },
        layout: { w: 12, h: 40 },
        at: { x: 0, y: 244 },
      },
      {
        kind: "chart",
        schemaId: "energy.power.genmix",
        entities: ["SOLAR"],
        with: [{ schemaId: "energy.load.supplydemand", variable: "demand_mw", label: "Demand" }],
        options: { window: "-7d", shape: "area" },
        layout: { w: 6, h: 270 },
        at: { x: 0, y: 290 },
      },
      {
        kind: "chart",
        schemaId: "energy.power.genmix",
        entities: ["POWER_STORAGE"],
        with: [{ schemaId: "energy.power.realtime", entity: "LZ_AEN" }],
        options: { window: "-7d", shape: "line", series: JSON.stringify({ s1: { a: "r" } }) },
        layout: { w: 6, h: 270 },
        at: { x: 6, y: 290 },
      },
      {
        kind: "text",
        schemaId: "",
        options: {
          text: "2 · The homes — what Austin permits for solar, batteries, EV chargers and generators",
          color: "s3",
        },
        layout: { w: 12, h: 40 },
        at: { x: 0, y: 576 },
      },
      {
        kind: "chart",
        schemaId: "property.permits.austin",
        variable: "samples",
        tally: { where: { subject: [...ELECTRIFY] }, by: "subject" },
        options: { window: "-365d", shape: "stacked", order: "size" },
        layout: { w: 7, h: 300 },
        at: { x: 0, y: 622 },
      },
      {
        kind: "bar",
        schemaId: "property.permits.austin",
        variable: "samples",
        tally: { where: { subject: [...ELECTRIFY] }, by: "zip" },
        options: { span: "-90d", orient: "h", sort: "size" },
        layout: { w: 5, h: 300 },
        at: { x: 7, y: 622 },
      },
      {
        kind: "text",
        schemaId: "",
        options: {
          text: "3 · On the map — the price at every generator, and the homes adding their own",
          color: "s3",
        },
        layout: { w: 12, h: 40 },
        at: { x: 0, y: 938 },
      },
      {
        kind: "map",
        schemaId: "energy.power.realtime",
        layout: { w: 6, h: 460 },
        at: { x: 0, y: 984 },
      },
      {
        kind: "map",
        schemaId: "property.permits.austin",
        variable: "samples",
        tally: { where: { subject: [...ELECTRIFY] } },
        layout: { w: 6, h: 460 },
        at: { x: 6, y: 984 },
      },
      {
        kind: "table",
        schemaId: "property.permits.austin",
        variable: "samples",
        tally: { where: { subject: [...ELECTRIFY] } },
        options: { show: "records" },
        layout: { w: 12, h: 300 },
        at: { x: 0, y: 1454 },
      },
    ],
  },
  /*
    A trade's market, for the owner of a trade business: the area picker on
    the left and everything else following it — this span's jobs, the week
    against the one before, who is winning, the jobs themselves. Laid out as
    a dashboard (`at`) rather than a column, because it is one: the picker is
    the question and the rest are its answer, side by side.
  */
  {
    slug: "hvac-market-austin",
    name: "HVAC market · Austin",
    blurb:
      "Pick your ZIP codes and see HVAC jobs there: the weekly count, replacements against new installs, who is pulling the permits and the latest jobs.",
    author: "Dryos",
    members: [
      {
        kind: "area",
        schemaId: "property.permits.austin",
        variable: "samples",
        options: { span: "28", lead: "HVAC", share: "action=Replace" },
        layout: { w: 4, h: 600 },
        at: { x: 0, y: 0 },
      },
      {
        kind: "ticker",
        schemaId: "property.permits.austin",
        variable: "samples",
        tally: { where: { subject: ["HVAC"] } },
        layout: { w: 4, h: 130 },
        at: { x: 4, y: 0 },
      },
      {
        kind: "ticker",
        schemaId: "property.permits.austin",
        variable: "samples",
        tally: { where: { subject: ["HVAC"], action: ["Replace"] } },
        layout: { w: 4, h: 130 },
        at: { x: 8, y: 0 },
      },
      {
        kind: "chart",
        schemaId: "property.permits.austin",
        variable: "samples",
        tally: { where: { subject: ["HVAC"] }, by: "action" },
        options: { window: "-90d", shape: "stacked", order: "size" },
        layout: { w: 8, h: 230 },
        at: { x: 4, y: 140 },
      },
      {
        kind: "bar",
        schemaId: "property.permits.austin",
        variable: "samples",
        tally: { where: { subject: ["HVAC"] }, by: "contractor" },
        options: { span: "-90d", orient: "h", sort: "size" },
        layout: { w: 8, h: 220 },
        at: { x: 4, y: 380 },
      },
      {
        kind: "table",
        schemaId: "property.permits.austin",
        variable: "samples",
        tally: { where: { subject: ["HVAC"] } },
        options: { show: "records" },
        layout: { w: 12, h: 280 },
        at: { x: 0, y: 610 },
      },
    ],
  },
  {
    slug: "roofing-market-sanantonio",
    name: "Roofing market · San Antonio",
    blurb:
      "Re-roofs by ZIP code in San Antonio — the week's count, the year by week, the roofers pulling them and the latest jobs.",
    author: "Dryos",
    members: [
      {
        kind: "area",
        schemaId: "property.permits.sanantonio",
        variable: "samples",
        options: { span: "28", lead: "Roof" },
        layout: { w: 4, h: 600 },
        at: { x: 0, y: 0 },
      },
      {
        kind: "ticker",
        schemaId: "property.permits.sanantonio",
        variable: "samples",
        tally: { where: { subject: ["Roof"] } },
        layout: { w: 8, h: 130 },
        at: { x: 4, y: 0 },
      },
      {
        kind: "chart",
        schemaId: "property.permits.sanantonio",
        variable: "samples",
        tally: { where: { subject: ["Roof"] } },
        options: { window: "-365d", shape: "area" },
        layout: { w: 8, h: 230 },
        at: { x: 4, y: 140 },
      },
      {
        kind: "bar",
        schemaId: "property.permits.sanantonio",
        variable: "samples",
        tally: { where: { subject: ["Roof"] }, by: "contractor" },
        options: { span: "-90d", orient: "h", sort: "size" },
        layout: { w: 8, h: 220 },
        at: { x: 4, y: 380 },
      },
      {
        kind: "table",
        schemaId: "property.permits.sanantonio",
        variable: "samples",
        tally: { where: { subject: ["Roof"] } },
        options: { show: "records" },
        layout: { w: 12, h: 280 },
        at: { x: 0, y: 610 },
      },
    ],
  },
  {
    slug: "node-prices",
    name: "Node prices",
    blurb:
      "Every settlement point on the map; click one and the chart and ticker under it follow.",
    author: "Dryos",
    members: [
      {
        kind: "map",
        schemaId: "energy.power.realtime",
        layout: { w: 12, h: 360 },
      },
      {
        kind: "chart",
        schemaId: "energy.power.realtime",
        entities: ["HB_NORTH"],
        options: { window: "-24h", shape: "line" },
        layout: { w: 8, h: 260 },
      },
      {
        kind: "ticker",
        schemaId: "energy.power.realtime",
        entities: ["HB_NORTH"],
        layout: { w: 4, h: DEFAULT_LAYOUT.ticker.h },
      },
    ],
  },
  {
    slug: "zone-load",
    name: "Zone load",
    blurb:
      "Search the forecast zones by name; the load chart and the latest reading retarget on the pick.",
    author: "Dryos",
    members: [
      {
        kind: "picker",
        schemaId: "energy.load.actualfz",
        layout: { w: 4, h: 260 },
      },
      {
        kind: "chart",
        schemaId: "energy.load.actualfz",
        entities: ["NORTH"],
        options: { window: "-7d", shape: "area" },
        layout: { w: 8, h: 260 },
      },
      {
        kind: "ticker",
        schemaId: "energy.load.actualfz",
        entities: ["NORTH"],
        layout: { w: 4, h: DEFAULT_LAYOUT.ticker.h },
      },
    ],
  },
];

/**
 * The published groups, wired the way the tray would wire them: every
 * followable member points at the first source. A group naming a stream the
 * catalogue no longer has is dropped whole — half a group is not the thing
 * that was published.
 */
export function communityGroups(): PublishedGroup[] {
  return PUBLISHED_GROUPS.flatMap((g) => {
    const members = groupMembers(g.members);
    return members
      ? [{ id: g.slug, name: g.name, author: g.author, blurb: g.blurb, members }]
      : [];
  });
}

/**
 * A recipe's members with their references rebuilt and their wiring
 * resolved, or null when any names a stream the catalogue no longer has.
 * Exported for `scripts/seed-page`, which lands an unpublished recipe the
 * same way a published one lands.
 */
export function groupMembers(recipe: RecipePiece[]): PublishedGroupMember[] | null {
  const pieces = recipe.map((m) => ({ m, refs: refsOf(m) }));
  if (pieces.some((p) => !p.refs)) return null;
  const source = pieces.findIndex((p) => emitsPicks({ kind: p.m.kind }));
  // A node pick retargets every query a follower makes, whatever stream it
  // reads, so only a member wholly on the source's streams can follow one —
  // a fuel-mix ticker wired to a price map would ask the fuel mix for a
  // substation. An area picker's filter only narrows its own stream, so a
  // tile elsewhere would wear the wire and never move. A title follows only
  // when its words have a `{pick}` to fill.
  const streams = new Set(source === -1 ? [] : pieces[source].refs!.map((r) => r.schemaId));
  const onSource = (p: (typeof pieces)[number]) =>
    p.m.kind === "text"
      ? (p.m.options?.text ?? "").includes("{pick}")
      : p.refs!.every((r) => streams.has(r.schemaId));
  return pieces.map((p, i) => {
    const refs = p.refs!;
    const follows =
      source !== -1 &&
      i !== source &&
      followable({ kind: p.m.kind, options: p.m.options, refs }) &&
      onSource(p);
    return {
      kind: p.m.kind,
      refs,
      options: p.m.options,
      layout: p.m.layout ?? DEFAULT_LAYOUT[p.m.kind],
      wireTo: follows ? source : undefined,
      at: p.m.at,
    };
  });
}

export function communityGroup(slug: string): PublishedGroup | undefined {
  return communityGroups().find((g) => g.id === slug);
}

/**
 * A group laid onto an empty page: each member at its `at`, or stacked
 * under the one before, with its group-relative wire as the slot itself
 * (an empty page is base 0). The edit route's group branch does the same
 * onto a page that already has tiles, offset by where the drop landed.
 */
export function placeGroup(members: PublishedGroupMember[]): ComponentSpec[] {
  let down = 0;
  return members.map((m) => {
    const at = m.at ?? { x: 0, y: down };
    if (!m.at) down += m.layout.h + GRID.gap;
    return {
      kind: m.kind,
      refs: m.refs,
      options:
        m.wireTo !== undefined
          ? { ...(m.options ?? {}), follow: String(m.wireTo), wireColor: "1" }
          : { ...(m.options ?? {}) },
      layout: { x: at.x, y: at.y, w: m.layout.w, h: m.layout.h },
    };
  });
}

/**
 * A whole first page from a published slug — a group, or one component —
 * unpacked and named. What the landing page's try-it opens a new workspace
 * on, so a visitor lands on exactly what they clicked.
 */
export function recipePage(slug: string): { name: string; manifest: ComponentSpec[] } | null {
  const group = communityGroup(slug);
  if (group) return { name: group.name, manifest: placeGroup(group.members) };
  const c = communityComponent(slug);
  if (!c) return null;
  const layout = c.layout ?? DEFAULT_LAYOUT[c.kind];
  return {
    name: c.name,
    manifest: [
      { kind: c.kind, refs: c.refs, options: { ...(c.options ?? {}) }, layout: { x: 0, y: 0, w: layout.w, h: layout.h } },
    ],
  };
}
