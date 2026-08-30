import {
  entityCountLabel,
  entityRef,
  makeRef,
  querySnippet,
  schemaById,
  type DataRef,
} from "./catalog";
import {
  DEFAULT_LAYOUT,
  type ComponentKind,
  type ComponentSpec,
} from "./components";

/**
 * Components somebody published.
 *
 * The third shelf in the build panel, beside the base shapes and the ones you
 * saved yourself. Everything here is Dryos-published today — the same honest
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

interface Recipe {
  slug: string;
  name: string;
  blurb: string;
  /** Who published it. Dryos for now; the shelf is meant to take others. */
  author: string;
  kind: ComponentKind;
  schemaId: string;
  /**
   * The entities it charts. Omitted means the whole stream — which for a
   * stream with an `entityKey` fans out to every entity it has, including
   * ones the source adds later.
   */
  entities?: string[];
  options?: Record<string, string>;
  layout?: { w: number; h: number };
}

const PUBLISHED: Recipe[] = [
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

/** A recipe's references, rebuilt against the catalogue as it stands now. */
function refsOf(recipe: Recipe): DataRef[] | null {
  const schema = schemaById(recipe.schemaId);
  if (!schema) return null;
  if (!recipe.entities) {
    return [
      makeRef(schema, {
        kind: "schema",
        label: schema.name,
        sublabel: entityCountLabel(schema),
        snippet: querySnippet(schema),
      }),
    ];
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
