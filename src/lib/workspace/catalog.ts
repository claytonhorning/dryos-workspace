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
  /**
   * A measure that only exists once rows are gathered into days or weeks.
   *
   * A permit is an event, not a reading: the question is how many were issued
   * and what they were worth, and no single row answers either. `count` reads
   * the rollup's own `samples` (which is why the variable's key is `samples`),
   * `sum` totals the column. A reference to one of these is a tally — see
   * `Tally` — and every shape asks the API for buckets instead of rows.
   */
  rollup?: "count" | "sum";
}

/**
 * How an event stream is narrowed, broken down and listed.
 *
 * Present on a stream whose rows are events (permits), and read by the
 * explorer's set view to draw its filters. The columns are declared rather than
 * derived because which of a row's text columns a person would narrow on is a
 * judgement — `status` is, a permit number never is — while the *values* on
 * offer are always the data's own, fetched from `/values` when the set opens.
 */
export interface Tally {
  /** The column naming one event — a map pins each, not each ZIP. */
  key?: string;
  /** Text columns a selection narrows on or breaks down by, in offer order. */
  dims: { column: string; label: string }[];
  /** The free-text column a search reads — "roof" in a permit's description. */
  search?: { column: string; label: string };
  /** The table's Records view: which columns, in order, and how to show them. */
  list: {
    column: string;
    label: string;
    kind?: "date" | "money" | "text";
  }[];
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
  /** An event stream's filters, breakdowns and record view. See `Tally`. */
  tally?: Tally;
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
   * Which grid operator an Energy stream comes from — ERCOT, MISO — where the
   * collector slug does not already say. The explorer narrows Energy by it.
   * Read through `isoOf`, which derives it from the slug prefix otherwise, the
   * same rule the API's collectors page uses.
   */
  iso?: string;
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
   * Where a located stream's coordinates come from, when it is not the source
   * itself. NWS puts the station on every observation and needs no note; an
   * ERCOT settlement point is placed by the API from a reference table (EIA's
   * plant coordinates, reached through ERCOT's unit mapping), and the legend
   * says so, because the position is a join and not a publication.
   */
  locatedBy?: string;
  /**
   * How many of the entities the API can place, for a located stream whose
   * table is partial. Read from `/v1/reference/node-locations/{iso}` when the
   * catalogue was last written (the build scripts print it); the coverage
   * line under a layer is this over `entities.count`.
   */
  locatedCount?: number;
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
    // ERCOT publishes no coordinates. The API places a resource node through
    // its unit — the Settlement Points List names it, the CDR report names it
    // in words, EIA-860M locates that plant — and puts lat/lon on every row;
    // hubs and zones have no place and fall back to `geo.ts` centroids.
    located: true,
    locatedBy: "EIA-860M plant coordinates, through ERCOT's unit mapping",
    locatedCount: 698,
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
          { at: -50, color: "#2166ac", label: "negative" },
          { at: 0, color: "#4393c3" },
          { at: 20, color: "#92c5de" },
          { at: 30, color: "#c9c9c9" },
          { at: 45, color: "#f4a582" },
          { at: 70, color: "#e5795e" },
          { at: 100, color: "#d6604d" },
          { at: 250, color: "#e0243a" },
          { at: 500, color: "#ff2fd0" },
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
    // Electrical buses, not settlement points: the node location table does
    // not reach them yet, so this stream is not mappable. The same ERCOT file
    // maps a bus to its substation when it is worth extending.
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
          { at: -50, color: "#2166ac", label: "negative" },
          { at: 0, color: "#4393c3" },
          { at: 20, color: "#92c5de" },
          { at: 30, color: "#c9c9c9" },
          { at: 45, color: "#f4a582" },
          { at: 70, color: "#e5795e" },
          { at: 100, color: "#d6604d" },
          { at: 250, color: "#e0243a" },
          { at: 500, color: "#ff2fd0" },
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
    // Same settlement points as the SCED LMP, placed the same way by the API.
    located: true,
    locatedBy: "EIA-860M plant coordinates, through ERCOT's unit mapping",
    locatedCount: 698,
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
    // Electrical buses, not settlement points: the node location table does
    // not reach them yet, so this stream is not mappable. The same ERCOT file
    // maps a bus to its substation when it is worth extending.
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
    // Same settlement points as the SCED LMP, placed the same way by the API.
    located: true,
    locatedBy: "EIA-860M plant coordinates, through ERCOT's unit mapping",
    locatedCount: 698,
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
  // ── MISO ───────────────────────────────────────────────────────────────
  // Eight streams, one per collector, landed 2026-09-06. Every one reads
  // MISO's public dashboard API — the only intraday source, since the keyed
  // Data Exchange serves a market day only once it is over — and every one
  // is Eastern Standard Time all year, which `sourceTzOf` knows. Same
  // sectors as ERCOT on purpose: the chips are the question, the ISO select
  // is where.
  {
    id: "energy.miso.realtime",
    path: ["Energy", "Pricing", "Real-time"],
    name: "MISO real-time LMP",
    short: "RT · LMP",
    dataset: "miso-realtime-lmp",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 1,
    entities: {
      count: 2628,
      label: "pricing nodes",
      sample: ["INDIANA.HUB", "ILLINOIS.HUB", "MICHIGAN.HUB"],
    },
    // Placed by the API from MISO's own node table: 260 generator nodes and
    // 57 hubs, zones and interfaces sit where MISO's LMP contour map draws
    // them, and 414 more generator nodes are matched by name to EIA-860M's
    // MISO plants (`scripts/build_iso_node_locations.py --iso miso`). The
    // remaining generator nodes and the hubs MISO does not draw read null.
    located: true,
    locatedBy:
      "EIA-860M plant coordinates, matched by the name in the node; hubs and 260 " +
      "generators where MISO's own map draws them",
    locatedCount: 731,
    blurb:
      "Preliminary ex-post prices for every MISO commercial pricing node — hubs, " +
      "load zones, generator nodes and interfaces — with the congestion and loss " +
      "components, every five minutes. Collected from MISO's public real-time " +
      "feed and checked against the Data Exchange copy of the same day.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 6),
    },
    variables: [
      {
        key: "lmp_total",
        label: "Total LMP",
        unit: "$/MWh",
        availability: "live",
        description: "The five-minute preliminary ex-post price at the node.",
        // The ERCOT ramp, stop for stop — one price, one color, whichever
        // market it cleared in.
        scale: [
          { at: -50, color: "#2166ac", label: "negative" },
          { at: 0, color: "#4393c3" },
          { at: 20, color: "#92c5de" },
          { at: 30, color: "#c9c9c9" },
          { at: 45, color: "#f4a582" },
          { at: 70, color: "#e5795e" },
          { at: 100, color: "#d6604d" },
          { at: 250, color: "#e0243a" },
          { at: 500, color: "#ff2fd0" },
        ],
        mock: { base: 28, swing: 10, noise: 2.5 },
      },
      {
        key: "lmp_congestion",
        label: "Congestion",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal congestion component — the part that differs between nodes.",
        mock: { base: 0, swing: 6, noise: 1.5 },
      },
      {
        key: "lmp_loss",
        label: "Losses",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal loss component.",
        mock: { base: -0.5, swing: 1.2, noise: 0.3 },
      },
      {
        key: "lmp_energy",
        label: "Energy",
        unit: "$/MWh",
        availability: "live",
        description:
          "System marginal energy cost — the same number at every node in an " +
          "interval. Derived as LMP minus congestion minus losses, MISO's own identity.",
        mock: { base: 28, swing: 9, noise: 2 },
      },
    ],
  },
  {
    id: "energy.miso.exante",
    path: ["Energy", "Pricing", "Ex-ante hubs"],
    name: "MISO ex-ante hub LMP",
    short: "Ex-ante · LMP",
    dataset: "miso-exante-lmp",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 0.25,
    entities: {
      count: 9,
      label: "hubs and interfaces",
      sample: ["INDIANA.HUB", "ILLINOIS.HUB", "SWPP"],
    },
    entityKey: "node",
    blurb:
      "The forward-looking price at MISO's eight trading hubs and the SPP seam: " +
      "what the next dispatch is about to clear at, published just before each " +
      "interval. Beside the ex-post price it is the market's forecast error, five " +
      "minutes at a time.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 6),
    },
    variables: [
      {
        key: "lmp_total",
        label: "Ex-ante LMP",
        unit: "$/MWh",
        availability: "live",
        description: "The ex-ante price for the coming interval.",
        scale: [
          { at: -50, color: "#2166ac", label: "negative" },
          { at: 0, color: "#4393c3" },
          { at: 20, color: "#92c5de" },
          { at: 30, color: "#c9c9c9" },
          { at: 45, color: "#f4a582" },
          { at: 70, color: "#e5795e" },
          { at: 100, color: "#d6604d" },
          { at: 250, color: "#e0243a" },
          { at: 500, color: "#ff2fd0" },
        ],
        mock: { base: 28, swing: 10, noise: 2.5 },
      },
      {
        key: "lmp_congestion",
        label: "Congestion",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal congestion component.",
        mock: { base: 0, swing: 4, noise: 1 },
      },
    ],
  },
  {
    id: "energy.miso.ancillary",
    path: ["Energy", "Ancillary", "Clearing prices"],
    name: "MISO ancillary clearing prices",
    short: "MCP",
    dataset: "miso-ancillary-mcp",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 0.25,
    entities: {
      count: 9,
      label: "products",
      sample: ["GEN_REG", "GEN_SPIN", "STR"],
    },
    entityKey: "as_type",
    blurb:
      "Market clearing prices for regulation, spinning, supplemental, short-term " +
      "and ramp reserves, real-time every five minutes and day-ahead by the hour, " +
      "in each of MISO's eight reserve zones. The zones price alike nearly always; " +
      "a product is one series here, and a row carries which zone and market it is.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 6),
    },
    variables: [
      {
        key: "mcp",
        label: "Clearing price",
        unit: "$/MW",
        availability: "live",
        description: "The clearing price for the product, $/MW per hour.",
        mock: { base: 6, swing: 5, noise: 1.5, floor: 0 },
      },
    ],
  },
  {
    id: "energy.miso.genmix",
    path: ["Energy", "Generation", "Fuel mix"],
    name: "MISO fuel mix",
    short: "Fuel mix",
    dataset: "miso-fuel-mix",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 0.75,
    entities: {
      count: 8,
      label: "fuel categories",
      sample: ["NATURAL_GAS", "COAL", "WIND"],
    },
    entityKey: "fuel",
    blurb:
      "Output by fuel category across the Midcontinent footprint every five " +
      "minutes — coal, gas, nuclear, wind, solar, storage, imports and other. " +
      "From MISO's own dashboard feed, which keeps two days; the history exists " +
      "because this collector keeps running.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 6),
    },
    variables: [
      {
        key: "gen_mw",
        label: "Output",
        unit: "MW",
        availability: "live",
        description:
          "Generation for the category at the reading. Imports is net " +
          "interchange counted as supply, so it runs negative on export.",
        mock: { base: 12_000, swing: 9_000, noise: 400, floor: 0 },
      },
    ],
  },
  {
    id: "energy.miso.load",
    path: ["Energy", "Load", "System demand"],
    name: "MISO system load",
    short: "Demand",
    dataset: "miso-system-load",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 0.25,
    entities: {
      count: 1,
      label: "system series",
      sample: [],
    },
    blurb:
      "MISO-wide real-time demand every five minutes — the number behind the " +
      "Current Demand tile on MISO's front page. The feed keeps only today, so " +
      "yesterday is here because it was collected.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 6),
    },
    variables: [
      {
        key: "demand_mw",
        label: "Demand",
        unit: "MW",
        availability: "live",
        description: "MISO-wide demand at the reading.",
        mock: { base: 82_000, swing: 22_000, noise: 700, floor: 0 },
      },
    ],
  },
  {
    id: "energy.miso.windsolar",
    path: ["Energy", "Generation", "Wind and solar"],
    name: "MISO wind and solar",
    short: "Wind · solar",
    dataset: "miso-wind-solar",
    availability: "live",
    cadence: { label: "hourly, two days ahead", seconds: 3600 },
    intervalSeconds: 3_600,
    tokens: 0.25,
    entities: {
      count: 2,
      label: "resources",
      sample: ["WIND", "SOLAR"],
    },
    entityKey: "resource",
    blurb:
      "Hourly wind and solar output against MISO's own forecast for today and " +
      "tomorrow, republished every hour and kept as vintages — so a forecast " +
      "can be scored against what it said at the time, not only what it says now.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 6),
    },
    variables: [
      {
        key: "actual_mw",
        label: "Actual",
        unit: "MW",
        availability: "live",
        description:
          "Metered output for the hour. Empty for hours that have not " +
          "happened; slightly negative for solar at night, which is the plants' own load.",
        mock: { base: 9_000, swing: 7_000, noise: 500, floor: 0 },
      },
      {
        key: "forecast_mw",
        label: "Forecast",
        unit: "MW",
        availability: "live",
        description: "MISO's forecast for the hour, as of this vintage.",
        mock: { base: 9_500, swing: 7_000, noise: 200, floor: 0 },
      },
    ],
  },
  {
    id: "energy.miso.nai",
    path: ["Energy", "Grid", "Net interchange"],
    name: "MISO net actual interchange",
    short: "NAI",
    dataset: "miso-net-interchange",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 0.25,
    entities: {
      count: 1,
      label: "system series",
      sample: [],
    },
    blurb:
      "What is actually flowing across MISO's borders every five minutes, net. " +
      "Negative is a net import. A rolling day at the source; the rest is collected.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 6),
    },
    variables: [
      {
        key: "nai_mw",
        label: "Net interchange",
        unit: "MW",
        availability: "live",
        description: "Net actual interchange; negative is a net import into MISO.",
        mock: { base: -1_500, swing: 1_800, noise: 200 },
      },
    ],
  },
  {
    id: "energy.miso.nsi",
    path: ["Energy", "Grid", "Scheduled interchange"],
    name: "MISO scheduled interchange",
    short: "NSI",
    dataset: "miso-scheduled-interchange",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 0.5,
    entities: {
      count: 10,
      label: "counterparties",
      sample: ["PJM", "SWPP", "TVA"],
    },
    entityKey: "counterparty",
    // The MISO row is the total of the other nine; stacking it on them
    // counts everything twice.
    entityOmit: ["MISO"],
    blurb:
      "Scheduled interchange with each neighbouring balancing authority every " +
      "five minutes — PJM, SPP, TVA, AECI, Ontario, Manitoba and the rest — plus " +
      "the MISO total. Negative is a net import.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 6),
    },
    variables: [
      {
        key: "nsi_mw",
        label: "Scheduled",
        unit: "MW",
        availability: "live",
        description: "Net scheduled interchange with the counterparty; negative is an import.",
        mock: { base: -800, swing: 1_500, noise: 150 },
      },
    ],
  },
  // ── SPP ────────────────────────────────────────────────────────────────
  // SPP's marketplace portal: public files, no key, the latest interval at a
  // fixed path and every other one filed by date. Central prevailing time,
  // which is the Energy default in `sourceTzOf`, and every row carries UTC
  // beside it anyway.
  {
    id: "energy.spp.realtime",
    path: ["Energy", "Pricing", "Real-time"],
    name: "SPP real-time LMP",
    short: "RT · LMP",
    dataset: "spp-realtime-lmp",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 1,
    entities: {
      count: 1612,
      label: "settlement locations",
      sample: ["SPPNORTH_HUB", "SPPSOUTH_HUB", "SWPW_HUB"],
    },
    // Placed by the API from SPP's node table: 512 of the 985 resources are
    // matched by the plant and unit their names carry to EIA-860M's plants in
    // the market's balancing authorities (`scripts/build_iso_node_locations.py
    // --iso spp`), and the 45 hubs, interfaces and DC ties SPP's own price
    // contour map draws sit where it draws them. Load areas and demand
    // response are regions, and read null.
    located: true,
    locatedBy:
      "EIA-860M plant coordinates, matched by the plant and unit in the name; hubs, " +
      "interfaces and DC ties where SPP's own price map draws them",
    locatedCount: 557,
    blurb:
      "Real-time balancing market prices at every SPP settlement location — the " +
      "trading hubs, load areas, resources, demand response and the interfaces with " +
      "its neighbours — with the energy, congestion and loss components, every five " +
      "minutes. SPP's western market is in the same file and clears on its own " +
      "energy price, so SWPW_HUB and SPPNORTH_HUB can sit thirty dollars apart.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 12),
    },
    variables: [
      {
        key: "lmp_total",
        label: "Total LMP",
        unit: "$/MWh",
        availability: "live",
        description: "The five-minute real-time price at the settlement location.",
        // The ERCOT ramp, stop for stop — one price, one color, whichever
        // market it cleared in.
        scale: [
          { at: -50, color: "#2166ac", label: "negative" },
          { at: 0, color: "#4393c3" },
          { at: 20, color: "#92c5de" },
          { at: 30, color: "#c9c9c9" },
          { at: 45, color: "#f4a582" },
          { at: 70, color: "#e5795e" },
          { at: 100, color: "#d6604d" },
          { at: 250, color: "#e0243a" },
          { at: 500, color: "#ff2fd0" },
        ],
        mock: { base: 26, swing: 12, noise: 3 },
      },
      {
        key: "lmp_congestion",
        label: "Congestion",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal congestion component — the part that differs between locations.",
        mock: { base: 0, swing: 8, noise: 2 },
      },
      {
        key: "lmp_loss",
        label: "Losses",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal loss component.",
        mock: { base: 0, swing: 1.5, noise: 0.4 },
      },
      {
        key: "lmp_energy",
        label: "Energy",
        unit: "$/MWh",
        availability: "live",
        description:
          "Marginal energy component, published by SPP. One number per market per " +
          "interval: the RTO's and the western market's differ.",
        mock: { base: 26, swing: 10, noise: 2 },
      },
    ],
  },
  // ── CAISO ──────────────────────────────────────────────────────────────
  // CAISO's OASIS: public, no key, asked for a UTC window and answered with
  // long rows, one per node and price component. Every row carries GMT; the
  // market's own clock is Pacific prevailing, which `sourceTzOf` knows.
  {
    id: "energy.caiso.realtime",
    path: ["Energy", "Pricing", "Real-time"],
    name: "CAISO real-time LMP",
    short: "RT · LMP",
    dataset: "caiso-realtime-lmp",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 1,
    entities: {
      count: 2757,
      label: "pricing nodes",
      sample: ["TH_NP15_GEN-APND", "TH_SP15_GEN-APND", "DLAP_PGAE-APND"],
    },
    // Placed by the API from CAISO's node table (`scripts/build_iso_node_locations.py
    // --iso caiso`): 131 resources where the price map on caiso.com draws their
    // substation, 246 matched by name to EIA-860M's plants in the Western EIM
    // area the node's own energy price puts it in, and 61 units beside a placed
    // sibling. Demand resources, hubs and load aggregation points are not
    // places, and read null.
    located: true,
    locatedBy:
      "EIA-860M plant coordinates, matched by name within the area the node's energy " +
      "price puts it in; and the substations CAISO's own price map draws",
    locatedCount: 438,
    blurb:
      "Real-time dispatch prices at every CAISO aggregated pricing node — the NP15, " +
      "SP15 and ZP26 trading hubs, the utilities' load aggregation points, resources, " +
      "and the pricing points of every Western Energy Imbalance Market area — with the " +
      "energy, congestion, loss and greenhouse-gas components, every five minutes.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 12),
    },
    variables: [
      {
        key: "lmp_total",
        label: "Total LMP",
        unit: "$/MWh",
        availability: "live",
        description: "The five-minute real-time price at the pricing node.",
        // The ERCOT ramp, stop for stop — one price, one color, every operator.
        scale: [
          { at: -50, color: "#2166ac", label: "negative" },
          { at: 0, color: "#4393c3" },
          { at: 20, color: "#92c5de" },
          { at: 30, color: "#c9c9c9" },
          { at: 45, color: "#f4a582" },
          { at: 70, color: "#e5795e" },
          { at: 100, color: "#d6604d" },
          { at: 250, color: "#e0243a" },
          { at: 500, color: "#ff2fd0" },
        ],
        mock: { base: 26, swing: 14, noise: 3 },
      },
      {
        key: "lmp_congestion",
        label: "Congestion",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal congestion component — the part that differs between nodes.",
        mock: { base: 0, swing: 8, noise: 2 },
      },
      {
        key: "lmp_loss",
        label: "Losses",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal loss component.",
        mock: { base: 0, swing: 1.5, noise: 0.4 },
      },
      {
        key: "lmp_energy",
        label: "Energy",
        unit: "$/MWh",
        availability: "live",
        description:
          "Marginal energy component, published by CAISO. Not one number per " +
          "interval: the Western EIM areas balance separately, and their energy " +
          "prices part when transfers between them bind.",
        mock: { base: 26, swing: 10, noise: 2 },
      },
      {
        key: "lmp_ghg",
        label: "Greenhouse gas",
        unit: "$/MWh",
        availability: "live",
        description:
          "Greenhouse-gas component — CAISO's price for compliance on energy " +
          "delivered into California. Usually zero.",
        mock: { base: 0, swing: 0.5, noise: 0.1 },
      },
    ],
  },
  // ── NYISO ──────────────────────────────────────────────────────────────
  // NYISO's MIS: public files, no key, a day to a file and the newest
  // interval at a fixed path. Eastern prevailing, which `sourceTzOf` knows;
  // no row carries UTC, so the collector localises every stamp itself.
  {
    id: "energy.nyiso.realtime",
    path: ["Energy", "Pricing", "Real-time"],
    name: "NYISO real-time LMP",
    short: "RT · LMP",
    dataset: "nyiso-realtime-lmp",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 1,
    entities: {
      count: 763,
      label: "pricing points",
      sample: ["N.Y.C.", "LONGIL", "WEST"],
    },
    // Placed by the API from NYISO's own generator reference, which carries a
    // coordinate against the PTID each bus is priced under
    // (`scripts/build_iso_node_locations.py --iso nyiso`). Zones and the
    // proxies are regions and borders, and the load buses no generator is
    // registered to are not attempted; both read null.
    located: true,
    locatedBy: "NYISO's own generator reference, which gives each bus its coordinate",
    locatedCount: 561,
    blurb:
      "Real-time dispatch prices at NYISO's eleven load zones — New York City, Long " +
      "Island and the rest, lettered A to K — its proxies with Quebec, New England, " +
      "Ontario and PJM, and every generator bus, with the energy, congestion and loss " +
      "components, every five minutes.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 12),
    },
    variables: [
      {
        key: "lmp_total",
        label: "Total LMP",
        unit: "$/MWh",
        availability: "live",
        description: "The five-minute real-time price at the zone or bus — NYISO calls it the LBMP.",
        // The ERCOT ramp, stop for stop — one price, one color, every operator.
        scale: [
          { at: -50, color: "#2166ac", label: "negative" },
          { at: 0, color: "#4393c3" },
          { at: 20, color: "#92c5de" },
          { at: 30, color: "#c9c9c9" },
          { at: 45, color: "#f4a582" },
          { at: 70, color: "#e5795e" },
          { at: 100, color: "#d6604d" },
          { at: 250, color: "#e0243a" },
          { at: 500, color: "#ff2fd0" },
        ],
        mock: { base: 40, swing: 16, noise: 4 },
      },
      {
        key: "lmp_congestion",
        label: "Congestion",
        unit: "$/MWh",
        availability: "live",
        description:
          "Marginal congestion component — the part that differs between points. " +
          "NYISO publishes it with the opposite sign; here it adds to the price like " +
          "every other operator's.",
        mock: { base: 0, swing: 8, noise: 2 },
      },
      {
        key: "lmp_loss",
        label: "Losses",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal loss component.",
        mock: { base: 0, swing: 2, noise: 0.5 },
      },
      {
        key: "lmp_energy",
        label: "Energy",
        unit: "$/MWh",
        availability: "live",
        description:
          "Marginal energy component, derived as the price less losses and congestion " +
          "— NYISO does not publish it. One number across the state each interval.",
        mock: { base: 40, swing: 14, noise: 3 },
      },
    ],
  },
  // ── ISO-NE ─────────────────────────────────────────────────────────────
  // ISO Express: public files, no key, the newest interval and the last
  // four hours behind ISO Express's session cookie, closed four-hour blocks
  // open to anyone. Eastern prevailing, which `sourceTzOf` knows; no row
  // carries UTC, so the collector localises every stamp itself.
  {
    id: "energy.isone.realtime",
    path: ["Energy", "Pricing", "Real-time"],
    name: "ISO-NE real-time LMP",
    short: "RT · LMP",
    dataset: "isone-realtime-lmp",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 1,
    entities: {
      count: 1205,
      label: "pricing locations",
      sample: [".H.INTERNAL_HUB", ".Z.NEMASSBOST", ".Z.CONNECTICUT"],
    },
    // Placed by the API from ISO-NE's own pricing-node table, which gives
    // every network node — units and load nodes alike — its substation's
    // coordinate (`scripts/build_iso_node_locations.py --iso isone`). The
    // Hub, the zones, the external nodes and the demand-response zones are
    // regions and borders and read null.
    located: true,
    locatedBy: "ISO-NE's own pricing-node table, which gives each node its substation's coordinate",
    locatedCount: 1137,
    blurb:
      "Preliminary real-time prices at ISO New England's Internal Hub, its eight load " +
      "zones from Maine to Connecticut, its ties with New York, Québec and New " +
      "Brunswick, and every generator and load node, with the energy, congestion and " +
      "loss components, every five minutes.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 13),
    },
    variables: [
      {
        key: "lmp_total",
        label: "Total LMP",
        unit: "$/MWh",
        availability: "live",
        description: "The five-minute real-time price at the location, as ISO-NE first publishes it.",
        // The ERCOT ramp, stop for stop — one price, one color, every operator.
        scale: [
          { at: -50, color: "#2166ac", label: "negative" },
          { at: 0, color: "#4393c3" },
          { at: 20, color: "#92c5de" },
          { at: 30, color: "#c9c9c9" },
          { at: 45, color: "#f4a582" },
          { at: 70, color: "#e5795e" },
          { at: 100, color: "#d6604d" },
          { at: 250, color: "#e0243a" },
          { at: 500, color: "#ff2fd0" },
        ],
        mock: { base: 40, swing: 16, noise: 4 },
      },
      {
        key: "lmp_congestion",
        label: "Congestion",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal congestion component — the part that differs between locations.",
        mock: { base: 0, swing: 8, noise: 2 },
      },
      {
        key: "lmp_loss",
        label: "Losses",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal loss component.",
        mock: { base: 0, swing: 2, noise: 0.5 },
      },
      {
        key: "lmp_energy",
        label: "Energy",
        unit: "$/MWh",
        availability: "live",
        description:
          "Marginal energy component, as ISO-NE publishes it. One number across New England each interval.",
        mock: { base: 40, swing: 14, noise: 3 },
      },
    ],
  },
  // ── PJM ────────────────────────────────────────────────────────────────
  // Seven streams, one per collector, landed 2026-09-09. Every one reads
  // PJM's Data Miner 2 on a key that allows six requests a minute; the
  // collectors pace themselves. Eastern Prevailing Time, which observes
  // daylight saving, so `sourceTzOf` answers America/New_York — and every
  // row carries its own UTC stamp, so nothing is localised on the way in.
  // The LMP feeds are split the way ERCOT's are: aggregates (hubs, zones,
  // interfaces, EHV and the rest — 482 nodes) as the stream people ask for,
  // and the 13,967 electrical buses as their own, heavier one.
  {
    id: "energy.pjm.realtime",
    path: ["Energy", "Pricing", "Real-time"],
    name: "PJM real-time LMP",
    short: "RT · LMP",
    dataset: "pjm-realtime-lmp",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 1,
    entities: {
      count: 482,
      label: "aggregate pricing nodes",
      sample: ["WESTERN HUB", "PJM-RTO", "COMED"],
    },
    // Every node here is an aggregate — a hub, a zone, an interface, an EHV
    // set — and an aggregate has no place, so this stream is not located.
    // The buses are (`energy.pjm.rtbus`): a generator bus is a plant.
    blurb:
      "Unverified five-minute prices at PJM's 12 trading hubs, 22 transmission " +
      "zones, 7 interfaces and every other aggregate pricing node, with the " +
      "congestion and loss components, about four minutes after the interval " +
      "starts. Unverified is PJM's word: the verified copy posts the next business " +
      "day and 28 of 14,449 nodes differed on the interval checked, most by rounding.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 9),
    },
    variables: [
      {
        key: "lmp_total",
        label: "Total LMP",
        unit: "$/MWh",
        availability: "live",
        description: "The five-minute unverified real-time price at the node.",
        scale: [
          { at: -50, color: "#2166ac", label: "negative" },
          { at: 0, color: "#4393c3" },
          { at: 20, color: "#92c5de" },
          { at: 30, color: "#c9c9c9" },
          { at: 45, color: "#f4a582" },
          { at: 70, color: "#e5795e" },
          { at: 100, color: "#d6604d" },
          { at: 250, color: "#e0243a" },
          { at: 500, color: "#ff2fd0" },
        ],
        mock: { base: 28, swing: 12, noise: 2.5 },
      },
      {
        key: "lmp_congestion",
        label: "Congestion",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal congestion component — the part that differs between nodes.",
        mock: { base: 0, swing: 6, noise: 1.5 },
      },
      {
        key: "lmp_loss",
        label: "Losses",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal loss component.",
        mock: { base: 0.3, swing: 1.2, noise: 0.3 },
      },
      {
        key: "lmp_energy",
        label: "Energy",
        unit: "$/MWh",
        availability: "live",
        description:
          "System energy price — the same number at every node in an interval. " +
          "Derived as LMP minus congestion minus losses, PJM's own identity; the feed omits it.",
        mock: { base: 28, swing: 10, noise: 2 },
      },
    ],
  },
  {
    id: "energy.pjm.realtimehourly",
    path: ["Energy", "Pricing", "Real-time hourly"],
    name: "PJM real-time hourly LMP",
    short: "RT · hourly",
    dataset: "pjm-realtime-lmp-hourly",
    availability: "live",
    cadence: { label: "hourly, for the hour before", seconds: 3_600 },
    tokens: 0.5,
    entities: {
      count: 482,
      label: "aggregate pricing nodes",
      sample: ["WESTERN HUB", "PJM-RTO", "COMED"],
    },
    // Aggregates only, as on the five-minute stream: an aggregate has no place.
    blurb:
      "PJM's own hourly integration of its unverified real-time prices at the 12 " +
      "trading hubs, 22 transmission zones, 7 interfaces and every other aggregate, " +
      "with the congestion and loss components, posted for the previous hour. PJM " +
      "keeps it thirty days.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 13),
    },
    variables: [
      {
        key: "lmp_total",
        label: "Total LMP",
        unit: "$/MWh",
        availability: "live",
        description: "The hourly unverified real-time price at the node, as PJM integrates it.",
        scale: [
          { at: -50, color: "#2166ac", label: "negative" },
          { at: 0, color: "#4393c3" },
          { at: 20, color: "#92c5de" },
          { at: 30, color: "#c9c9c9" },
          { at: 45, color: "#f4a582" },
          { at: 70, color: "#e5795e" },
          { at: 100, color: "#d6604d" },
          { at: 250, color: "#e0243a" },
          { at: 500, color: "#ff2fd0" },
        ],
        mock: { base: 28, swing: 12, noise: 2.5 },
      },
      {
        key: "lmp_congestion",
        label: "Congestion",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal congestion component — the part that differs between nodes.",
        mock: { base: 0, swing: 6, noise: 1.5 },
      },
      {
        key: "lmp_loss",
        label: "Losses",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal loss component.",
        mock: { base: 0.3, swing: 1.2, noise: 0.3 },
      },
      {
        key: "lmp_energy",
        label: "Energy",
        unit: "$/MWh",
        availability: "live",
        description:
          "System energy price, derived as LMP minus congestion minus losses; the feed omits it.",
        mock: { base: 28, swing: 10, noise: 2 },
      },
    ],
  },
  {
    id: "energy.pjm.rtbus",
    path: ["Energy", "Pricing", "RT bus LMP"],
    name: "PJM real-time LMPs by bus",
    short: "RT · bus LMP",
    dataset: "pjm-rt-lmp-bus",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 1,
    entities: {
      count: 13_967,
      label: "electrical buses",
      sample: ["ALDENE  230 KV  T-10", "BRANCHBURG500 KV  T-1", "KEYSTONE500 KV  KEY1"],
    },
    // Placed by the API from the PJM node table: 1,101 of the 2,141 generator
    // buses are matched by substation and unit name to EIA-860M's PJM plants
    // in their transmission zone's states (`scripts/build_iso_node_locations.py
    // --iso pjm`). The 11,826 load and external buses are not attempted — no
    // public file says where a feeder leaves the grid — and read null.
    located: true,
    locatedBy: "EIA-860M plant coordinates, matched by substation and unit name in the zone",
    locatedCount: 1_101,
    blurb:
      "Unverified five-minute prices at every one of PJM's 13,967 electrical buses " +
      "— generator, load and external — with the congestion and loss components. " +
      "Four million rows a day; the bus stream under the aggregates. Bus names are " +
      "PJM's own fixed-width spelling, double spaces included.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 9),
    },
    variables: [
      {
        key: "lmp_total",
        label: "Total LMP",
        unit: "$/MWh",
        availability: "live",
        description: "The five-minute unverified real-time price at the node.",
        scale: [
          { at: -50, color: "#2166ac", label: "negative" },
          { at: 0, color: "#4393c3" },
          { at: 20, color: "#92c5de" },
          { at: 30, color: "#c9c9c9" },
          { at: 45, color: "#f4a582" },
          { at: 70, color: "#e5795e" },
          { at: 100, color: "#d6604d" },
          { at: 250, color: "#e0243a" },
          { at: 500, color: "#ff2fd0" },
        ],
        mock: { base: 28, swing: 12, noise: 2.5 },
      },
      {
        key: "lmp_congestion",
        label: "Congestion",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal congestion component — the part that differs between nodes.",
        mock: { base: 0, swing: 6, noise: 1.5 },
      },
      {
        key: "lmp_loss",
        label: "Losses",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal loss component.",
        mock: { base: 0.3, swing: 1.2, noise: 0.3 },
      },
      {
        key: "lmp_energy",
        label: "Energy",
        unit: "$/MWh",
        availability: "live",
        description:
          "System energy price — the same number at every node in an interval. " +
          "Derived as LMP minus congestion minus losses, PJM's own identity; the feed omits it.",
        mock: { base: 28, swing: 10, noise: 2 },
      },
    ],
  },
  {
    id: "energy.pjm.dayahead",
    path: ["Energy", "Pricing", "Day-ahead"],
    name: "PJM day-ahead LMP",
    short: "DA · LMP",
    dataset: "pjm-dam-lmp",
    availability: "live",
    cadence: { label: "daily, ~12:30 ET", seconds: 86_400 },
    intervalSeconds: 3_600,
    tokens: 0.5,
    entities: {
      count: 482,
      label: "aggregate pricing nodes",
      sample: ["WESTERN HUB", "PJM-RTO", "COMED"],
    },
    blurb:
      "Hourly day-ahead prices at PJM's 482 aggregate pricing nodes — hubs, zones, " +
      "interfaces, EHV and residual aggregates — with the energy, congestion and " +
      "loss components as PJM publishes them, posted for the whole of tomorrow " +
      "between 12:00 and 13:30 Eastern.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 9),
    },
    variables: [
      {
        key: "lmp_total",
        label: "Total LMP",
        unit: "$/MWh",
        availability: "live",
        description: "The hourly day-ahead price at the node.",
        scale: [
          { at: -50, color: "#2166ac", label: "negative" },
          { at: 0, color: "#4393c3" },
          { at: 20, color: "#92c5de" },
          { at: 30, color: "#c9c9c9" },
          { at: 45, color: "#f4a582" },
          { at: 70, color: "#e5795e" },
          { at: 100, color: "#d6604d" },
          { at: 250, color: "#e0243a" },
          { at: 500, color: "#ff2fd0" },
        ],
        mock: { base: 30, swing: 12, noise: 2.5 },
      },
      {
        key: "lmp_congestion",
        label: "Congestion",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal congestion component — the part that differs between nodes.",
        mock: { base: 0, swing: 6, noise: 1.5 },
      },
      {
        key: "lmp_loss",
        label: "Losses",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal loss component.",
        mock: { base: 0.3, swing: 1.2, noise: 0.3 },
      },
      {
        key: "lmp_energy",
        label: "Energy",
        unit: "$/MWh",
        availability: "live",
        description:
          "System energy price — the same number at every node in an hour, as PJM " +
          "publishes it (the day-ahead feed carries all four).",
        mock: { base: 30, swing: 10, noise: 2 },
      },
    ],
  },
  {
    id: "energy.pjm.dabus",
    path: ["Energy", "Pricing", "DA bus LMP"],
    name: "PJM day-ahead LMPs by bus",
    short: "DA · bus LMP",
    dataset: "pjm-dam-lmp-bus",
    availability: "live",
    cadence: { label: "daily, ~12:30 ET", seconds: 86_400 },
    intervalSeconds: 3_600,
    tokens: 0.5,
    entities: {
      count: 13_967,
      label: "electrical buses",
      sample: ["ALDENE  230 KV  T-10", "BRANCHBURG500 KV  T-1", "KEYSTONE500 KV  KEY1"],
    },
    // The same buses as the real-time stream, so the same table places them.
    located: true,
    locatedBy: "EIA-860M plant coordinates, matched by substation and unit name in the zone",
    locatedCount: 1_101,
    blurb:
      "Hourly day-ahead prices at every one of PJM's 13,967 electrical buses, with " +
      "the energy, congestion and loss components as PJM publishes them. A third of " +
      "a million rows a day, named the way the real-time bus stream names them.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 9),
    },
    variables: [
      {
        key: "lmp_total",
        label: "Total LMP",
        unit: "$/MWh",
        availability: "live",
        description: "The hourly day-ahead price at the node.",
        scale: [
          { at: -50, color: "#2166ac", label: "negative" },
          { at: 0, color: "#4393c3" },
          { at: 20, color: "#92c5de" },
          { at: 30, color: "#c9c9c9" },
          { at: 45, color: "#f4a582" },
          { at: 70, color: "#e5795e" },
          { at: 100, color: "#d6604d" },
          { at: 250, color: "#e0243a" },
          { at: 500, color: "#ff2fd0" },
        ],
        mock: { base: 30, swing: 12, noise: 2.5 },
      },
      {
        key: "lmp_congestion",
        label: "Congestion",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal congestion component — the part that differs between nodes.",
        mock: { base: 0, swing: 6, noise: 1.5 },
      },
      {
        key: "lmp_loss",
        label: "Losses",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal loss component.",
        mock: { base: 0.3, swing: 1.2, noise: 0.3 },
      },
      {
        key: "lmp_energy",
        label: "Energy",
        unit: "$/MWh",
        availability: "live",
        description:
          "System energy price — the same number at every node in an hour, as PJM " +
          "publishes it (the day-ahead feed carries all four).",
        mock: { base: 30, swing: 10, noise: 2 },
      },
    ],
  },
  {
    id: "energy.pjm.load",
    path: ["Energy", "Load", "Load by area"],
    name: "PJM load by area",
    short: "Load",
    dataset: "pjm-system-load",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 0.5,
    entities: {
      count: 25,
      label: "load areas",
      sample: ["PJM RTO", "COMED", "DOM"],
    },
    entityKey: "zone",
    // The RTO is the sum of the zones and each region the sum of its own;
    // stacking any of them on the zones counts load twice.
    entityOmit: [
      "PJM RTO",
      "PJM MID ATLANTIC REGION",
      "PJM SOUTHERN REGION",
      "PJM WESTERN REGION",
    ],
    blurb:
      "Real-time load every five minutes in each of PJM's 21 transmission zones, " +
      "its three regions and the RTO total — telemetry, the number on PJM's own " +
      "dashboard, not the metered load that settles. The feed keeps thirty days; " +
      "the rest is here because it was collected.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 9),
    },
    variables: [
      {
        key: "demand_mw",
        label: "Load",
        unit: "MW",
        availability: "live",
        description: "Load in the area at the reading, from telemetry.",
        mock: { base: 5_000, swing: 2_000, noise: 150, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.genmix",
    path: ["Energy", "Generation", "Fuel mix"],
    name: "PJM fuel mix",
    short: "Fuel mix",
    dataset: "pjm-fuel-mix",
    availability: "live",
    cadence: { label: "hourly, :15 past", seconds: 3_600 },
    tokens: 0.5,
    entities: {
      count: 10,
      label: "fuel categories",
      sample: ["GAS", "NUCLEAR", "COAL"],
    },
    entityKey: "fuel",
    blurb:
      "What generated across PJM each hour, by fuel — gas, nuclear, coal, hydro, " +
      "wind, solar, storage, oil and the rest — with each one's share of the " +
      "total. Posted fifteen minutes past the hour and kept by PJM indefinitely.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 9),
    },
    variables: [
      {
        key: "gen_mw",
        label: "Output",
        unit: "MW",
        availability: "live",
        description: "Generation from the category over the hour. Storage runs negative while charging.",
        mock: { base: 15_000, swing: 12_000, noise: 400, floor: 0 },
      },
      {
        key: "share",
        label: "Share of total",
        unit: "",
        availability: "live",
        description: "The category's fraction of the hour's generation, 0–1.",
        mock: { base: 0.15, swing: 0.1, noise: 0.005, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.ties",
    path: ["Energy", "Grid", "Tie flows"],
    name: "PJM tie flows",
    short: "Ties",
    dataset: "pjm-tie-flows",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 0.5,
    entities: {
      count: 21,
      label: "ties",
      sample: ["NYIS", "PJM MISO", "TVA"],
    },
    entityKey: "counterparty",
    // PJM RTO is the net of every tie and PJM MISO the net of the MISO ones;
    // stacked on the ties they sum, both count flow twice.
    entityOmit: ["PJM RTO", "PJM MISO"],
    blurb:
      "Actual against scheduled flow every five minutes on each of PJM's ties with " +
      "its neighbours — New York, the MISO seams, TVA, Duke and the rest — plus the " +
      "MISO net and the RTO net. Positive is into PJM.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 9),
    },
    variables: [
      {
        key: "actual_mw",
        label: "Actual",
        unit: "MW",
        availability: "live",
        description: "Actual flow over the tie at the reading; positive is into PJM.",
        mock: { base: -400, swing: 600, noise: 80 },
      },
      {
        key: "scheduled_mw",
        label: "Scheduled",
        unit: "MW",
        availability: "live",
        description: "Scheduled interchange over the tie; positive is into PJM.",
        mock: { base: -400, swing: 500, noise: 20 },
      },
    ],
  },
  {
    id: "energy.pjm.regulation",
    path: ["Energy", "Ancillary", "Regulation"],
    name: "PJM regulation prices",
    short: "Reg · MCP",
    dataset: "pjm-regulation-prices",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 0.25,
    entities: {
      count: 1,
      label: "system series",
      sample: [],
    },
    blurb:
      "The five-minute regulation clearing price for the PJM RTO, split into its " +
      "capability and performance components, with the megawatts cleared against " +
      "the requirement. Preliminary, from the operating day; PJM keeps thirty days.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 10),
    },
    variables: [
      {
        key: "mcp",
        label: "Clearing price",
        unit: "$/MW",
        availability: "live",
        description: "Regulation market clearing price, $/MW per hour.",
        mock: { base: 20, swing: 18, noise: 6, floor: 0 },
      },
      {
        key: "mcp_capability",
        label: "Capability",
        unit: "$/MW",
        availability: "live",
        description: "The component paid for holding regulation capacity.",
        mock: { base: 15, swing: 12, noise: 4, floor: 0 },
      },
      {
        key: "mcp_performance",
        label: "Performance",
        unit: "$/MW",
        availability: "live",
        description: "The component paid for mileage provided.",
        mock: { base: 3, swing: 3, noise: 1, floor: 0 },
      },
      {
        key: "quantity_mw",
        label: "Cleared",
        unit: "MW",
        availability: "live",
        description: "Regulation cleared in the interval.",
        mock: { base: 700, swing: 60, noise: 20, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.reserves",
    path: ["Energy", "Ancillary", "Reserves"],
    name: "PJM dispatched reserves",
    short: "Reserves",
    dataset: "pjm-dispatched-reserves",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 0.25,
    entities: {
      count: 3,
      label: "products",
      sample: ["SYNCHRONIZED", "PRIMARY", "THIRTY_MINUTE"],
    },
    entityKey: "as_type",
    blurb:
      "Synchronized, primary and thirty-minute reserve every five minutes: the " +
      "megawatts the dispatch held against each requirement, the clearing price, " +
      "and whether PJM called the interval short. A product is one series; the row " +
      "carries which zone (the RTO or Mid-Atlantic/Dominion) it is.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 10),
    },
    variables: [
      {
        key: "mcp",
        label: "Clearing price",
        unit: "$/MW",
        availability: "live",
        description: "Reserve market clearing price, $/MW per hour.",
        mock: { base: 1, swing: 3, noise: 1, floor: 0 },
      },
      {
        key: "quantity_mw",
        label: "Dispatched",
        unit: "MW",
        availability: "live",
        description: "Reserve dispatched in the look-ahead solution.",
        mock: { base: 2_500, swing: 500, noise: 100, floor: 0 },
      },
      {
        key: "requirement_mw",
        label: "Requirement",
        unit: "MW",
        availability: "live",
        description: "The requirement the dispatch was meeting.",
        mock: { base: 2_300, swing: 200, noise: 10, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.reserveresults",
    path: ["Energy", "Ancillary", "Market results"],
    name: "PJM real-time ancillary market results",
    short: "AS results",
    dataset: "pjm-rt-reserve-results",
    availability: "live",
    cadence: { label: "every 5 min, posted ~3 days late", seconds: 300 },
    tokens: 0.25,
    entities: {
      count: 4,
      label: "services",
      sample: ["REGULATION", "SYNCHRONIZED", "PRIMARY"],
    },
    entityKey: "as_type",
    blurb:
      "PJM's settled real-time results for regulation, synchronized, primary and th" +
      "irty-minute reserve, every five minutes, for the RTO and the Mid-Atlantic/Do" +
      "minion subzone: clearing prices, requirements and the megawatts behind them." +
      " Posted about three days late, on business days.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 13),
    },
    variables: [
      {
        key: "mcp",
        label: "Clearing price",
        unit: "$/MW-h",
        availability: "live",
        description: "The service's market clearing price for the interval.",
        mock: { base: 5, swing: 8, noise: 2, floor: 0 },
      },
      {
        key: "as_req_mw",
        label: "Requirement",
        unit: "MW",
        availability: "live",
        description: "The service's requirement.",
        mock: { base: 2_000, swing: 800, noise: 50, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.dareserveresults",
    path: ["Energy", "Ancillary", "Market results"],
    name: "PJM day-ahead ancillary market results",
    short: "DA AS results",
    dataset: "pjm-da-reserve-results",
    availability: "live",
    cadence: { label: "daily, for tomorrow", seconds: 86400 },
    intervalSeconds: 3600,
    tokens: 0.25,
    entities: {
      count: 3,
      label: "services",
      sample: ["SYNCHRONIZED", "PRIMARY", "THIRTY_MINUTE"],
    },
    entityKey: "as_type",
    blurb:
      "PJM's day-ahead results for synchronized, primary and thirty-minute reserve," +
      " hourly, for the RTO and the Mid-Atlantic/Dominion subzone: clearing prices," +
      " requirements and the megawatts behind them, posted with tomorrow's market.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 13),
    },
    variables: [
      {
        key: "mcp",
        label: "Clearing price",
        unit: "$/MW-h",
        availability: "live",
        description: "The service's day-ahead clearing price for the hour.",
        mock: { base: 5, swing: 8, noise: 2, floor: 0 },
      },
      {
        key: "as_req_mw",
        label: "Requirement",
        unit: "MW",
        availability: "live",
        description: "The service's requirement.",
        mock: { base: 2_000, swing: 800, noise: 50, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.loadmetered",
    path: ["Energy", "Load", "Metered hourly load"],
    name: "PJM metered hourly load",
    short: "Metered load",
    dataset: "pjm-load-metered",
    availability: "live",
    cadence: { label: "every 3 h, a few days behind", seconds: 10800 },
    intervalSeconds: 3600,
    tokens: 0.25,
    entities: {
      count: 31,
      label: "load areas",
      sample: ["AECO", "DOM", "PS"],
    },
    entityKey: "load_area",
    entityOmit: ["RTO"],
    blurb:
      "PJM's settlement-quality hourly load for 30 load areas and the RTO, from the" +
      " distribution companies' own meters, filled in company by company over the d" +
      "ays after \u2014 the RTO row is a running total until every company has reported.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 13),
    },
    variables: [
      {
        key: "demand_mw",
        label: "Load",
        unit: "MW",
        availability: "live",
        description: "Metered energy for load over the hour \u2014 its average MW.",
        mock: { base: 3_000, swing: 1_200, noise: 80, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.loadprelim",
    path: ["Energy", "Load", "Preliminary hourly load"],
    name: "PJM preliminary hourly load",
    short: "Prelim load",
    dataset: "pjm-load-prelim",
    availability: "live",
    cadence: { label: "every 3 h, a day behind", seconds: 10800 },
    intervalSeconds: 3600,
    tokens: 0.25,
    entities: {
      count: 10,
      label: "load areas",
      sample: ["AEP", "DOM", "MIDATL"],
    },
    entityKey: "load_area",
    blurb:
      "PJM's preliminary hourly load for ten areas, integrated from telemetry the d" +
      "ay after \u2014 between the five-minute reading and the metered settlement load.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 13),
    },
    variables: [
      {
        key: "demand_mw",
        label: "Load",
        unit: "MW",
        availability: "live",
        description: "Preliminary integrated load over the hour, average MW.",
        mock: { base: 12_000, swing: 5_000, noise: 200, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.loadfc5",
    path: ["Energy", "Load", "Five-minute forecast"],
    name: "PJM five-minute load forecast",
    short: "Load fc · 5m",
    dataset: "pjm-load-forecast-5min",
    availability: "live",
    cadence: { label: "every 5 min, two hours ahead", seconds: 300 },
    tokens: 0.5,
    entities: {
      count: 25,
      label: "forecast areas",
      sample: ["RTO_COMBINED", "COMED", "PSE&G/MIDATL"],
    },
    entityKey: "zone",
    entityOmit: ["RTO_COMBINED", "MID_ATLANTIC_REGION", "SOUTHERN_REGION", "WESTERN_REGION"],
    blurb:
      "PJM's load forecast for the next two hours in five-minute steps, for the " +
      "zones, the three regions and the RTO, re-issued every five minutes and kept " +
      "as vintages — so a forecast can be scored against what it said at the time.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 10),
    },
    variables: [
      {
        key: "forecast_mw",
        label: "Forecast",
        unit: "MW",
        availability: "live",
        description: "Forecast load for the interval, as of this vintage.",
        mock: { base: 5_000, swing: 2_000, noise: 100, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.loadfc7",
    path: ["Energy", "Load", "Seven-day forecast"],
    name: "PJM seven-day load forecast",
    short: "Load fc · 7d",
    dataset: "pjm-load-forecast-7day",
    availability: "live",
    cadence: { label: "twice hourly, a week ahead", seconds: 1_800 },
    intervalSeconds: 3_600,
    tokens: 0.5,
    entities: {
      count: 25,
      label: "forecast areas",
      sample: ["RTO_COMBINED", "COMED", "DOMINION"],
    },
    entityKey: "zone",
    entityOmit: ["RTO_COMBINED", "MID_ATLANTIC_REGION", "SOUTHERN_REGION", "WESTERN_REGION"],
    blurb:
      "PJM's hourly load forecast for the next seven days, for the zones, the " +
      "three regions and the RTO. PJM replaces it in place twice an hour, so the " +
      "vintages kept here are the only record of what it said.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 10),
    },
    variables: [
      {
        key: "forecast_mw",
        label: "Forecast",
        unit: "MW",
        availability: "live",
        description: "Forecast load for the hour, as of this vintage.",
        mock: { base: 5_000, swing: 2_000, noise: 100, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.windgen",
    path: ["Energy", "Generation", "Wind"],
    name: "PJM wind output",
    short: "Wind",
    dataset: "pjm-wind-gen",
    availability: "live",
    cadence: { label: "every 15 s", seconds: 15 },
    tokens: 0.25,
    entities: {
      count: 1,
      label: "system series",
      sample: [],
    },
    blurb:
      "Wind output across the whole of PJM, a SCADA reading every fifteen seconds, " +
      "kept at that grain. PJM holds thirty days.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 10),
    },
    variables: [
      {
        key: "gen_mw",
        label: "Wind",
        unit: "MW",
        availability: "live",
        description: "Wind output across PJM at the reading.",
        mock: { base: 3_000, swing: 2_500, noise: 60, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.solargen",
    path: ["Energy", "Generation", "Solar"],
    name: "PJM solar output",
    short: "Solar",
    dataset: "pjm-solar-gen",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 0.25,
    entities: {
      count: 1,
      label: "system series",
      sample: [],
    },
    blurb:
      "Metered utility-scale solar output across the whole of PJM every five " +
      "minutes. Behind-the-meter solar is not in it; PJM sees that as missing load.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 10),
    },
    variables: [
      {
        key: "gen_mw",
        label: "Solar",
        unit: "MW",
        availability: "live",
        description: "Utility-scale solar output across PJM for the interval.",
        mock: { base: 4_000, swing: 4_000, noise: 100, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.windsolarfc",
    path: ["Energy", "Generation", "Wind and solar forecast"],
    name: "PJM wind and solar forecast",
    short: "Wind · solar fc",
    dataset: "pjm-wind-solar-forecast",
    availability: "live",
    cadence: { label: "every 10 min, two days ahead", seconds: 600 },
    intervalSeconds: 3_600,
    tokens: 0.25,
    entities: {
      count: 3,
      label: "resources",
      sample: ["WIND", "SOLAR", "SOLAR_BTM"],
    },
    entityKey: "resource",
    blurb:
      "PJM's hourly wind forecast for the next 46 hours, re-issued every ten " +
      "minutes, and its hourly solar forecast for the next four days — utility-scale " +
      "and behind-the-meter separately — re-issued hourly. Every issue is a vintage.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 10),
    },
    variables: [
      {
        key: "forecast_mw",
        label: "Forecast",
        unit: "MW",
        availability: "live",
        description: "PJM's forecast for the hour, as of this vintage.",
        mock: { base: 3_000, swing: 2_500, noise: 150, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.windsolarfc5",
    path: ["Energy", "Generation", "Wind and solar forecast"],
    name: "PJM five-minute wind and solar forecast",
    short: "Wind · solar fc 5m",
    dataset: "pjm-wind-solar-forecast-5min",
    availability: "live",
    cadence: { label: "every 10 min, six hours ahead", seconds: 600 },
    intervalSeconds: 300,
    tokens: 0.25,
    entities: {
      count: 3,
      label: "resources",
      sample: ["WIND", "SOLAR", "SOLAR_BTM"],
    },
    entityKey: "resource",
    blurb:
      "PJM's wind and solar forecasts for the next six hours in five-minute steps — " +
      "solar utility-scale and behind-the-meter separately — re-issued every ten " +
      "minutes. Every issue is a vintage. PJM keeps them thirty days.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 13),
    },
    variables: [
      {
        key: "forecast_mw",
        label: "Forecast",
        unit: "MW",
        availability: "live",
        description: "PJM's forecast for the five-minute interval, as of this vintage.",
        mock: { base: 3_000, swing: 2_500, noise: 150, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.constraints",
    path: ["Energy", "Pricing", "Shadow prices"],
    name: "PJM binding constraints",
    short: "Constraints",
    dataset: "pjm-binding-constraints",
    availability: "live",
    cadence: { label: "every 5 min, when bound", seconds: 300 },
    tokens: 0.5,
    entities: {
      count: 60,
      label: "constraints",
      sample: ["GRACETON-MANOR GRA-MANO     A  230 KV", "APSOUTH", "BED-BLA"],
    },
    entityColumn: "constraint_name",
    blurb:
      "Every transmission constraint the real-time dispatch was up against, five " +
      "minutes at a time, with the contingency it bound for and its shadow price " +
      "(negative, in PJM's convention). Empty when nothing binds, which is a fact " +
      "and not a gap; the set of constraints is whatever the grid did that month.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 10),
    },
    variables: [
      {
        key: "shadow_price",
        label: "Shadow price",
        unit: "$/MWh",
        availability: "live",
        description: "The constraint's shadow price for the interval; negative in PJM's convention.",
        mock: { base: -300, swing: 250, noise: 50 },
      },
    ],
  },
  {
    id: "energy.pjm.rtmarginal",
    path: ["Energy", "Pricing", "Shadow prices"],
    name: "PJM real-time constraint marginal values",
    short: "RT marginal value",
    dataset: "pjm-rt-marginal-value",
    availability: "live",
    cadence: { label: "every 5 min, posted ~3 days late", seconds: 300 },
    tokens: 0.5,
    entities: {
      count: 60,
      label: "constraints",
      sample: ["APSOUTH", "BED-BLA"],
    },
    entityColumn: "constraint_name",
    blurb:
      "PJM's settled record of every transmission constraint that bound in the real" +
      "-time market, five minutes at a time, with its contingency, shadow price (ne" +
      "gative, in PJM's convention), penalty factor and limit control percentage. P" +
      "osted about three days late, on business days.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 13),
    },
    variables: [
      {
        key: "shadow_price",
        label: "Marginal value",
        unit: "$/MWh",
        availability: "live",
        description: "The constraint's settled shadow price for the interval; negative in PJM's convention.",
        mock: { base: -60, swing: 120, noise: 30 },
      },
    ],
  },
  {
    id: "energy.pjm.damarginal",
    path: ["Energy", "Pricing", "Shadow prices"],
    name: "PJM day-ahead constraint marginal values",
    short: "DA marginal value",
    dataset: "pjm-da-marginal-value",
    availability: "live",
    cadence: { label: "daily, for tomorrow", seconds: 86400 },
    intervalSeconds: 3600,
    tokens: 0.5,
    entities: {
      count: 60,
      label: "constraints",
      sample: ["APSOUTH", "BED-BLA"],
    },
    entityColumn: "constraint_name",
    blurb:
      "Every transmission constraint that binds in PJM's day-ahead market, hour by " +
      "hour, with its contingency and shadow price (negative, in PJM's convention)," +
      " posted with tomorrow's prices.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 13),
    },
    variables: [
      {
        key: "shadow_price",
        label: "Marginal value",
        unit: "$/MWh",
        availability: "live",
        description: "The constraint's day-ahead shadow price for the hour; negative in PJM's convention.",
        mock: { base: -60, swing: 120, noise: 30 },
      },
    ],
  },
  {
    id: "energy.pjm.dispatch",
    path: ["Energy", "Pricing", "Dispatch rates"],
    name: "PJM dispatch rates",
    short: "Dispatch",
    dataset: "pjm-dispatch-rates",
    availability: "live",
    cadence: { label: "every 15 s", seconds: 15 },
    tokens: 0.5,
    entities: {
      count: 20,
      label: "zones",
      sample: ["COMED", "DOM", "PS"],
    },
    entityKey: "zone",
    blurb:
      "The dispatch signal PJM sends each of its 20 transmission zones, in $/MWh, " +
      "every fifteen seconds — the price the control room is steering generators " +
      "to at the instant, not a settlement price. PJM keeps fifteen days.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 10),
    },
    variables: [
      {
        key: "dispatch_rate",
        label: "Dispatch rate",
        unit: "$/MWh",
        availability: "live",
        description: "The dispatch rate sent to the zone at the scan.",
        mock: { base: 28, swing: 12, noise: 2 },
      },
    ],
  },
  {
    id: "energy.pjm.opreserves",
    path: ["Energy", "Ancillary", "Operational reserves"],
    name: "PJM operational reserves",
    short: "Op reserves",
    dataset: "pjm-operational-reserves",
    availability: "live",
    cadence: { label: "every 15 s", seconds: 15 },
    tokens: 0.5,
    entities: {
      count: 13,
      label: "series",
      sample: ["RTO_SYNCHRONIZED_RESERVE_TOTAL", "RTO_CONTINGENCY_PRIMARY_RESERVE_TOTAL"],
    },
    entityKey: "as_type",
    blurb:
      "The megawatts of synchronized, primary and thirty-minute reserve PJM is " +
      "holding against each requirement, as the control room sees them every " +
      "fifteen seconds, for the RTO and the Mid-Atlantic/Dominion sub-zone.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 10),
    },
    variables: [
      {
        key: "reserve_mw",
        label: "Reserve",
        unit: "MW",
        availability: "live",
        description: "The series' value at the scan.",
        mock: { base: 3_000, swing: 800, noise: 60, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.ace",
    path: ["Energy", "Grid", "Area control error"],
    name: "PJM area control error",
    short: "ACE",
    dataset: "pjm-ace",
    availability: "live",
    cadence: { label: "every 15 s", seconds: 15 },
    tokens: 0.25,
    entities: {
      count: 1,
      label: "system series",
      sample: [],
    },
    blurb:
      "How far PJM is from its interchange schedule and frequency obligation at " +
      "the instant, in megawatts, every fifteen seconds — the number the control " +
      "room regulates to zero.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 10),
    },
    variables: [
      {
        key: "ace_mw",
        label: "ACE",
        unit: "MW",
        availability: "live",
        description: "Area control error at the scan; positive is over-generating.",
        mock: { base: 0, swing: 300, noise: 120 },
      },
    ],
  },
  {
    id: "energy.pjm.interchange",
    path: ["Energy", "Grid", "Hourly interchange"],
    name: "PJM hourly interchange by tie",
    short: "Interchange",
    dataset: "pjm-interchange-hourly",
    availability: "live",
    cadence: { label: "every 2 h, hours behind", seconds: 7200 },
    intervalSeconds: 3600,
    tokens: 0.25,
    entities: {
      count: 20,
      label: "ties",
      sample: ["NYIS", "TVA", "DUK"],
    },
    entityKey: "counterparty",
    blurb:
      "Actual, scheduled and inadvertent flow over each of PJM's ties with its neig" +
      "hbours, hour by hour \u2014 the record PJM keeps indefinitely behind the five-min" +
      "ute tie flows it keeps thirty days. Positive is into PJM.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 13),
    },
    variables: [
      {
        key: "actual_mw",
        label: "Actual",
        unit: "MW",
        availability: "live",
        description: "Actual flow over the hour; positive is into PJM.",
        mock: { base: 0, swing: 900, noise: 60 },
      },
      {
        key: "scheduled_mw",
        label: "Scheduled",
        unit: "MW",
        availability: "live",
        description: "Scheduled flow over the hour; positive is into PJM.",
        mock: { base: 0, swing: 900, noise: 40 },
      },
      {
        key: "inadvertent_mw",
        label: "Inadvertent",
        unit: "MW",
        availability: "live",
        description: "Inadvertent flow over the hour, as PJM reports it.",
        mock: { base: 0, swing: 60, noise: 15 },
      },
    ],
  },
  {
    id: "energy.pjm.genoutages",
    path: ["Energy", "Grid", "Generation outages"],
    name: "PJM generation outages, week ahead",
    short: "Outages 7d",
    dataset: "pjm-gen-outages",
    availability: "live",
    cadence: { label: "daily, a week ahead", seconds: 86400 },
    intervalSeconds: 86400,
    tokens: 0.25,
    entities: {
      count: 3,
      label: "regions",
      sample: ["PJM RTO", "Western", "Mid Atlantic - Dominion"],
    },
    entityKey: "region",
    entityOmit: ["PJM RTO"],
    blurb:
      "PJM's generation outages for today and the next six days, for the RTO and it" +
      "s two regions, split into planned, maintenance and forced \u2014 issued daily and" +
      " kept as vintages.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 13),
    },
    variables: [
      {
        key: "total_mw",
        label: "Total out",
        unit: "MW",
        availability: "live",
        description: "All generation out that day.",
        mock: { base: 25_000, swing: 8_000, noise: 500, floor: 0 },
      },
      {
        key: "forced_mw",
        label: "Forced",
        unit: "MW",
        availability: "live",
        description: "Forced (unplanned) outages.",
        mock: { base: 5_000, swing: 2_000, noise: 300, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.genoutagefc",
    path: ["Energy", "Grid", "Generation outages"],
    name: "PJM generation outage forecast, ninety days",
    short: "Outages 90d",
    dataset: "pjm-gen-outage-forecast",
    availability: "live",
    cadence: { label: "daily, ninety days ahead", seconds: 86400 },
    intervalSeconds: 86400,
    tokens: 0.25,
    entities: {
      count: 3,
      label: "regions",
      sample: ["PJM RTO", "Western", "Other"],
    },
    entityKey: "region",
    entityOmit: ["PJM RTO"],
    blurb:
      "PJM's forecast of generation out of service for each of the next ninety days" +
      ", for the RTO, the west and the rest \u2014 issued daily and kept as vintages.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 13),
    },
    variables: [
      {
        key: "outage_mw",
        label: "Forecast out",
        unit: "MW",
        availability: "live",
        description: "Generation forecast out that day.",
        mock: { base: 25_000, swing: 10_000, noise: 500, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.pai",
    path: ["Energy", "Grid", "Performance assessment"],
    name: "PJM performance assessment intervals",
    short: "PAI",
    dataset: "pjm-pai-intervals",
    availability: "live",
    cadence: { label: "every 10 min, one row per interval", seconds: 600 },
    intervalSeconds: 300,
    tokens: 0.25,
    entities: {
      count: 1,
      label: "system series",
      sample: [],
    },
    blurb:
      "Which five-minute intervals PJM flags as Performance Assessment Intervals — " +
      "the emergencies in which capacity resources are scored on whether they " +
      "delivered — for the RTO and the active subzone, as PJM first flags them. " +
      "Almost always zero, which is the point: the rare interval that is not is the " +
      "one capacity is paid or penalised for. PJM keeps sixty days.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 13),
    },
    variables: [
      {
        key: "pai_level",
        label: "PAI level",
        unit: "level",
        availability: "live",
        description: "0 no PAI, 1 a PAI in the active subzone, 2 a PAI across the RTO and the subzone.",
        mock: { base: 0, swing: 0, noise: 0, floor: 0 },
      },
    ],
  },
  {
    id: "energy.pjm.itsced",
    path: ["Energy", "Pricing", "Interface prices ahead"],
    name: "PJM IT SCED interface prices",
    short: "IT SCED · LMP",
    dataset: "pjm-itsced-lmp",
    availability: "live",
    cadence: { label: "every 5 min, four intervals ahead", seconds: 300 },
    tokens: 0.25,
    entities: {
      count: 5,
      label: "interfaces",
      sample: ["NYIS", "MISO", "NEPTUNE"],
    },
    entityKey: "node",
    blurb:
      "What PJM's intermediate-term dispatch expects the next four five-minute " +
      "intervals to cost at its ties with New York and MISO, re-run every few " +
      "minutes and kept case by case — the forward-looking price at the seams, " +
      "MISO's ex-ante counterpart.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 10),
    },
    variables: [
      {
        key: "lmp_total",
        label: "IT SCED LMP",
        unit: "$/MWh",
        availability: "live",
        description: "The price the case expects at the interface for the interval.",
        mock: { base: 28, swing: 12, noise: 3 },
      },
      {
        key: "lmp_congestion",
        label: "Congestion",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal congestion component.",
        mock: { base: -8, swing: 10, noise: 2 },
      },
      {
        key: "lmp_loss",
        label: "Losses",
        unit: "$/MWh",
        availability: "live",
        description: "Marginal loss component.",
        mock: { base: 0.5, swing: 1, noise: 0.3 },
      },
    ],
  },
  {
    id: "energy.pjm.transfer",
    path: ["Energy", "Grid", "Transfer interfaces"],
    name: "PJM transfer interfaces",
    short: "Interfaces",
    dataset: "pjm-transfer-interfaces",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 0.5,
    entities: {
      count: 11,
      label: "interfaces",
      sample: ["APSOUTH", "EAST", "BED-BLA"],
    },
    entityKey: "interface",
    blurb:
      "Actual flow against the transfer limit on the eleven interfaces PJM watches " +
      "for stability — the eastern, central and western reactive interfaces, AP " +
      "South, Bedington–Black Oak and the seams — every five minutes. How close " +
      "the grid is to its edges.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 10),
    },
    variables: [
      {
        key: "actual_mw",
        label: "Flow",
        unit: "MW",
        availability: "live",
        description: "Actual flow across the interface at the reading.",
        mock: { base: 3_000, swing: 1_200, noise: 150 },
      },
      {
        key: "limit_mw",
        label: "Limit",
        unit: "MW",
        availability: "live",
        description: "The transfer limit PJM is holding the interface to.",
        mock: { base: 4_800, swing: 200, noise: 20, floor: 0 },
      },
    ],
  },
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
  // ── Property ───────────────────────────────────────────────────────────
  // The first Property stream, landed 2026-09-07. A permit is an event, not
  // an interval: the row's time is the day it was issued, at Central
  // midnight, and the entity is the ZIP — the grain hail reports and roofers
  // both count in. Fifty ZIPs is past what a chart fans out, so there is no
  // `entityKey` and the explorer opens the set; `entityColumn` tells the map
  // which column names a place. Rows carry the city's own coordinates where
  // it geocoded them (about six in ten), so the stream is `located` and the
  // map draws what the source placed, never a guess.
  {
    id: "property.permits.austin",
    path: ["Property", "Permits", "Austin"],
    name: "Austin construction permits",
    short: "Austin permits",
    dataset: "austin-permits",
    availability: "live",
    cadence: { label: "daily", seconds: 86_400 },
    tokens: 0.25,
    entities: {
      count: 50,
      label: "ZIP codes",
      sample: ["78704", "78745", "78744"],
    },
    entityColumn: "zip",
    located: true,
    sourceTz: "America/Chicago",
    blurb:
      "Every building, electrical, mechanical, plumbing and driveway permit the " +
      "City of Austin issues, one row per permit: the work described, the " +
      "declared value, the contracting company and the place. Read nightly from " +
      "the city's open-data view and upserted for two weeks after issue, so a " +
      "status that moves after the permit is pulled moves here too.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 7),
    },
    // Counted first: how many permits is the question every tile on this
    // stream starts from, and a declared value is on one permit in six.
    variables: [
      {
        key: "samples",
        label: "Permits issued",
        unit: "permits",
        availability: "live",
        rollup: "count",
        description:
          "How many permits were issued in the day or week — the rollup's " +
          "own row count, after any filter.",
        mock: { base: 170, swing: 60, noise: 30, floor: 0 },
      },
      {
        key: "valuation_usd",
        label: "Declared value",
        unit: "$",
        availability: "live",
        rollup: "sum",
        description:
          "Total job valuation declared on the permits in the day or week. " +
          "Trade permits carry none; about one permit in six declares a value.",
        mock: { base: 9_000_000, swing: 4_000_000, noise: 2_000_000, floor: 0 },
      },
    ],
    tally: {
      key: "permit_id",
      dims: [
        // Ours first: what the work is done to and what is being done, the
        // same words in every city (the API's labels table, rules v1). The
        // city's own codes follow for whoever needs them.
        { column: "subject", label: "Work on" },
        { column: "action", label: "Job" },
        { column: "permit_class", label: "Class" },
        { column: "permit_type", label: "City type" },
        { column: "work_class", label: "City work class" },
        { column: "status", label: "Status" },
      ],
      // Austin has no roofing type — a re-roof is a building permit whose
      // description says so — so the search is how roofing is found here.
      search: { column: "description", label: "Description" },
      list: [
        { column: "interval_start_utc", label: "Issued", kind: "date" },
        { column: "subject", label: "Work on" },
        { column: "action", label: "Job" },
        { column: "description", label: "Work" },
        { column: "valuation_usd", label: "Value", kind: "money" },
        { column: "contractor", label: "Contractor" },
        { column: "zip", label: "ZIP" },
      ],
    },
  },
  // San Antonio is the roofing signal: the city issues a re-roof permit
  // type of its own, about seventy a week, with coordinates on nine rows in
  // ten. Same shape as Austin — event, ZIP, located — read from a CKAN
  // datastore rather than Socrata.
  {
    id: "property.permits.sanantonio",
    path: ["Property", "Permits", "San Antonio"],
    name: "San Antonio permits",
    short: "San Antonio permits",
    dataset: "sanantonio-permits",
    availability: "live",
    cadence: { label: "daily", seconds: 86_400 },
    tokens: 0.25,
    entities: {
      count: 71,
      label: "ZIP codes",
      sample: ["78201", "78209", "78245"],
    },
    entityColumn: "zip",
    located: true,
    sourceTz: "America/Chicago",
    blurb:
      "Every building and trade permit the City of San Antonio issues, one " +
      "row per permit, with its own re-roof permit type — the number a " +
      "roofer, an adjuster or a carrier watches the week after a hailstorm. " +
      "Read nightly from the city's open-data file and upserted for two " +
      "weeks after issue.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 7),
    },
    variables: [
      {
        key: "samples",
        label: "Permits issued",
        unit: "permits",
        availability: "live",
        rollup: "count",
        description:
          "How many permits were issued in the day or week — the rollup's " +
          "own row count, after any filter.",
        mock: { base: 190, swing: 70, noise: 35, floor: 0 },
      },
      {
        key: "valuation_usd",
        label: "Declared value",
        unit: "$",
        availability: "live",
        rollup: "sum",
        description:
          "Total valuation declared on the permits in the day or week. Filed " +
          "on about two permits in a hundred, mostly new buildings, so this " +
          "is new construction's value rather than all work's.",
        mock: { base: 6_000_000, swing: 3_000_000, noise: 1_500_000, floor: 0 },
      },
    ],
    // The re-roof type is San Antonio's own, so here roofing is a Type chip
    // rather than a search.
    tally: {
      key: "permit_id",
      dims: [
        // Ours first: what the work is done to and what is being done, the
        // same words in every city (the API's labels table, rules v1). The
        // city's own codes follow for whoever needs them.
        { column: "subject", label: "Work on" },
        { column: "action", label: "Job" },
        { column: "permit_class", label: "Class" },
        { column: "permit_type", label: "City type" },
        { column: "work_class", label: "City work class" },
      ],
      search: { column: "description", label: "Description" },
      list: [
        { column: "interval_start_utc", label: "Issued", kind: "date" },
        { column: "subject", label: "Work on" },
        { column: "action", label: "Job" },
        { column: "description", label: "Work" },
        { column: "valuation_usd", label: "Value", kind: "money" },
        { column: "contractor", label: "Contractor" },
        { column: "zip", label: "ZIP" },
      ],
    },
  },
  // Fort Worth is the freshest permit feed in Dallas–Fort Worth and the one
  // that names the equipment: a battery is in the words of a hundred-odd
  // permits a month. A row is an application — its day is the day it was
  // filed and `status` says how far it got — because the city's layer
  // carries no issue date. Located on the city's own coordinates.
  {
    id: "property.permits.fortworth",
    path: ["Property", "Permits", "Fort Worth"],
    name: "Fort Worth permits",
    short: "Fort Worth permits",
    dataset: "fortworth-permits",
    availability: "live",
    cadence: { label: "daily", seconds: 86_400 },
    tokens: 0.25,
    entities: {
      count: 44,
      label: "ZIP codes",
      sample: ["76179", "76052", "76036"],
    },
    entityColumn: "zip",
    located: true,
    sourceTz: "America/Chicago",
    blurb:
      "Every building and trade permit filed with the City of Fort Worth, one " +
      "row per permit, by the day it was filed: the work described, the " +
      "declared value, its status as it moves from plan review to issued, " +
      "and the place. Fort Worth names no contractor; an installer is kept " +
      "only where the project title is a registered business.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 13),
    },
    variables: [
      {
        key: "samples",
        label: "Permits filed",
        unit: "permits",
        availability: "live",
        rollup: "count",
        description:
          "How many permit applications were filed in the day or week — the " +
          "rollup's own row count, after any filter. Filter on status for " +
          "issued work.",
        mock: { base: 190, swing: 70, noise: 35, floor: 0 },
      },
      {
        key: "valuation_usd",
        label: "Declared value",
        unit: "$",
        availability: "live",
        rollup: "sum",
        description:
          "Total job value declared on the applications in the day or week. " +
          "Trade permits carry none; about one permit in four declares a value.",
        mock: { base: 12_000_000, swing: 6_000_000, noise: 3_000_000, floor: 0 },
      },
    ],
    tally: {
      key: "permit_id",
      dims: [
        { column: "subject", label: "Work on" },
        { column: "action", label: "Job" },
        { column: "status", label: "Status" },
        { column: "permit_class", label: "Class" },
        { column: "permit_type", label: "City type" },
        { column: "work_class", label: "City work class" },
      ],
      search: { column: "description", label: "Description" },
      list: [
        { column: "interval_start_utc", label: "Filed", kind: "date" },
        { column: "subject", label: "Work on" },
        { column: "action", label: "Job" },
        { column: "description", label: "Work" },
        { column: "status", label: "Status" },
        { column: "valuation_usd", label: "Value", kind: "money" },
        { column: "contractor", label: "Contractor" },
        { column: "zip", label: "ZIP" },
      ],
    },
  },
  // Collin County is forty-odd cities in one feed — Plano, Frisco, McKinney,
  // Allen — because the appraisal district gathers every city's permit
  // report. Most cities report monthly, so a permit lands weeks after its
  // issue date and the newest weeks are always thin. No coordinates: the
  // ZIP is the place, and the city is a filter.
  {
    id: "property.permits.collin",
    path: ["Property", "Permits", "Collin County"],
    name: "Collin County permits",
    short: "Collin permits",
    dataset: "collin-permits",
    availability: "live",
    cadence: { label: "daily", seconds: 86_400 },
    tokens: 0.25,
    entities: {
      count: 38,
      label: "ZIP codes",
      sample: ["75071", "75009", "75098"],
    },
    entityColumn: "zip",
    sourceTz: "America/Chicago",
    blurb:
      "Building permits from every city in Collin County, as the Collin " +
      "Central Appraisal District records them: the city, the work, the " +
      "builder and the ZIP. Cities report to the district monthly, so the " +
      "last few weeks fill in late — a dip at the right edge is lag.",
    maintainer: {
      name: "Dryos",
      since: Date.UTC(2026, 8, 13),
    },
    variables: [
      {
        key: "samples",
        label: "Permits issued",
        unit: "permits",
        availability: "live",
        rollup: "count",
        description:
          "How many permits were issued in the day or week, as reported so " +
          "far — the rollup's own row count, after any filter.",
        mock: { base: 70, swing: 30, noise: 15, floor: 0 },
      },
      {
        key: "valuation_usd",
        label: "Reported value",
        unit: "$",
        availability: "live",
        rollup: "sum",
        description:
          "Total value the cities reported on the permits in the day or week. " +
          "About half the permits carry one.",
        mock: { base: 8_000_000, swing: 4_000_000, noise: 2_000_000, floor: 0 },
      },
    ],
    tally: {
      key: "permit_id",
      dims: [
        { column: "subject", label: "Work on" },
        { column: "action", label: "Job" },
        { column: "jurisdiction", label: "City" },
        { column: "permit_class", label: "Class" },
        { column: "permit_type", label: "District type" },
      ],
      search: { column: "description", label: "Description" },
      list: [
        { column: "interval_start_utc", label: "Issued", kind: "date" },
        { column: "jurisdiction", label: "City" },
        { column: "subject", label: "Work on" },
        { column: "action", label: "Job" },
        { column: "description", label: "Work" },
        { column: "valuation_usd", label: "Value", kind: "money" },
        { column: "contractor", label: "Builder" },
        { column: "zip", label: "ZIP" },
      ],
    },
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
  /**
   * An event stream narrowed and grouped — "re-roof permits", "new
   * residential, by ZIP". Made in the set view's filters and read literally
   * by every shape: `where` is column → the values any of which match,
   * `search` the text the stream's search column must contain, `by` the
   * column the tally breaks down by (one series per value). Rides beside
   * `subset` rather than inside the label, so a shape reads the filter and
   * never parses it back out of words.
   */
  tally?: {
    where?: Record<string, string[]>;
    search?: string;
    by?: string;
  };
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
  if (schema.sourceTz) return schema.sourceTz;
  if (domainOf(schema) !== "Energy") return "UTC";
  // MISO runs its markets on Eastern Standard Time all year, never EDT: a
  // daylight-saving zone would read its labels an hour wrong from March to
  // November. "EST" is the IANA fixed-offset zone, not an abbreviation. PJM's
  // Eastern Prevailing Time does observe daylight saving, so it is the
  // ordinary New York zone.
  const iso = isoOf(schema);
  if (iso === "MISO") return "EST";
  if (iso === "PJM" || iso === "NYISO" || iso === "ISO-NE") return "America/New_York";
  // CAISO's market clock is Pacific prevailing; its rows carry GMT anyway.
  if (iso === "CAISO") return "America/Los_Angeles";
  return "America/Chicago";
}

/**
 * The grid operator behind an Energy stream, or null outside Energy.
 *
 * Off the collector slug's prefix unless the stream says otherwise — the
 * rule `status.py` uses for the collectors page, so the two cannot disagree
 * about which ISO a feed belongs to.
 */
const ISO_BY_PREFIX: Record<string, string> = {
  ercot: "ERCOT",
  miso: "MISO",
  pjm: "PJM",
  spp: "SPP",
  caiso: "CAISO",
  nyiso: "NYISO",
  isone: "ISO-NE",
};

export function isoOf(schema: Schema): string | null {
  if (schema.iso) return schema.iso;
  const prefix = schema.dataset?.split("-", 1)[0] ?? "";
  return ISO_BY_PREFIX[prefix] ?? null;
}

/** Grid operators inside one domain, in catalogue order. Empty for Weather. */
export function isos(domain?: string): string[] {
  return [
    ...new Set(
      SCHEMAS.filter((s) => !domain || domainOf(s) === domain)
        .map(isoOf)
        .filter((i): i is string => i !== null),
    ),
  ];
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
    }
  | {
      how: "motion";
      placed: number;
      total: number;
    }
  | {
      how: "pins";
      placed: number;
      total: number;
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
    };
  if (schema.motion)
    return {
      how: "motion",
      placed: total,
      total,
    };
  // Rows carry their own coordinates — every entity the table places has a
  // position, and the limits left are the table's reach and how many rows a
  // single query will return.
  if (schema.located)
    return {
      how: "pins",
      placed: Math.min(schema.locatedCount ?? total, DRAW_CAP),
      total,
    };
  const placed = placeableNodes(schema).length;
  return placed ? { how: "pins", placed, total } : null;
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
  // The table is ERCOT's (and the weather and gas points beside it), so
  // another operator's stream places nothing here: PJM's "WESTERN HUB"
  // shares a prefix with ERCOT's WEST zone, and was drawn in Texas.
  const iso = isoOf(schema);
  if (iso && iso !== "ERCOT") return [];
  const stem = sample[0].slice(0, 3);
  return Object.keys(ERCOT_POINTS).filter(
    (k) =>
      sample.includes(k) ||
      (stem.length === 3 && k.startsWith(stem)),
  );
}

/**
 * The streams a selection would draw as pins, by id.
 *
 * The map draws **one** layer of pins. A field and a fleet each get a layer of
 * their own, but every pin reference is merged into a single point layer whose
 * placement rule, scale and legend swatch come from the first stream — a
 * second stream of pins does not stack, it silently loses. So a second one is
 * refused wherever a layer is chosen (the map's `accepts`, the explorer's
 * cards, the layer picker), and this is the one place that decides which
 * references count. Two entities of one stream are two pins on one layer,
 * which is why the answer is a set of streams and not a count of references.
 */
export function pinStreams(refs: DataRef[]): string[] {
  return [
    ...new Set(
      refs
        .filter((r) => {
          const s = schemaById(r.schemaId);
          return s !== undefined && !s.field && !s.motion;
        })
        .map((r) => r.schemaId),
    ),
  ];
}

/** "698 of 1,118 have known locations" — what the picker says under a layer's name. */
export function coverageLabel(t: MapTreatment): string {
  if (t.how === "surface")
    return t.vector ? "vector field" : "scalar field";
  if (t.how === "motion") return "tracked positions";
  const capped = t.placed < t.total && t.placed === DRAW_CAP;
  // Two different shortfalls, and they are not interchangeable. Capped means
  // the query stops early. "Known locations" means the coordinates run out.
  // Saying "8 of 1,118" when the truth is "10,000 of 19,312, because that is
  // all one request returns" would send somebody hunting for missing geography
  // that is not the problem.
  if (capped)
    return `${t.placed.toLocaleString()} of ${t.total.toLocaleString()} drawn`;
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
 * A chip with an event stream's narrowing on it.
 *
 * The filter says itself in the label — "Austin construction permits ·
 * RES_REROOF · by Type" — because the chip is how a person tells two
 * selections of one stream apart, and the explorer keys a selection on its
 * label and snippet: two filters of the same ZIP are two chips, and the same
 * filter picked twice toggles itself off. An empty filter returns the chip
 * untouched.
 */
export function withTally(
  ref: DataRef,
  schema: Schema,
  tally: NonNullable<DataRef["tally"]>,
): DataRef {
  const where = Object.fromEntries(
    Object.entries(tally.where ?? {})
      .filter(([, vs]) => vs.length)
      .map(([c, vs]) => [c, [...vs].sort()]),
  );
  const search = tally.search?.trim() || undefined;
  const by = tally.by || undefined;
  if (!Object.keys(where).length && !search && !by) return ref;
  const dimLabel = (c: string) =>
    schema.tally?.dims.find((d) => d.column === c)?.label ??
    (c === (schema.entityColumn ?? schema.entityKey)
      ? (schema.entities.label ?? c).replace(/s$/, "")
      : c);
  const parts = [
    ...Object.values(where).map((vs) =>
      vs.map(tallyValue).join(" or "),
    ),
    ...(search ? [`“${search}”`] : []),
    ...(by ? [`by ${dimLabel(by)}`] : []),
  ];
  const clean = {
    ...(Object.keys(where).length ? { where } : {}),
    ...(search ? { search } : {}),
    ...(by ? { by } : {}),
  };
  return {
    ...ref,
    label: `${ref.label} · ${parts.join(" · ")}`,
    // The snippet is what the build agent is shown; it says the filter in
    // the query's own terms so a sentence refining this tile keeps it.
    snippet: ref.snippet.replace(
      / \}\)$/,
      `, tally: ${JSON.stringify(clean)} })`,
    ),
    tally: clean,
  };
}

/** A tally column in words — "Job", "Contractor", or the entity's own noun. */
export function tallyDimLabel(schema: Schema, column: string): string {
  const declared = schema.tally?.dims.find((d) => d.column === column)?.label;
  if (declared) return declared;
  if (column === (schema.entityColumn ?? schema.entityKey))
    return (schema.entities.label ?? column).replace(/s$/, "");
  return column.charAt(0).toUpperCase() + column.slice(1).replace(/_/g, " ");
}

/**
 * A source's code as words: `RES_NEW_BUILDING` reads "Res new building".
 *
 * Only for display. The value sent to the API is always the source's own
 * spelling, double spaces and all, since that is what the rows hold.
 */
export function tallyValue(value: string): string {
  const words = value.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (words !== words.toUpperCase()) return words;
  // A short capitalised word is an acronym, not a shouted code: HVAC, ADU
  // and EV stay as they are, where ELECTRICAL becomes "Electrical".
  if (/^[A-Z0-9]{1,4}$/.test(words)) return words;
  const lower = words.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
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
