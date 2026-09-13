import {
  entityCountLabel,
  entityRef,
  makeRef,
  querySnippet,
  schemaById,
  type DataRef,
  type Schema,
} from "./catalog";
import {
  DEFAULT_LAYOUT,
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
}

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
  const schema = schemaById(recipe.schemaId);
  if (!schema) return null;
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

const PUBLISHED_GROUPS: GroupRecipe[] = [
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
    const pieces = g.members.map((m) => ({ m, refs: refsOf(m) }));
    if (pieces.some((p) => !p.refs)) return [];
    const source = pieces.findIndex((p) => emitsPicks({ kind: p.m.kind }));
    const members: PublishedGroupMember[] = pieces.map((p, i) => {
      const refs = p.refs!;
      const follows =
        source !== -1 &&
        i !== source &&
        followable({ kind: p.m.kind, options: p.m.options, refs });
      return {
        kind: p.m.kind,
        refs,
        options: p.m.options,
        layout: p.m.layout ?? DEFAULT_LAYOUT[p.m.kind],
        wireTo: follows ? source : undefined,
      };
    });
    return [{ id: g.slug, name: g.name, author: g.author, blurb: g.blurb, members }];
  });
}

export function communityGroup(slug: string): PublishedGroup | undefined {
  return communityGroups().find((g) => g.id === slug);
}
