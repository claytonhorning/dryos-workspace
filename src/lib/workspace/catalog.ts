/**
 * The schema tree.
 *
 * A dataset slug is a fact about a collector, not something a domain expert
 * navigates. What they navigate is a path — Energy › Power › Real-time — and
 * the variables underneath it. This file is that tree, and it is the only place
 * that decides what the workspace claims to have.
 *
 * Every stream here is backed by a collector — one entry per ERCOT report,
 * written from the database it serves. The `mock` machinery remains for two
 * jobs: thumbnails render from each variable's declared shape (a shelf tile
 * has no host to answer real queries), and a future stream added ahead of its
 * collector goes back to carrying `availability: "mock"` and its badge. The
 * only report deliberately absent is NP4-183's duplicate table
 * (`ercot-dam-lmp-bus`): the Day-ahead stream serves the same file via
 * `ercot-dam-lmp`, and one report should be one stream.
 */

import { ERCOT_POINTS } from "./geo";

export type Availability = "live" | "mock";

export interface Variable {
  key: string;
  label: string;
  unit: string;
  availability: Availability;
  description: string;
  /** Shape of the synthetic series. Absent on live variables — those are read. */
  mock?: {
    base: number;
    swing: number;
    noise: number;
    floor?: number;
  };
  /**
   * Absolute color breakpoints, so a color means a value rather than a rank.
   *
   * A map colored from the min and max of whatever it just fetched restretches
   * on every refresh: the same red marks $103 on a calm afternoon and $40 an
   * hour later, which makes the color uninterpretable and hides the thing you
   * opened the map for. Declared stops fix a price to a color for good.
   *
   * Linear ramps also fail this data in a second way. Across one interval of
   * ERCOT prices, p1 is $16.68 and p99 is $50.33 while min and max span $136 —
   * so 98% of nodes land inside a quarter of a linear ramp, all one shade,
   * while the congested handful that matter sit alone at the top. Stops let the
   * scale be dense where the readings are and open where the exceptions are.
   *
   * Absent, the map falls back to a percentile-based ramp over what it has,
   * which is still relative but no longer flattened by a single outlier.
   */
  scale?: { at: number; color: string; label?: string }[];
}

export interface Schema {
  id: string;
  /** Domain › sector › stream. What the header shows instead of a slug. */
  path: [string, string, string];
  name: string;
  /**
   * The name where there is no room for the name: a ticker's title, a chip.
   * "RT · LMP" where the full name says "ERCOT real-time LMP". Absent, the
   * full name serves.
   */
  short?: string;
  /** Collector slug. Only live schemas have one. */
  dataset?: string;
  availability: Availability;
  /** How often a new value lands, in words and in seconds. */
  cadence: { label: string; seconds: number };
  /**
   * How far apart two rows are, when that is not how often they arrive.
   *
   * `cadence` is delivery; this is resolution, and for the forward-looking
   * reports they are different numbers. The day-ahead market posts the whole of
   * tomorrow in one file at 12:35 — a daily cadence — but that file is
   * twenty-four hourly rows, and anything reasoning about the *shape* of the
   * data (how many rows a window holds, what a grid cell is) has to ask about
   * the rows rather than the delivery. Read through `grainSeconds`; unset means
   * the two agree, which is true of every real-time feed.
   */
  intervalSeconds?: number;
  /** Dryos tokens burned each time this schema is queried. */
  tokens: number;
  /**
   * `label` is optional and legacy: the UI counts entities generically now
   * ("1,118 entities"), so no stream has to invent a noun. Kept where it
   * exists for prose surfaces that still read it.
   */
  entities: {
    count: number;
    label?: string;
    sample: string[];
  };
  /**
   * The row column that names an entity, present when the stream is small
   * enough to fan out — a stream-level reference then means "all of it", and
   * a chart pivots the rows into one series per entity instead of quietly
   * picking the first sample. Streams with thousands of entities (settlement
   * points, buses) leave this unset: fanning those out is not a chart.
   */
  entityKey?: string;
  /**
   * Which row column names the entity, when the map has to read it directly.
   *
   * Separate from `entityKey` because that one carries a second meaning —
   * "small enough that a stream-level reference fans out" — and the large
   * streams deliberately do not have it. The map still needs to know the
   * column: day-ahead rows say `bus`, real-time says `node`, and a placement
   * path that assumed either would draw one of them and silently nothing for
   * the other. Defaults to `entityKey`, then to `node`.
   */
  entityColumn?: string;
  /**
   * The IANA timezone the source itself operates in — what "source time"
   * means for this stream. Declared only where the domain default is wrong;
   * see `sourceTzOf` for the defaults and the reasoning.
   */
  sourceTz?: string;
  /**
   * Entities a fan-out must leave behind: the aggregate rows the source
   * publishes alongside the parts. Stacking TOTAL on top of the zones it sums
   * counts everything twice.
   */
  entityOmit?: string[];
  blurb: string;
  variables: Variable[];
  /**
   * Rendered as a continuous surface rather than as labelled points.
   *
   * A schema is a field when its entities are a grid rather than named places:
   * plotting seventy cells as pins says nothing, and the same seventy as a
   * shaded surface is the whole picture. The map component reads this to decide
   * which treatment a reference gets.
   */
  field?: boolean;
  /**
   * The field's cells carry a direction as well as a magnitude.
   *
   * A scalar field has one honest treatment — shade it. A vector field has the
   * one everybody recognises: particles let go into the flow and advected
   * through it, which is the only way to read where the air is *going* rather
   * than how hard it is blowing. Naming the two columns here rather than
   * guessing them keeps the declaration in the catalogue, where every other
   * fact about a stream lives.
   *
   * `direction` is the compass bearing the wind blows FROM — the
   * meteorological convention, and the flip that has to happen exactly once on
   * the way to a velocity vector.
   */
  vector?: { speed: string; direction: string };
  /**
   * Entities move, and every row carries where they were.
   *
   * A position feed is not a value per place — it is a place per reading, so the
   * rows carry `lat`, `lon` and a heading alongside the measurements. The map
   * reads this to draw them as tracked objects rather than as fixed pins.
   */
  motion?: boolean;
  /**
   * The rows carry their own `lat`/`lon`, so no lookup table is needed.
   *
   * `geo.ts` exists because the ERCOT feeds publish a price against a *name* and
   * there is no honest way to derive a coordinate from the data — so it supplies
   * approximate centroids, and every popup drawn from it says so. A weather
   * source is the opposite case: NWS puts the station's published coordinates on
   * every observation and a model sample is defined by the point sampled. The
   * position is the source's own answer.
   *
   * So a located schema is exempt from the `hasGeography` check the way `field`
   * and `motion` already are — it cannot fail it, because it brings the answer —
   * and its pins are placed from the rows and drop the "approximate" caveat,
   * which would be a lie about a runway.
   */
  located?: boolean;
  /**
   * The map may place this stream's entities from `geoMock`, which invents them.
   *
   * Separate from `availability` on purpose, because it is a different claim:
   * the *numbers* here are live and collected, and only the *geography* is
   * fabricated. Conflating the two would either brand real prices as mock or
   * let invented positions inherit a live badge, and both are worse than saying
   * exactly which half is made up.
   *
   * Set only on streams ERCOT publishes no coordinates for. Every surface that
   * draws one shows the mock badge — see `geoMock.ts` for why that marking is
   * the whole basis on which this is allowed to exist.
   */
  mockLocations?: boolean;
  /**
   * Who is accountable for this feed. Absent means nobody has claimed it yet —
   * which is the honest state of every schema that has no collector, and the
   * reason the workspace shows the roster rather than hiding the gaps.
   */
  maintainer?: { name: string; since: number };
}

/**
 * The catalogue.
 *
 * Cadence seconds are load-bearing twice over: they set how often an app should
 * refresh, and they generate the mock series at the interval the real thing
 * would publish on — so a mock stream and a live one behave the same way under
 * a five-minute poll.
 */
export const SCHEMAS: Schema[] = [
  {
    id: "energy.power.realtime",
    path: ["Energy", "Pricing", "Real-time"],
    name: "ERCOT real-time LMP",
    short: "RT · LMP",
    dataset: "ercot-realtime-lmp",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 1,
    entities: {
      count: 1118,
      label: "settlement points",
      sample: ["HB_HOUSTON", "HB_NORTH", "LZ_WEST"],
    },
    // ERCOT publishes no coordinates for these, so the map invents them.
    mockLocations: true,
    blurb:
      "Locational marginal prices from the latest SCED run, every ERCOT settlement point. " +
      "Collected from ERCOT MIS, reconciled against the source file.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 1),
    },
    variables: [
      {
        key: "lmp_total",
        label: "Total LMP",
        unit: "$/MWh",
        availability: "live",
        description:
          "The settled price. The only price field ERCOT populates.",
        // Set from the distribution, not by eye — see the Variable.scale note.
        // Over a fortnight (2026-09-05, 2.7M rows) p10 is $21, p25 $25, p50
        // $31, p75 $45, p90 $70, p95 $96; >$100 is 4.5% of readings, >$250 is
        // 2%, negative 0.4%. Stops sit at those quantiles, so the band where
        // two thirds of readings live ($20–$70) gets four steps rather than
        // one — the old $25/$50/$100 stepping painted $45 and $60 alike.
        //
        // Lightness climbs with the value, monotonically (OKLCH L .52 → .94,
        // designed in that space and converted): the hotter the price, the
        // brighter the dot, so the exceptions are the brightest marks on a
        // dark basemap. The old ramp peaked at chartreuse ($50) and *dimmed*
        // toward red ($1000), which made a cap-price node less visible than
        // an ordinary one. Negative is cyan, off the ramp entirely — an
        // oversupplied node is a different state, not a cheap one. Known
        // gap: on a light basemap the top of the ramp fades to the ground
        // and only the dark stroke holds the dot; the scale is not
        // theme-aware yet.
        scale: [
          { at: -50, color: "#41bae4", label: "negative" },
          { at: 0, color: "#734dbe" },
          { at: 20, color: "#af48b7" },
          { at: 30, color: "#e34992" },
          { at: 45, color: "#ff645f" },
          { at: 70, color: "#f99356" },
          { at: 100, color: "#fcb459" },
          { at: 250, color: "#fad371" },
          { at: 1000, color: "#fcef83", label: "cap" },
        ],
        // Preview-only. The data route never generates this schema — it is
        // collected — but a thumbnail has no host to answer its queries, so the
        // preview shim needs a shape to draw. See `runtime.ts`.
        mock: { base: 29, swing: 11, noise: 2.5 },
      },
    ],
  },
  {
    id: "energy.power.dayahead",
    path: ["Energy", "Pricing", "Day-ahead"],
    name: "ERCOT day-ahead hourly LMP",
    short: "DA · LMP",
    dataset: "ercot-dam-lmp-bus",
    availability: "live",
    cadence: { label: "daily, ~12:35 CT", seconds: 86_400 },
    intervalSeconds: 3_600,
    tokens: 0.5,
    // Bus-level, not settlement points: NP4-183 prices every electrical bus,
    // which is what ERCOT actually publishes hourly for the day-ahead market.
    entities: {
      count: 19_312,
      label: "electrical buses",
      sample: ["CADICKS_804V", "ADICKS__138C", "ADK_V_C"],
    },
    // ERCOT publishes no coordinates for these, so the map invents them.
    mockLocations: true,
    entityColumn: "bus",
    blurb:
      "Hourly cleared prices from the day-ahead market for every ERCOT electrical bus, " +
      "posted once for the following day. Collected from ERCOT MIS (NP4-183), " +
      "reconciled against the source file.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "lmp",
        label: "Cleared price",
        unit: "$/MWh",
        availability: "live",
        description:
          "Hourly day-ahead clearing price for the bus.",
        // The real-time ramp, stop for stop — one price, one color, whichever
        // market it cleared in. Its numbers and design are on that schema.
        scale: [
          { at: -50, color: "#41bae4", label: "negative" },
          { at: 0, color: "#734dbe" },
          { at: 20, color: "#af48b7" },
          { at: 30, color: "#e34992" },
          { at: 45, color: "#ff645f" },
          { at: 70, color: "#f99356" },
          { at: 100, color: "#fcb459" },
          { at: 250, color: "#fad371" },
          { at: 1000, color: "#fcef83", label: "cap" },
        ],
        // Preview-only — see the note on the real-time schema.
        mock: { base: 34, swing: 16, noise: 4 },
      },
    ],
  },
  {
    id: "energy.power.load",
    path: ["Energy", "Load", "Actual by weather zone"],
    name: "Actual system load",
    short: "System load",
    dataset: "ercot-actual-load-weather-zone",
    availability: "live",
    // Hourly rows, but ERCOT posts the whole prior day each morning — the
    // cadence a chart should assume is the row cadence, not the publish one.
    cadence: {
      label: "hourly, posted next day",
      seconds: 3_600,
    },
    tokens: 0.5,
    entities: {
      count: 9,
      label: "weather zones",
      sample: ["COAST", "NORTH_C", "TOTAL"],
    },
    entityKey: "zone",
    entityOmit: ["TOTAL"],
    blurb:
      "Metered demand by weather zone, hourly, with ERCOT's own system total as " +
      "its own row. The denominator for scarcity. Collected from ERCOT MIS " +
      "(NP6-345), reconciled against the source file.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "load_mw",
        label: "Actual load",
        unit: "MW",
        availability: "live",
        description:
          "Hourly average metered demand for the zone.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 9_400,
          swing: 3_100,
          noise: 220,
          floor: 0,
        },
      },
    ],
  },
  {
    id: "energy.power.loadforecast",
    path: ["Energy", "Load", "Forecast by weather zone"],
    name: "Seven-day load forecast",
    short: "Load forecast",
    dataset: "ercot-load-forecast-weather-zone",
    availability: "live",
    cadence: {
      label: "hourly, 7 days ahead",
      seconds: 3_600,
    },
    tokens: 0.5,
    entities: {
      count: 9,
      label: "weather zones",
      sample: ["COAST", "NORTH_C", "TOTAL"],
    },
    entityKey: "zone",
    entityOmit: ["TOTAL"],
    blurb:
      "ERCOT's own load forecast by weather zone, refreshed every hour, seven " +
      "days out. Served as the newest view of each hour; every revision is " +
      "kept. Collected from ERCOT MIS (NP3-561), reconciled against the source " +
      "file.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "load_mw",
        label: "Forecast load",
        unit: "MW",
        availability: "live",
        description:
          "Forecast hourly average load for the zone.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 9_400,
          swing: 3_000,
          noise: 90,
          floor: 0,
        },
      },
    ],
  },
  {
    id: "energy.power.genmix",
    path: ["Energy", "Generation", "Fuel mix"],
    name: "Fuel mix",
    short: "Fuel mix",
    dataset: "ercot-fuel-mix",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 0.75,
    entities: {
      count: 8,
      label: "fuel types",
      sample: ["NATURAL_GAS", "WIND", "SOLAR"],
    },
    entityKey: "fuel",
    blurb:
      "Output by fuel type across the interconnect, every five minutes. What is " +
      "actually setting the price. Collected from ERCOT's dashboard feed, which " +
      "retains two days — the history exists because this collector keeps " +
      "running.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "gen_mw",
        label: "Output",
        unit: "MW",
        availability: "live",
        description:
          "Generation for the fuel type over the interval. Storage runs " +
          "negative while charging.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 6_200,
          swing: 4_800,
          noise: 300,
          floor: 0,
        },
      },
    ],
  },
  {
    id: "energy.power.rtspp",
    // Shares the "Real-time" group with the SCED LMP deliberately: both are
    // the live price at every settlement point, five minutes apart in role —
    // the signal and the number settlement actually uses.
    path: ["Energy", "Pricing", "Real-time"],
    name: "Real-time settlement point prices",
    short: "RT · SPP",
    dataset: "ercot-rt-spp",
    availability: "live",
    cadence: { label: "every 15 min", seconds: 900 },
    tokens: 1,
    entities: {
      count: 1118,
      label: "settlement points",
      sample: ["HB_NORTH", "HB_HOUSTON", "LZ_WEST"],
    },
    // Same settlement points as the SCED LMP, same absence of published
    // coordinates — so the map invents them, marked mock.
    mockLocations: true,
    blurb:
      "The 15-minute price settlement actually uses, every ERCOT settlement point — the SCED LMP plus price adders. Collected from ERCOT MIS (NP6-905).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "spp",
        label: "Settlement price",
        unit: "$/MWh",
        availability: "live",
        description:
          "The 15-minute settlement point price.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 30, swing: 12, noise: 3 },
      },
    ],
  },
  {
    id: "energy.power.damspp",
    path: ["Energy", "Pricing", "DAM settlement"],
    name: "DAM settlement point prices",
    short: "DAM · SPP",
    dataset: "ercot-dam-spp",
    availability: "live",
    cadence: { label: "daily, ~12:35 CT", seconds: 86400 },
    intervalSeconds: 3_600,
    tokens: 0.5,
    entities: {
      count: 1118,
      label: "settlement points",
      sample: ["HB_NORTH", "HB_HOUSTON", "LZ_WEST"],
    },
    blurb:
      "Day-ahead hourly settlement point prices for every settlement point, posted once after the DAM run. Collected from ERCOT MIS (NP4-190).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "spp",
        label: "Cleared price",
        unit: "$/MWh",
        availability: "live",
        description:
          "Hourly day-ahead settlement point price.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 34, swing: 15, noise: 4 },
      },
    ],
  },
  {
    id: "energy.power.rtbus",
    path: ["Energy", "Pricing", "RT bus LMP"],
    name: "Real-time LMPs by electrical bus",
    short: "RT · bus LMP",
    dataset: "ercot-rt-lmp-bus",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 1,
    entities: {
      count: 19312,
      label: "electrical buses",
      sample: ["ADICKS__138C", "0001DUPV1_", "0001HWFG1"],
    },
    // ERCOT publishes no coordinates for these, so the map invents them.
    mockLocations: true,
    entityColumn: "bus",
    blurb:
      "Bus-level prices under the settlement points: ~19,000 electrical buses from every SCED run. The heaviest feed ERCOT publishes. Collected from ERCOT MIS (NP6-787).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "lmp",
        label: "Bus LMP",
        unit: "$/MWh",
        availability: "live",
        description:
          "Capped bus-level price — the one settlement uses.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 29, swing: 12, noise: 3.5 },
      },
    ],
  },
  {
    id: "energy.power.indicative",
    path: ["Energy", "Pricing", "Indicative LMP"],
    name: "Indicative LMPs (RTD look-ahead)",
    short: "RTD · LMP",
    dataset: "ercot-indicative-lmp",
    availability: "live",
    cadence: {
      label: "every 5 min, look-ahead",
      seconds: 300,
    },
    tokens: 1,
    entities: {
      count: 1118,
      label: "settlement points",
      sample: ["HB_NORTH", "HB_HOUSTON", "LZ_WEST"],
    },
    // Same settlement points as the SCED LMP, same absence of published
    // coordinates — so the map invents them, marked mock.
    mockLocations: true,
    blurb:
      "Where real-time prices are about to go: RTD's forward intervals for every settlement point, republished each run with every vintage kept. Collected from ERCOT MIS (NP6-970).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "lmp",
        label: "Indicative LMP",
        unit: "$/MWh",
        availability: "live",
        description:
          "Forecast price for the forward interval.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 29, swing: 12, noise: 4 },
      },
    ],
  },
  {
    id: "energy.power.scedlambda",
    path: ["Energy", "Pricing", "System lambda"],
    name: "SCED system lambda",
    short: "SCED · lambda",
    dataset: "ercot-sced-lambda",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 0.25,
    entities: {
      count: 1,
      label: "system series",
      sample: [],
    },
    blurb:
      "The system-wide marginal energy price from every SCED run — one number for what energy is worth in ERCOT right now. Collected from ERCOT MIS (NP6-322).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "system_lambda",
        label: "System lambda",
        unit: "$/MWh",
        availability: "live",
        description:
          "Capped system-wide marginal energy price.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 27, swing: 11, noise: 3 },
      },
    ],
  },
  {
    id: "energy.power.damlambda",
    path: ["Energy", "Pricing", "DAM lambda"],
    name: "DAM system lambda",
    short: "DAM · lambda",
    dataset: "ercot-dam-lambda",
    availability: "live",
    cadence: { label: "daily, ~12:35 CT", seconds: 86400 },
    intervalSeconds: 3_600,
    tokens: 0.25,
    entities: {
      count: 1,
      label: "system series",
      sample: [],
    },
    blurb:
      "The day-ahead hourly system-wide marginal energy price, posted once after the DAM run. Collected from ERCOT MIS (NP4-523).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "system_lambda",
        label: "System lambda",
        unit: "$/MWh",
        availability: "live",
        description: "Hourly day-ahead system lambda.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 31, swing: 13, noise: 3 },
      },
    ],
  },
  {
    id: "energy.power.shadow",
    path: ["Energy", "Pricing", "Shadow prices"],
    name: "DAM shadow prices",
    short: "DAM · shadow",
    dataset: "ercot-dam-shadow-prices",
    availability: "live",
    cadence: { label: "daily, ~12:35 CT", seconds: 86400 },
    intervalSeconds: 3_600,
    tokens: 0.5,
    entities: {
      count: 263,
      label: "binding constraints",
      sample: ["105T105_1", "1080__A", "100027_D_1"],
    },
    blurb:
      "Every binding transmission constraint in the day-ahead market with its limit, cleared flow and shadow price — why nodal prices diverge from the lambda. Collected from ERCOT MIS (NP4-191).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "shadow_price",
        label: "Shadow price",
        unit: "$/MW",
        availability: "live",
        description:
          "Marginal value of one more MW of headroom on the constraint.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 90, swing: 80, noise: 20, floor: 0 },
      },
      {
        key: "constraint_limit_mw",
        label: "Constraint limit",
        unit: "MW",
        availability: "live",
        description: "The binding limit, MW.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 400,
          swing: 250,
          noise: 10,
          floor: 0,
        },
      },
    ],
  },
  {
    id: "energy.power.dambought",
    path: ["Energy", "Pricing", "DAM volumes bought"],
    name: "DAM energy purchased",
    short: "DAM · bought",
    dataset: "ercot-dam-energy-bought",
    availability: "live",
    cadence: { label: "daily, ~12:35 CT", seconds: 86400 },
    intervalSeconds: 3_600,
    tokens: 0.5,
    entities: {
      count: 1049,
      label: "settlement points",
      sample: ["HB_NORTH", "HB_HOUSTON", "LZ_WEST"],
    },
    blurb:
      "Cleared day-ahead purchase volumes per settlement point and hour — the quantity side of the DAM. Collected from ERCOT MIS (NP4-192).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "energy_mwh",
        label: "Energy bought",
        unit: "MWh",
        availability: "live",
        description:
          "Total DAM energy bought at the point in the hour.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 90, swing: 70, noise: 15, floor: 0 },
      },
    ],
  },
  {
    id: "energy.power.damsold",
    path: ["Energy", "Pricing", "DAM volumes sold"],
    name: "DAM energy sold",
    short: "DAM · sold",
    dataset: "ercot-dam-energy-sold",
    availability: "live",
    cadence: { label: "daily, ~12:35 CT", seconds: 86400 },
    intervalSeconds: 3_600,
    tokens: 0.5,
    entities: {
      count: 1049,
      label: "settlement points",
      sample: ["HB_NORTH", "HB_HOUSTON", "LZ_WEST"],
    },
    blurb:
      "Cleared day-ahead sale volumes per settlement point and hour — the supply side of the DAM. Collected from ERCOT MIS (NP4-193).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "energy_mwh",
        label: "Energy sold",
        unit: "MWh",
        availability: "live",
        description:
          "Total DAM energy sold at the point in the hour.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 110, swing: 80, noise: 15, floor: 0 },
      },
    ],
  },
  {
    id: "energy.ancillary.dammcpc",
    path: ["Energy", "Ancillary", "DAM prices"],
    name: "DAM capacity clearing prices",
    short: "DAM · MCPC",
    dataset: "ercot-dam-mcpc",
    availability: "live",
    cadence: { label: "daily, ~12:35 CT", seconds: 86400 },
    intervalSeconds: 3_600,
    tokens: 0.25,
    entities: {
      count: 5,
      label: "AS products",
      sample: ["REGUP", "RRS", "ECRS"],
    },
    entityKey: "as_type",
    blurb:
      "Day-ahead hourly clearing prices for each ancillary service product. Collected from ERCOT MIS (NP4-188).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "mcpc",
        label: "Clearing price",
        unit: "$/MW",
        availability: "live",
        description: "Hourly MCPC for the product.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 6, swing: 5, noise: 1.5, floor: 0 },
      },
    ],
  },
  {
    id: "energy.ancillary.scedmcpc",
    path: ["Energy", "Ancillary", "RT prices"],
    name: "Real-time capacity clearing prices (SCED)",
    short: "SCED · MCPC",
    dataset: "ercot-sced-mcpc",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 0.25,
    entities: {
      count: 5,
      label: "AS products",
      sample: ["REGUP", "RRS", "ECRS"],
    },
    entityKey: "as_type",
    blurb:
      "Real-time capacity clearing prices per product from every SCED run — the RTC-era companion to the energy LMP. Collected from ERCOT MIS (NP6-332).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "mcpc",
        label: "Clearing price",
        unit: "$/MW",
        availability: "live",
        description:
          "Capped real-time MCPC for the product.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 4, swing: 4, noise: 1, floor: 0 },
      },
    ],
  },
  {
    id: "energy.ancillary.rtmcpc",
    path: ["Energy", "Ancillary", "RT settlement"],
    name: "Capacity settlement prices (15-minute)",
    short: "RT · MCPC 15m",
    dataset: "ercot-rt-mcpc",
    availability: "live",
    cadence: { label: "every 15 min", seconds: 900 },
    tokens: 0.25,
    entities: {
      count: 5,
      label: "AS products",
      sample: ["REGUP", "RRS", "ECRS"],
    },
    entityKey: "as_type",
    blurb:
      "The 15-minute settlement clearing price for each ancillary product — what real-time capacity settlement actually uses. Collected from ERCOT MIS (NP6-331).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "mcpc",
        label: "Settlement price",
        unit: "$/MW",
        availability: "live",
        description:
          "15-minute settlement MCPC for the product.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 4, swing: 4, noise: 1, floor: 0 },
      },
    ],
  },
  {
    id: "energy.ancillary.plan",
    path: ["Energy", "Ancillary", "Plan"],
    name: "Ancillary service plan",
    short: "AS plan",
    dataset: "ercot-dam-as-plan",
    availability: "live",
    cadence: { label: "daily, 7-day plan", seconds: 86400 },
    intervalSeconds: 3_600,
    tokens: 0.25,
    entities: {
      count: 5,
      label: "AS products",
      sample: ["REGUP", "RRS", "ECRS"],
    },
    entityKey: "as_type",
    blurb:
      "How much of each service ERCOT plans to procure, per hour, seven days out — republished daily with every revision kept. Collected from ERCOT MIS (NP4-33).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "quantity_mw",
        label: "Planned quantity",
        unit: "MW",
        availability: "live",
        description:
          "Capacity ERCOT plans to procure for the product and hour.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 1800,
          swing: 900,
          noise: 100,
          floor: 0,
        },
      },
    ],
  },
  {
    id: "energy.load.actualfz",
    path: ["Energy", "Load", "Actual by forecast zone"],
    name: "Actual load by forecast zone",
    short: "Zone load",
    dataset: "ercot-actual-load-forecast-zone",
    availability: "live",
    cadence: {
      label: "hourly, posted next day",
      seconds: 3600,
    },
    tokens: 0.5,
    entities: {
      count: 5,
      label: "forecast zones",
      sample: ["HOUSTON", "NORTH", "SOUTH"],
    },
    entityKey: "zone",
    entityOmit: ["TOTAL"],
    blurb:
      "Metered demand by the four forecast zones plus the system total, hourly. Collected from ERCOT MIS (NP6-346).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "load_mw",
        label: "Actual load",
        unit: "MW",
        availability: "live",
        description:
          "Hourly average metered demand for the zone.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 15000,
          swing: 5000,
          noise: 300,
          floor: 0,
        },
      },
    ],
  },
  {
    id: "energy.load.forecastfz",
    path: ["Energy", "Load", "Forecast by forecast zone"],
    name: "Seven-day forecast by forecast zone",
    short: "Zone load fcst",
    dataset: "ercot-load-forecast-forecast-zone",
    availability: "live",
    cadence: {
      label: "hourly, 7 days ahead",
      seconds: 3600,
    },
    tokens: 0.5,
    entities: {
      count: 5,
      label: "forecast zones",
      sample: ["HOUSTON", "NORTH", "SOUTH"],
    },
    entityKey: "zone",
    entityOmit: ["TOTAL"],
    blurb:
      "ERCOT's hourly-refreshed load forecast for the four forecast zones and the system, seven days out — every revision kept. Collected from ERCOT MIS (NP3-560).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "load_mw",
        label: "Forecast load",
        unit: "MW",
        availability: "live",
        description:
          "Forecast hourly average load for the zone.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 15000,
          swing: 5000,
          noise: 150,
          floor: 0,
        },
      },
    ],
  },
  {
    id: "energy.load.demand",
    path: ["Energy", "Load", "System demand"],
    name: "System-wide demand",
    short: "Demand",
    dataset: "ercot-system-demand",
    availability: "live",
    cadence: {
      label: "15-min, posted hourly",
      seconds: 3600,
    },
    intervalSeconds: 900,
    tokens: 0.25,
    entities: {
      count: 1,
      label: "system series",
      sample: [],
    },
    blurb:
      "System-wide actual demand at 15-minute resolution — the one-line answer to how much Texas is using. Collected from ERCOT MIS (NP6-235).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "demand_mw",
        label: "Demand",
        unit: "MW",
        availability: "live",
        description:
          "System-wide 15-minute average demand.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 58000,
          swing: 14000,
          noise: 600,
          floor: 0,
        },
      },
    ],
  },
  {
    id: "energy.load.supplydemand",
    path: ["Energy", "Load", "Supply vs demand"],
    name: "Supply and demand",
    short: "Supply · demand",
    dataset: "ercot-supply-demand",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 0.5,
    entities: {
      count: 1,
      label: "system series",
      sample: [],
    },
    blurb:
      "The grid-conditions headline: 5-minute demand against available committed capacity, from ERCOT's own dashboard feed — which retains two days, so the history exists because the collector keeps running.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "demand_mw",
        label: "Demand",
        unit: "MW",
        availability: "live",
        description: "System demand over the interval.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 58000,
          swing: 14000,
          noise: 600,
          floor: 0,
        },
      },
      {
        key: "capacity_mw",
        label: "Available capacity",
        unit: "MW",
        availability: "live",
        description: "Total available committed capacity.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 78000,
          swing: 10000,
          noise: 500,
          floor: 0,
        },
      },
    ],
  },
  {
    id: "energy.generation.wind",
    path: ["Energy", "Generation", "Wind by load zone"],
    name: "Wind: actual and forecast",
    short: "Wind",
    dataset: "ercot-wind-hourly",
    availability: "live",
    cadence: {
      label: "hourly, rolling week",
      seconds: 3600,
    },
    tokens: 0.5,
    entities: {
      count: 4,
      label: "regions",
      sample: ["LZ_WEST", "LZ_NORTH", "LZ_SOUTH_HOUSTON"],
    },
    entityKey: "region",
    entityOmit: ["SYSTEM"],
    blurb:
      "Hourly averaged actual wind generation and ERCOT's own forecasts, system-wide and by load zone, refreshed hourly. Collected from ERCOT MIS (NP4-732).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "gen_mw",
        label: "Actual generation",
        unit: "MW",
        availability: "live",
        description: "Hourly averaged actual wind output.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 9000,
          swing: 7000,
          noise: 700,
          floor: 0,
        },
      },
      {
        key: "forecast_stf_mw",
        label: "Short-term forecast",
        unit: "MW",
        availability: "live",
        description: "ERCOT's STWPF forecast for the hour.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 9000,
          swing: 7000,
          noise: 400,
          floor: 0,
        },
      },
    ],
  },
  {
    id: "energy.generation.windgeo",
    path: ["Energy", "Generation", "Wind by region"],
    name: "Wind by geographical region",
    short: "Wind · region",
    dataset: "ercot-wind-hourly-geo",
    availability: "live",
    cadence: {
      label: "hourly, rolling week",
      seconds: 3600,
    },
    tokens: 0.5,
    entities: {
      count: 6,
      label: "regions",
      sample: ["PANHANDLE", "COASTAL", "WEST"],
    },
    entityKey: "region",
    entityOmit: ["SYSTEM"],
    blurb:
      "Hourly averaged actual wind generation and forecasts by geographical region — Panhandle, Coastal, South, West, North. Collected from ERCOT MIS (NP4-742).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "gen_mw",
        label: "Actual generation",
        unit: "MW",
        availability: "live",
        description:
          "Hourly averaged actual wind output for the region.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 3000,
          swing: 2500,
          noise: 300,
          floor: 0,
        },
      },
      {
        key: "forecast_stf_mw",
        label: "Short-term forecast",
        unit: "MW",
        availability: "live",
        description: "ERCOT's STWPF forecast for the hour.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 3000,
          swing: 2500,
          noise: 150,
          floor: 0,
        },
      },
    ],
  },
  {
    id: "energy.generation.solar",
    path: ["Energy", "Generation", "Solar"],
    name: "Solar: actual and forecast",
    short: "Solar",
    dataset: "ercot-solar-hourly",
    availability: "live",
    cadence: {
      label: "hourly, rolling week",
      seconds: 3600,
    },
    tokens: 0.5,
    entities: {
      count: 1,
      label: "system series",
      sample: ["SYSTEM"],
    },
    blurb:
      "Hourly averaged actual solar generation and ERCOT's own forecasts, system-wide, refreshed hourly with a rolling week of horizon. Collected from ERCOT MIS (NP4-737).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "gen_mw",
        label: "Actual generation",
        unit: "MW",
        availability: "live",
        description: "Hourly averaged actual solar output.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 12000,
          swing: 12000,
          noise: 800,
          floor: 0,
        },
      },
      {
        key: "forecast_stf_mw",
        label: "Short-term forecast",
        unit: "MW",
        availability: "live",
        description: "ERCOT's STPPF forecast for the hour.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 12000,
          swing: 12000,
          noise: 400,
          floor: 0,
        },
      },
    ],
  },
  {
    id: "energy.generation.solargeo",
    path: ["Energy", "Generation", "Solar by region"],
    name: "Solar by geographical region",
    short: "Solar · region",
    dataset: "ercot-solar-hourly-geo",
    availability: "live",
    cadence: {
      label: "hourly, rolling week",
      seconds: 3600,
    },
    tokens: 0.5,
    entities: {
      count: 7,
      label: "regions",
      sample: ["FAR_WEST", "CENTER_WEST", "FAR_EAST"],
    },
    entityKey: "region",
    entityOmit: ["SYSTEM"],
    blurb:
      "Hourly averaged actual solar generation and forecasts by geographical region — CenterWest through FarEast. Collected from ERCOT MIS (NP4-745).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "gen_mw",
        label: "Actual generation",
        unit: "MW",
        availability: "live",
        description:
          "Hourly averaged actual solar output for the region.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 2500,
          swing: 2500,
          noise: 250,
          floor: 0,
        },
      },
      {
        key: "forecast_stf_mw",
        label: "Short-term forecast",
        unit: "MW",
        availability: "live",
        description: "ERCOT's STPPF forecast for the hour.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 2500,
          swing: 2500,
          noise: 120,
          floor: 0,
        },
      },
    ],
  },
  {
    id: "energy.grid.adders",
    // Pricing, not Grid: the adders are a component of the real-time price,
    // and someone reading prices should find them beside the prices they move.
    path: ["Energy", "Pricing", "Price adders"],
    name: "Real-time price adders and reserves",
    short: "RT · adders",
    dataset: "ercot-rt-price-adders",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 0.5,
    entities: {
      count: 1,
      label: "system series",
      sample: [],
    },
    blurb:
      "The scarcity-pricing feed: reliability deployment price adders, deployments and online reserve limits from every SCED run. Collected from ERCOT MIS (NP6-323).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "system_lambda",
        label: "System lambda",
        unit: "$/MWh",
        availability: "live",
        description: "System lambda for the SCED run.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 27, swing: 11, noise: 3 },
      },
      {
        key: "rtrdpa",
        label: "Reliability adder",
        unit: "$/MWh",
        availability: "live",
        description:
          "Real-time reliability deployment price adder.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 1, swing: 1, noise: 0.5, floor: 0 },
      },
      {
        key: "rtolhsl",
        label: "Online HSL",
        unit: "MW",
        availability: "live",
        description:
          "Aggregate high sustained limit of online resources.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 95000,
          swing: 15000,
          noise: 1000,
          floor: 0,
        },
      },
    ],
  },
  {
    id: "energy.grid.adequacy",
    path: ["Energy", "Grid", "Adequacy"],
    name: "Short-term system adequacy",
    short: "Adequacy",
    dataset: "ercot-short-term-adequacy",
    availability: "live",
    cadence: { label: "hourly, 168h out", seconds: 3600 },
    tokens: 0.5,
    entities: {
      count: 1,
      label: "system series",
      sample: [],
    },
    blurb:
      "ERCOT's own hour-by-hour view of whether it has enough capacity, 168 hours out, refreshed hourly with every revision kept. Collected from ERCOT MIS (NP3-763).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "avail_cap_gen",
        label: "Available capacity",
        unit: "MW",
        availability: "live",
        description:
          "Available generation capacity for the hour.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 90000,
          swing: 15000,
          noise: 1500,
          floor: 0,
        },
      },
      {
        key: "avail_cap_reserve",
        label: "Available reserve",
        unit: "MW",
        availability: "live",
        description:
          "Capacity available as reserve for the hour.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 15000,
          swing: 6000,
          noise: 800,
          floor: 0,
        },
      },
    ],
  },
  {
    id: "energy.grid.outages",
    path: ["Energy", "Grid", "Outages"],
    name: "Resource outage capacity",
    short: "Outages",
    dataset: "ercot-outage-capacity",
    availability: "live",
    cadence: { label: "hourly, week out", seconds: 3600 },
    tokens: 0.5,
    entities: {
      count: 4,
      label: "forecast zones",
      sample: ["HOUSTON", "NORTH", "SOUTH"],
    },
    entityKey: "zone",
    blurb:
      "Capacity on outage by forecast zone, hour by hour for the coming week — total, intermittent and not-yet-commercial. Collected from ERCOT MIS (NP3-233).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "total_resource_mw",
        label: "Capacity on outage",
        unit: "MW",
        availability: "live",
        description:
          "Total resource capacity on outage in the zone.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 2000,
          swing: 1200,
          noise: 150,
          floor: 0,
        },
      },
      {
        key: "total_irr_mw",
        label: "Intermittent on outage",
        unit: "MW",
        availability: "live",
        description:
          "Intermittent renewable capacity on outage.",
        // Preview-only — see the note on the real-time schema.
        mock: {
          base: 1200,
          swing: 900,
          noise: 100,
          floor: 0,
        },
      },
    ],
  },
  {
    id: "energy.grid.temperature",
    path: ["Energy", "Grid", "Temperature"],
    name: "Temperature forecast by weather zone",
    short: "Zone temp fcst",
    dataset: "ercot-temperature-forecast",
    availability: "live",
    cadence: {
      label: "daily, rolling window",
      seconds: 86400,
    },
    intervalSeconds: 3_600,
    tokens: 0.25,
    entities: {
      count: 8,
      label: "weather zones",
      sample: ["COAST", "NORTH_C", "FAR_WEST"],
    },
    entityKey: "zone",
    blurb:
      "The hourly temperature forecast ERCOT plans against, per weather zone, published daily with every revision kept. Collected from ERCOT MIS (NP4-722).",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 29),
    },
    variables: [
      {
        key: "temperature_f",
        label: "Temperature",
        unit: "°F",
        availability: "live",
        description: "Forecast temperature for the zone.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 78, swing: 16, noise: 2 },
      },
    ],
  },

  // ── Weather ──────────────────────────────────────────────────────────
  // The second domain, and the first data in the catalogue that is not
  // ERCOT's. Both streams carry their own coordinates, so both are `located`.
  {
    id: "weather.observations.surface",
    path: ["Weather", "Observations", "Surface"],
    name: "Surface observations",
    short: "Surface obs",
    dataset: "noaa-station-observations",
    availability: "live",
    cadence: {
      label: "hourly, plus specials",
      seconds: 3_600,
    },
    tokens: 0.5,
    entities: {
      count: 25,
      label: "stations",
      sample: ["KAUS", "KDFW", "KIAH"],
    },
    entityKey: "station",
    located: true,
    blurb:
      "What the weather actually did: temperature, dew point, wind, pressure " +
      "and visibility from 25 airport stations across the eight ERCOT weather " +
      "zones. Filed hourly and again whenever conditions change. Collected " +
      "from the NWS API, reconciled against live responses.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 31),
    },
    variables: [
      {
        key: "temperature_c",
        label: "Temperature",
        unit: "°C",
        availability: "live",
        description: "Air temperature at the station.",
        mock: { base: 26, swing: 8, noise: 1.2 },
      },
      {
        key: "dewpoint_c",
        label: "Dew point",
        unit: "°C",
        availability: "live",
        description:
          "Dew point — how much moisture the air is holding.",
        mock: { base: 19, swing: 5, noise: 1 },
      },
      {
        key: "relative_humidity_pct",
        label: "Relative humidity",
        unit: "%",
        availability: "live",
        description:
          "Relative humidity, derived from temperature and dew point.",
        mock: { base: 62, swing: 25, noise: 4, floor: 0 },
      },
      {
        key: "wind_speed_ms",
        label: "Wind speed",
        unit: "m/s",
        availability: "live",
        description:
          "Wind speed at the standard 10 m observing height.",
        mock: { base: 4, swing: 3, noise: 0.8, floor: 0 },
      },
      {
        key: "pressure_hpa",
        label: "Pressure",
        unit: "hPa",
        availability: "live",
        description:
          "Barometric pressure at station level.",
        mock: { base: 1013, swing: 8, noise: 1 },
      },
    ],
  },
  {
    id: "weather.forecast.zone",
    path: ["Weather", "Forecast", "By ERCOT zone"],
    name: "Hourly forecast by weather zone",
    short: "Zone forecast",
    dataset: "openmeteo-zone-forecast",
    availability: "live",
    cadence: {
      label: "hourly, 7 days ahead",
      seconds: 3_600,
    },
    tokens: 0.5,
    entities: {
      count: 8,
      label: "weather zones",
      sample: ["NORTH_C", "COAST", "WEST"],
    },
    entityKey: "zone",
    located: true,
    blurb:
      "Seven days of hourly forecast sampled at each ERCOT weather zone — " +
      "including wind at 100 m and surface irradiance, the two variables that " +
      "predict wind and solar output and that no NOAA endpoint publishes. " +
      "Served as the newest view of each hour; every issue is kept. " +
      "Data by Open-Meteo, CC-BY-4.0.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 31),
    },
    variables: [
      {
        key: "temperature_c",
        label: "Temperature",
        unit: "°C",
        availability: "live",
        description: "Forecast air temperature at 2 m.",
        mock: { base: 27, swing: 9, noise: 1 },
      },
      {
        key: "wind_speed_100m_ms",
        label: "Wind at hub height",
        unit: "m/s",
        availability: "live",
        description:
          "Forecast wind speed at 100 m — turbine hub height, so this is the " +
          "column that predicts wind generation.",
        mock: { base: 7, swing: 4, noise: 1, floor: 0 },
      },
      {
        key: "shortwave_radiation_wm2",
        label: "Irradiance",
        unit: "W/m²",
        availability: "live",
        description:
          "Forecast global horizontal irradiance — what predicts solar output. " +
          "Zero overnight, by definition.",
        mock: {
          base: 380,
          swing: 380,
          noise: 30,
          floor: 0,
        },
      },
      {
        key: "cloud_cover_pct",
        label: "Cloud cover",
        unit: "%",
        availability: "live",
        description: "Forecast total cloud cover.",
        mock: { base: 45, swing: 35, noise: 8, floor: 0 },
      },
      {
        key: "relative_humidity_pct",
        label: "Relative humidity",
        unit: "%",
        availability: "live",
        description: "Forecast relative humidity at 2 m.",
        mock: { base: 58, swing: 25, noise: 5, floor: 0 },
      },
      {
        key: "wind_speed_10m_ms",
        label: "Wind at surface",
        unit: "m/s",
        availability: "live",
        description:
          "Forecast wind speed at 10 m — the height observations report, so " +
          "this is the column that compares to them.",
        mock: { base: 4, swing: 2.5, noise: 0.7, floor: 0 },
      },
    ],
  },
  {
    id: "weather.forecast.official",
    path: ["Weather", "Forecast", "Official (NWS)"],
    name: "NWS forecast by weather zone",
    short: "NWS forecast",
    dataset: "noaa-gridpoint-forecast",
    availability: "live",
    cadence: {
      label: "reissued through the day",
      seconds: 3_600,
    },
    intervalSeconds: 3_600,
    tokens: 0.5,
    entities: {
      count: 8,
      label: "weather zones",
      sample: ["NORTH_C", "COAST", "WEST"],
    },
    entityKey: "zone",
    located: true,
    blurb:
      "The National Weather Service's own forecast for the same eight zones — " +
      "the official record, sampled at the same points as the Open-Meteo " +
      "stream so the two are directly comparable. Carries gusts, chance of " +
      "precipitation and expected accumulation. Each forecast office issues " +
      "on its own schedule and every issue is kept.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 31),
    },
    variables: [
      {
        key: "temperature_c",
        label: "Temperature",
        unit: "°C",
        availability: "live",
        description: "Forecast air temperature.",
        mock: { base: 27, swing: 9, noise: 1 },
      },
      {
        key: "wind_gust_ms",
        label: "Gust",
        unit: "m/s",
        availability: "live",
        description:
          "Forecast peak gust — the column the Open-Meteo stream does not carry.",
        mock: { base: 8, swing: 5, noise: 1.2, floor: 0 },
      },
      {
        key: "precip_probability_pct",
        label: "Chance of precipitation",
        unit: "%",
        availability: "live",
        description:
          "Chance of measurable precipitation. Published over runs of six to " +
          "thirty-five hours, so it is coarser than the hour it sits on.",
        mock: { base: 25, swing: 25, noise: 6, floor: 0 },
      },
      {
        key: "precip_amount_mm",
        label: "Expected rainfall",
        unit: "mm",
        availability: "live",
        description:
          "Accumulation over the run it was published for, repeated on each " +
          "hour of that run — so summing it over a day counts each figure six times.",
        mock: {
          base: 0.4,
          swing: 0.8,
          noise: 0.2,
          floor: 0,
        },
      },
      {
        key: "sky_cover_pct",
        label: "Cloud cover",
        unit: "%",
        availability: "live",
        description: "Forecast cloud cover.",
        mock: { base: 45, swing: 35, noise: 8, floor: 0 },
      },
      {
        key: "wind_speed_ms",
        label: "Wind at surface",
        unit: "m/s",
        availability: "live",
        description: "Forecast sustained wind at 10 m.",
        mock: { base: 4, swing: 2.5, noise: 0.7, floor: 0 },
      },
      {
        key: "relative_humidity_pct",
        label: "Relative humidity",
        unit: "%",
        availability: "live",
        description: "Forecast relative humidity.",
        mock: { base: 58, swing: 25, noise: 5, floor: 0 },
      },
    ],
  },
  {
    id: "weather.forecast.windfield",
    path: ["Weather", "Forecast", "Wind field"],
    name: "Hub-height wind field",
    short: "Wind field",
    dataset: "openmeteo-wind-field",
    availability: "live",
    cadence: { label: "every 3 hours", seconds: 10_800 },
    intervalSeconds: 3_600,
    tokens: 1,
    entities: {
      count: 168,
      label: "grid cells",
      sample: ["G_325_0975", "G_295_0955", "G_335_1015"],
    },
    // A field, and a vector one: the cells are a grid rather than named
    // places, and each carries a direction as well as a speed.
    field: true,
    vector: {
      speed: "wind_speed_100m_ms",
      direction: "wind_direction_100m_deg",
    },
    // Deliberately no entityKey. 168 cells is a surface, not a fan-out — one
    // line per cell is 168 lines and answers nothing.
    blurb:
      "Wind speed and direction at 100 m on a one-degree grid across Texas and " +
      "its surroundings — the field itself, to be drawn rather than charted. " +
      "The grid runs past the state line on purpose: a particle advected to " +
      "the edge of its data dies there, and thinning flow along a border " +
      "reads as weather when it is not. Data by Open-Meteo, CC-BY-4.0.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 7, 31),
    },
    variables: [
      {
        key: "wind_speed_100m_ms",
        label: "Wind speed",
        unit: "m/s",
        availability: "live",
        description:
          "Forecast wind speed at 100 m — turbine hub height.",
        mock: { base: 7, swing: 4, noise: 1, floor: 0 },
      },
      {
        key: "wind_direction_100m_deg",
        label: "Wind direction",
        unit: "°",
        availability: "live",
        description:
          "The compass bearing the wind blows from, at 100 m. The direction " +
          "the air travels is the opposite of this.",
        mock: {
          base: 180,
          swing: 120,
          noise: 15,
          floor: 0,
        },
      },
    ],
  },
];

/** The one schema with a collector behind it. */
export const LIVE_SCHEMA = SCHEMAS.find(
  (s) => s.availability === "live",
)!;

export function schemaById(id: string): Schema | undefined {
  return SCHEMAS.find((s) => s.id === id);
}

/** Resolve either a schema id or a dataset slug — apps reference both. */
export function schemaFor(
  ref: string | undefined,
): Schema | undefined {
  if (!ref) return undefined;
  return SCHEMAS.find(
    (s) => s.id === ref || s.dataset === ref,
  );
}

/** "Energy › Power › Real-time" — the label that replaced the slug. */
export function pathLabel(schema: Schema): string {
  return schema.path.join(" › ");
}

/** The number alone, rounded the way a bill would be. */
export function tokenAmount(tokens: number): string {
  return `${tokens % 1 === 0 ? tokens : tokens.toFixed(2).replace(/0$/, "")}`;
}

/**
 * What a query costs, rounded the way a bill would be.
 *
 * Shown next to every chip because the point of metering is that you see it
 * before you commit to it, not on an invoice a month later. `DRY` is the ticker
 * and it belongs where the reader is already pricing a query — beside a data
 * reference, in a column of them. Somewhere it is the only number on screen,
 * spell it out instead: `creditLabel`.
 */
export function tokenLabel(tokens: number): string {
  return `${tokenAmount(tokens)} DRY`;
}

/**
 * The unit as a plain word, still short: "1 credit", "0.5 credits".
 *
 * For the explorer's cards and the build box's receipts — the surfaces a
 * domain expert prices a query on. "1 DRY" there is a ticker symbol they have
 * to already know; the ledgers and the marketplace keep the ticker, because
 * there the ticker is the pricing argument itself.
 */
export function creditChip(tokens: number): string {
  return `${tokenAmount(tokens)} credit${tokens === 1 ? "" : "s"}`;
}

/**
 * The same figure, with the unit in words.
 *
 * For the one place a number appears with nothing around it to say what it
 * counts. "12 DRY" in the corner of a screen is a ticker symbol somebody has to
 * already know; "12 dryos credits" is the same fact, readable by whoever the
 * screen is left in front of.
 */
export function creditLabel(tokens: number): string {
  return `${tokenAmount(tokens)} dryos credit${tokens === 1 ? "" : "s"}`;
}

/**
 * Seconds between two rows — the resolution of the data, not its delivery.
 *
 * The one question to ask when the answer is about the rows: how many a window
 * holds, and how much time one grid cell is. `cadence.seconds` answers a
 * different question — how often to poll — and for the day-ahead market the two
 * differ by a factor of twenty-four.
 */
export function grainSeconds(schema: Schema): number {
  return schema.intervalSeconds ?? schema.cadence.seconds;
}

/** Per-day cost of holding one query open at the schema's own cadence. */
export function tokensPerDay(schema: Schema): number {
  return (86_400 / schema.cadence.seconds) * schema.tokens;
}

/**
 * One clickable reference to data.
 *
 * Produced only from a tool the server actually ran, and carried whole into the
 * build box. It travels as a record rather than as a line of code because the
 * build box shows it as a chip — a path, a badge and a price — and a person
 * reviewing what their app is about to cost should not have to read a call
 * expression to work it out.
 */
export interface DataRef {
  kind: "schema" | "variable" | "entity" | "query";
  schemaId: string;
  /** "Energy › Power › Real-time". */
  path: string;
  label: string;
  sublabel?: string;
  availability: Availability;
  cadence: string;
  cadenceSeconds: number;
  tokens: number;
  /** The call an app would make. Handed to the build agent, not shown as text. */
  snippet: string;
  /**
   * A stream-level reference narrowed to named entities — "the hubs", "all
   * matching austin". Made only in the explorer, by an explicit select-all
   * over a filtered view: the entities are enumerated at selection time, so
   * the chip says exactly what was made and every consumer reads it
   * literally — no shape reinterprets a selection. Absent, a schema-level
   * reference still means the whole stream (the fan-out rule), and an entity
   * reference stays its own kind.
   */
  subset?: { label: string; entities: string[] };
}

export function makeRef(
  schema: Schema,
  ref: Pick<DataRef, "kind" | "label"> & Partial<DataRef>,
): DataRef {
  return {
    schemaId: schema.id,
    path: pathLabel(schema),
    availability: schema.availability,
    cadence: schema.cadence.label,
    cadenceSeconds: schema.cadence.seconds,
    tokens: schema.tokens,
    snippet: querySnippet(
      schema,
      ref.kind === "entity" || ref.kind === "query"
        ? ref.label
        : undefined,
    ),
    ...ref,
  } as DataRef;
}

/** The call the build agent is told to make for a reference. */
export function querySnippet(
  schema: Schema,
  node?: string,
  start = "-24h",
): string {
  const target = schema.dataset ?? schema.id;
  return node
    ? `dryos.query({ dataset: "${target}", node: "${node}", start: "${start}" })`
    : `dryos.query({ dataset: "${target}", start: "${start}" })`;
}

/**
 * What a set of attached references costs.
 *
 * Deduplicated by call, because two variables from one schema arrive in one
 * query and get billed once. `perRefresh` is what a single pass costs;
 * `perDay` assumes each is polled at its own cadence, which is what the build
 * agent is told to do — the number someone is actually agreeing to when they
 * leave an app open.
 */
export function refreshCost(refs: DataRef[]): {
  perRefresh: number;
  perDay: number;
} {
  const unique = new Map<string, DataRef>();
  for (const r of refs) unique.set(r.snippet, r);
  let perRefresh = 0;
  let perDay = 0;
  for (const r of unique.values()) {
    perRefresh += r.tokens;
    perDay += (86_400 / r.cadenceSeconds) * r.tokens;
  }
  return { perRefresh, perDay: Math.round(perDay) };
}

/**
 * The whole catalogue as clickable references.
 *
 * One box for the schema, then one for each of its variables — the same order
 * the explorer lists them in, and the same `DataRef` shape a tool call produces,
 * so a browsed reference and a looked-up one are indistinguishable downstream.
 *
 * Built here rather than in the component because the build agent, the cost
 * total and the chips all have to agree on what a reference is. Two places
 * constructing them is two places to get the price wrong.
 */
export function catalogRefs(): DataRef[] {
  return SCHEMAS.flatMap((s) => [
    makeRef(s, {
      kind: "schema",
      label: s.name,
      // The card's second line. A count was redundant there — single-entity
      // streams said "1 entity", and fan-outs carry the count as a chip.
      sublabel: blurbLead(s),
      snippet: querySnippet(s),
    }),
    ...s.variables.map((v) =>
      makeRef(s, {
        kind: "variable",
        label: v.label,
        sublabel: `${v.key} · ${v.unit}`,
        availability: v.availability,
        snippet: querySnippet(s, s.entities.sample[0]),
      }),
    ),
  ]);
}

/**
 * The two levels the explorer navigates by.
 *
 * Domain is the subject you work in — Energy, Weather, Aviation — and it is a
 * choice you make once and leave alone, so it belongs in a control that holds a
 * value. Category is the kind of data within it, which is what you flick
 * between, so those are chips.
 */
export function domainOf(schema: Schema): string {
  return schema.path[0];
}

/**
 * What "source time" means for a stream.
 *
 * ERCOT publishes, settles and talks in US Central — its operating day is a
 * Central day, and the heatmap already bucketed there long before this
 * existed — so the Energy domain defaults to America/Chicago. Weather sources
 * (NWS, Open-Meteo) publish in UTC. A stream whose source disagrees with its
 * domain declares `sourceTz` and wins.
 */
export function sourceTzOf(schema: Schema): string {
  return (
    schema.sourceTz ??
    (domainOf(schema) === "Energy"
      ? "America/Chicago"
      : "UTC")
  );
}

export function categoryOf(schema: Schema): string {
  return schema.path[1];
}

export function domains(): string[] {
  return [...new Set(SCHEMAS.map(domainOf))];
}

/**
 * How a map would draw a stream, and how much of it it could place.
 *
 * One function, asked by both the layer picker and the map's own `accepts`, so
 * the coverage a picker promises is literally the coverage the tile draws. Two
 * places computing it separately is two places for the promise to drift from
 * the picture.
 *
 * `null` means the map cannot draw it at all, which is the right filter for a
 * layer list — **not** the domain. The most useful map in this product is
 * cross-domain: a wind field under price pins is the whole argument for
 * collecting weather beside ERCOT, and filtering by domain would forbid exactly
 * that. Domain is a heading in the list, never a gate on it.
 */
export type MapTreatment =
  | {
      how: "surface";
      vector: boolean;
      placed: number;
      total: number;
      invented: false;
    }
  | {
      how: "motion";
      placed: number;
      total: number;
      invented: false;
    }
  | {
      how: "pins";
      placed: number;
      total: number;
      invented: boolean;
    };

/**
 * The most entities one layer can draw, which is the delivery route's own cap.
 *
 * A whole-stream layer asks for every entity at one instant, and
 * `/api/workspace/data` will not return more than this many rows. Day-ahead is
 * 19,312 buses, so a "show me all of it" layer genuinely cannot show all of it
 * — and the number lives here, shared with the generator, so the coverage the
 * picker states is the coverage the tile draws rather than an optimistic
 * promise a cap quietly breaks one layer down.
 */
export const DRAW_CAP = 10_000;

export function mapTreatment(
  schema: Schema,
): MapTreatment | null {
  const total = schema.entities.count;
  if (schema.field)
    return {
      how: "surface",
      vector: Boolean(schema.vector),
      placed: total,
      total,
      invented: false,
    };
  if (schema.motion)
    return {
      how: "motion",
      placed: total,
      total,
      invented: false,
    };
  // Rows carry their own coordinates, or one is invented per entity — either
  // way every entity has a position, and the only limit left is how many rows
  // a single query will return.
  if (schema.located)
    return {
      how: "pins",
      placed: Math.min(total, DRAW_CAP),
      total,
      invented: false,
    };
  if (schema.mockLocations)
    return {
      how: "pins",
      placed: Math.min(total, DRAW_CAP),
      total,
      invented: true,
    };
  const placed = placeableNodes(schema).length;
  return placed
    ? { how: "pins", placed, total, invented: false }
    : null;
}

/**
 * Which of a stream's entities `geo.ts` can actually place.
 *
 * The prefix rule is the one the map's generator already used, lifted here so
 * the two cannot disagree. It is a heuristic over a lookup table of three dozen
 * published aggregates, which is why the number it returns is worth *showing* —
 * "3 of 9 have known locations" is a fact somebody can act on, and a layer that
 * silently drew three ninths of itself is not.
 */
export function placeableNodes(schema: Schema): string[] {
  const sample = schema.entities.sample ?? [];
  if (!sample.length) return [];
  const stem = sample[0].slice(0, 3);
  return Object.keys(ERCOT_POINTS).filter(
    (k) =>
      sample.includes(k) ||
      (stem.length === 3 && k.startsWith(stem)),
  );
}

/** "1,118 placed · invented" — what the picker says under a layer's name. */
export function coverageLabel(t: MapTreatment): string {
  if (t.how === "surface")
    return t.vector ? "vector field" : "scalar field";
  if (t.how === "motion") return "tracked positions";
  const capped =
    t.placed < t.total &&
    (t.invented || t.placed === DRAW_CAP);
  // Three different shortfalls, and they are not interchangeable. Capped means
  // the query stops early. "Known locations" means the coordinates run out.
  // Saying "8 of 1,118" when the truth is "10,000 of 19,312, because that is
  // all one request returns" would send somebody hunting for missing geography
  // that is not the problem.
  if (capped) {
    return `${t.placed.toLocaleString()} of ${t.total.toLocaleString()} drawn${
      t.invented ? " · invented positions" : ""
    }`;
  }
  if (t.invented)
    return `${t.total.toLocaleString()} entities · invented positions`;
  if (t.placed >= t.total)
    return `${t.total.toLocaleString()} placed`;
  return `${t.placed} of ${t.total.toLocaleString()} have known locations`;
}

/** Categories inside one domain, or across all of them. */
export function categories(domain?: string): string[] {
  return [
    ...new Set(
      SCHEMAS.filter(
        (s) => !domain || domainOf(s) === domain,
      ).map(categoryOf),
    ),
  ];
}

/** What a domain costs to browse: how much of it is real. */
export function domainSummary(domain: string): {
  total: number;
  live: number;
} {
  const inDomain = SCHEMAS.filter(
    (s) => domainOf(s) === domain,
  );
  return {
    total: inDomain.length,
    live: inDomain.filter((s) => s.availability === "live")
      .length,
  };
}

/**
 * What a Dryos credit is worth, in dollars.
 *
 * Anchored to the published listing rather than invented here: the real-time
 * tier is $0.85 per 1,000 API calls, and one call against the live schema costs
 * one DRY. A buyer who reads the marketplace page and then reads the cost panel
 * has to arrive at the same number, or one of the two is lying.
 */
export const DRY_USD = 0.85 / 1000;

/** Calls included before anything is charged, from the same listing. */
export const FREE_CALLS_PER_MONTH = 5000;

export function usdLabel(dollars: number): string {
  if (dollars === 0) return "$0.00";
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  if (dollars < 100) return `$${dollars.toFixed(2)}`;
  return `$${Math.round(dollars).toLocaleString()}`;
}

/**
 * A reference to one entity of a stream, from the entity picker.
 *
 * The explorer's own chips stop at streams and variables; for a stream with a
 * thousand settlement points, which ones you mean is a real question, and this
 * is the answer's shape. The sublabel leads with the variable key because that
 * is where `components.ts` reads the column from.
 */
/**
 * A stream-level reference: the whole stream, or an explicit subset of it.
 *
 * The whole-stream form is the fan-out chip the catalogue already hands out —
 * this makes it reachable from the set view, where the big streams live and
 * one click on the card cannot say "all 1,118". The subset form is select-all
 * over a filtered view: one chip, its entities enumerated (and sorted, so the
 * same selection made twice is the same chip and toggles itself off), sent
 * server-side as the query's node filter. A map draws it as one layer; a
 * chart fans it out over exactly those entities.
 *
 * The sublabel leads with the variable key because that is where
 * `components.ts` reads the column from — same contract as `entityRef`.
 */
export function streamRef(
  schema: Schema,
  varKey?: string,
  subset?: { label: string; entities: string[] },
): DataRef {
  const v =
    schema.variables.find((x) => x.key === varKey) ??
    schema.variables[0];
  const target = schema.dataset ?? schema.id;
  const entities = subset
    ? [...subset.entities].sort()
    : undefined;
  return {
    kind: "schema",
    schemaId: schema.id,
    path: pathLabel(schema),
    label: subset
      ? `${schema.name} · ${subset.label}`
      : schema.name,
    sublabel: `${v?.key ?? "value"} · ${
      entities
        ? `${entities.length} of ${entityCountLabel(schema)}`
        : `all ${entityCountLabel(schema)}`
    }`,
    availability: schema.availability,
    cadence: schema.cadence.label,
    cadenceSeconds: schema.cadence.seconds,
    tokens: schema.tokens,
    snippet: entities
      ? `dryos.query({ dataset: ${JSON.stringify(target)}, node: ${JSON.stringify(entities)}, start: "-24h" })`
      : querySnippet(schema),
    ...(entities && subset
      ? { subset: { label: subset.label, entities } }
      : {}),
  };
}

export function entityRef(
  schema: Schema,
  node: string,
  varKey?: string,
): DataRef {
  const v =
    schema.variables.find((x) => x.key === varKey) ??
    schema.variables[0];
  return {
    kind: "entity",
    schemaId: schema.id,
    path: pathLabel(schema),
    label: node,
    sublabel: `${v?.key ?? "value"} · ${schema.name}`,
    availability: schema.availability,
    cadence: schema.cadence.label,
    cadenceSeconds: schema.cadence.seconds,
    tokens: schema.tokens,
    snippet: `dryos.query({ dataset: ${JSON.stringify(schema.dataset ?? schema.id)}, node: ${JSON.stringify(node)}, start: "-24h" })`,
  };
}

/**
 * "1,118 entities" — the generic count. One noun for every industry, so a new
 * stream never has to coin its own "settlement points".
 */
export function entityCountLabel(schema: Schema): string {
  const n = schema.entities.count;
  return `${n.toLocaleString()} ${n === 1 ? "entity" : "entities"}`;
}

/**
 * The blurb's first sentence — what a card has room to say.
 *
 * The full blurb ends in provenance ("Collected from ERCOT MIS…"), which is
 * the landing page's business; the card only needs the half that tells two
 * streams under one heading apart.
 */
export function blurbLead(schema: Schema): string {
  const dot = schema.blurb.indexOf(". ");
  return dot === -1
    ? schema.blurb
    : schema.blurb.slice(0, dot + 1);
}
