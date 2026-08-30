/**
 * The schema tree.
 *
 * A dataset slug is a fact about a collector, not something a domain expert
 * navigates. What they navigate is a path — Energy › Power › Real-time — and
 * the variables underneath it. This file is that tree, and it is the only place
 * that decides what the workspace claims to have.
 *
 * Exactly one branch is collected for real: `ercot-realtime-lmp`. Everything
 * else is declared here so the shape of the catalogue is visible before the
 * collectors exist, and every one of those carries `availability: "mock"` all
 * the way to the chip the user clicks. A mock that reads as real is worse than
 * no mock at all, so nothing in this app renders a stream without its badge.
 */

export type Availability = "live" | "mock";

export interface Variable {
  key: string;
  label: string;
  unit: string;
  availability: Availability;
  description: string;
  /** Shape of the synthetic series. Absent on live variables — those are read. */
  mock?: { base: number; swing: number; noise: number; floor?: number };
}

export interface Schema {
  id: string;
  /** Domain › sector › stream. What the header shows instead of a slug. */
  path: [string, string, string];
  name: string;
  /** Collector slug. Only live schemas have one. */
  dataset?: string;
  availability: Availability;
  /** How often a new value lands, in words and in seconds. */
  cadence: { label: string; seconds: number };
  /** Dryos tokens burned each time this schema is queried. */
  tokens: number;
  entities: { count: number; label: string; sample: string[] };
  /**
   * The row column that names an entity, present when the stream is small
   * enough to fan out — a stream-level reference then means "all of it", and
   * a chart pivots the rows into one series per entity instead of quietly
   * picking the first sample. Streams with thousands of entities (settlement
   * points, buses) leave this unset: fanning those out is not a chart.
   */
  entityKey?: string;
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
   * Entities move, and every row carries where they were.
   *
   * A position feed is not a value per place — it is a place per reading, so the
   * rows carry `lat`, `lon` and a heading alongside the measurements. The map
   * reads this to draw them as tracked objects rather than as fixed pins.
   */
  motion?: boolean;
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
    path: ["Energy", "Power", "Real-time"],
    name: "ERCOT real-time LMP",
    dataset: "ercot-realtime-lmp",
    availability: "live",
    cadence: { label: "every 5 min", seconds: 300 },
    tokens: 1,
    entities: {
      count: 1118,
      label: "settlement points",
      sample: ["HB_HOUSTON", "HB_NORTH", "LZ_WEST"],
    },
    blurb:
      "Locational marginal prices from the latest SCED run, every ERCOT settlement point. " +
      "Collected from ERCOT MIS, reconciled against the source file.",
    maintainer: { name: "Dryos", since: Date.UTC(2026, 7, 1) },
    variables: [
      {
        key: "lmp_total",
        label: "Total LMP",
        unit: "$/MWh",
        availability: "live",
        description: "The settled price. The only price field ERCOT populates.",
        // Preview-only. The data route never generates this schema — it is
        // collected — but a thumbnail has no host to answer its queries, so the
        // preview shim needs a shape to draw. See `runtime.ts`.
        mock: { base: 29, swing: 11, noise: 2.5 },
      },
    ],
  },
  {
    id: "energy.power.dayahead",
    path: ["Energy", "Power", "Day-ahead"],
    name: "ERCOT day-ahead hourly LMP",
    dataset: "ercot-dam-lmp",
    availability: "live",
    cadence: { label: "daily, ~12:35 CT", seconds: 86_400 },
    tokens: 0.5,
    // Bus-level, not settlement points: NP4-183 prices every electrical bus,
    // which is what ERCOT actually publishes hourly for the day-ahead market.
    entities: {
      count: 19_312,
      label: "electrical buses",
      sample: ["CADICKS_804V", "ADICKS__138C", "ADK_V_C"],
    },
    blurb:
      "Hourly cleared prices from the day-ahead market for every ERCOT electrical bus, " +
      "posted once for the following day. Collected from ERCOT MIS (NP4-183), " +
      "reconciled against the source file.",
    maintainer: { name: "Dryos", since: Date.UTC(2026, 7, 29) },
    variables: [
      {
        key: "lmp_total",
        label: "Cleared price",
        unit: "$/MWh",
        availability: "live",
        description: "Hourly day-ahead clearing price for the bus.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 34, swing: 16, noise: 4 },
      },
    ],
  },
  {
    id: "energy.power.load",
    path: ["Energy", "Power", "Load"],
    name: "Actual system load",
    dataset: "ercot-actual-load-weather-zone",
    availability: "live",
    // Hourly rows, but ERCOT posts the whole prior day each morning — the
    // cadence a chart should assume is the row cadence, not the publish one.
    cadence: { label: "hourly, posted next day", seconds: 3_600 },
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
    maintainer: { name: "Dryos", since: Date.UTC(2026, 7, 29) },
    variables: [
      {
        key: "load_mw",
        label: "Actual load",
        unit: "MW",
        availability: "live",
        description: "Hourly average metered demand for the zone.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 9_400, swing: 3_100, noise: 220, floor: 0 },
      },
    ],
  },
  {
    id: "energy.power.loadforecast",
    path: ["Energy", "Power", "Load forecast"],
    name: "Seven-day load forecast",
    dataset: "ercot-load-forecast-weather-zone",
    availability: "live",
    cadence: { label: "hourly, 7 days ahead", seconds: 3_600 },
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
    maintainer: { name: "Dryos", since: Date.UTC(2026, 7, 29) },
    variables: [
      {
        key: "load_mw",
        label: "Forecast load",
        unit: "MW",
        availability: "live",
        description: "Forecast hourly average load for the zone.",
        // Preview-only — see the note on the real-time schema.
        mock: { base: 9_400, swing: 3_000, noise: 90, floor: 0 },
      },
    ],
  },
  {
    id: "energy.power.genmix",
    path: ["Energy", "Power", "Generation mix"],
    name: "Fuel mix",
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
    maintainer: { name: "Dryos", since: Date.UTC(2026, 7, 29) },
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
        mock: { base: 6_200, swing: 4_800, noise: 300, floor: 0 },
      },
    ],
  },
  {
    id: "energy.gas.spot",
    path: ["Energy", "Gas", "Spot"],
    name: "Hub spot gas",
    availability: "mock",
    cadence: { label: "daily, 09:00 CT", seconds: 86_400 },
    tokens: 0.25,
    entities: {
      count: 4,
      label: "pricing hubs",
      sample: ["HENRY", "WAHA", "KATY"],
    },
    blurb:
      "Next-day physical gas at the major hubs. Moves the marginal heat rate, and with it " +
      "most of the power curve.",
    variables: [
      {
        key: "spot_price",
        label: "Spot price",
        unit: "$/MMBtu",
        availability: "mock",
        description: "Next-day midpoint.",
        mock: { base: 2.9, swing: 0.8, noise: 0.15, floor: 0 },
      },
      {
        key: "implied_heat_rate",
        label: "Implied heat rate",
        unit: "MMBtu/MWh",
        availability: "mock",
        description: "Power price divided by gas price for the same day.",
        mock: { base: 11, swing: 3.5, noise: 0.6, floor: 0 },
      },
    ],
  },
  {
    id: "aviation.flights.positions",
    path: ["Aviation", "Flights", "Live positions"],
    name: "ADS-B state vectors",
    availability: "mock",
    // Real ADS-B is roughly per second; the open networks resample to ten.
    cadence: { label: "every 10 s", seconds: 10 },
    tokens: 0.3,
    motion: true,
    entities: {
      count: 36,
      // The ICAO 24-bit transponder address — the identifier the standard is
      // built on, and the one every tracker keys off.
      label: "aircraft",
      sample: ["a1b2c3", "a4d5e6", "a7f809"],
    },
    blurb:
      "Aircraft state vectors in the ADS-B shape — icao24, callsign, position, " +
      "barometric altitude, ground speed, track and vertical rate.",
    variables: [
      {
        key: "baro_altitude_ft",
        label: "Altitude",
        unit: "ft",
        availability: "mock",
        description: "Barometric altitude, the field trackers colour by.",
        mock: { base: 24_000, swing: 14_000, noise: 200, floor: 0 },
      },
      {
        key: "velocity_kt",
        label: "Ground speed",
        unit: "kt",
        availability: "mock",
        description: "Speed over the ground.",
        mock: { base: 420, swing: 90, noise: 8, floor: 0 },
      },
      {
        key: "vertical_rate_fpm",
        label: "Vertical rate",
        unit: "ft/min",
        availability: "mock",
        description: "Climb positive, descent negative.",
        mock: { base: 0, swing: 1_800, noise: 60 },
      },
    ],
  },
  {
    id: "weather.observed.grid",
    path: ["Weather", "Observed", "Gridded field"],
    name: "Surface field",
    availability: "mock",
    cadence: { label: "hourly", seconds: 3_600 },
    tokens: 0.6,
    field: true,
    entities: {
      count: 72,
      label: "grid cells",
      // `G_{lat*10}_{-lon*10}` — the id carries its own position, so a grid can
      // grow or move without a lookup table growing with it. See `geo.ts`.
      sample: ["G_315_1005", "G_300_0975", "G_330_0960"],
    },
    blurb:
      "Temperature and precipitation on a 1.5° grid across the ERCOT footprint. " +
      "The shape of the weather, rather than a reading at eight named places.",
    variables: [
      {
        key: "temp_f",
        label: "Temperature",
        unit: "°F",
        availability: "mock",
        description: "Dry-bulb temperature at the cell centre.",
        mock: { base: 84, swing: 17, noise: 1.2 },
      },
      {
        key: "precip_mm_h",
        label: "Precipitation",
        unit: "mm/h",
        availability: "mock",
        description: "Rain rate at the cell centre.",
        mock: { base: 0.6, swing: 1.6, noise: 0.3, floor: 0 },
      },
    ],
  },
  {
    id: "weather.observed.surface",
    path: ["Weather", "Observed", "Surface"],
    name: "Surface observations",
    availability: "mock",
    cadence: { label: "hourly", seconds: 3_600 },
    tokens: 0.25,
    entities: {
      count: 8,
      label: "weather zones",
      sample: ["COAST", "NORTH_C", "WEST"],
    },
    blurb:
      "Temperature and wind at the zone level — the driver behind both load and wind output.",
    variables: [
      {
        key: "temp_f",
        label: "Temperature",
        unit: "°F",
        availability: "mock",
        description: "Dry-bulb temperature.",
        mock: { base: 82, swing: 15, noise: 1.5 },
      },
      {
        key: "wind_speed_mph",
        label: "Wind speed",
        unit: "mph",
        availability: "mock",
        description: "Sustained wind at 10m.",
        mock: { base: 12, swing: 7, noise: 2, floor: 0 },
      },
    ],
  },
  {
    id: "weather.forecast.wind",
    path: ["Weather", "Forecast", "Wind"],
    name: "Wind generation forecast",
    availability: "mock",
    cadence: { label: "hourly", seconds: 3_600 },
    tokens: 0.4,
    entities: {
      count: 4,
      label: "regions",
      sample: ["WEST", "PANHANDLE", "COASTAL"],
    },
    blurb:
      "Forecast wind output by region, out to 48 hours. The single largest source of " +
      "day-ahead price error in ERCOT.",
    variables: [
      {
        key: "forecast_mw",
        label: "Forecast output",
        unit: "MW",
        availability: "mock",
        description: "Expected regional wind generation.",
        mock: { base: 4_100, swing: 3_200, noise: 260, floor: 0 },
      },
      {
        key: "forecast_error_mw",
        label: "Prior error",
        unit: "MW",
        availability: "mock",
        description:
          "Yesterday's forecast for this hour less what was delivered.",
        mock: { base: 0, swing: 900, noise: 180 },
      },
    ],
  },
];

/** The one schema with a collector behind it. */
export const LIVE_SCHEMA = SCHEMAS.find((s) => s.availability === "live")!;

export function schemaById(id: string): Schema | undefined {
  return SCHEMAS.find((s) => s.id === id);
}

/** Resolve either a schema id or a dataset slug — apps reference both. */
export function schemaFor(ref: string | undefined): Schema | undefined {
  if (!ref) return undefined;
  return SCHEMAS.find((s) => s.id === ref || s.dataset === ref);
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
      ref.kind === "entity" || ref.kind === "query" ? ref.label : undefined,
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
      sublabel: `${s.entities.count.toLocaleString()} ${s.entities.label}`,
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

export function categoryOf(schema: Schema): string {
  return schema.path[1];
}

export function domains(): string[] {
  return [...new Set(SCHEMAS.map(domainOf))];
}

/** Categories inside one domain, or across all of them. */
export function categories(domain?: string): string[] {
  return [
    ...new Set(
      SCHEMAS.filter((s) => !domain || domainOf(s) === domain).map(categoryOf),
    ),
  ];
}

/** What a domain costs to browse: how much of it is real. */
export function domainSummary(domain: string): { total: number; live: number } {
  const inDomain = SCHEMAS.filter((s) => domainOf(s) === domain);
  return {
    total: inDomain.length,
    live: inDomain.filter((s) => s.availability === "live").length,
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
