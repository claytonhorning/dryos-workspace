import type { Dataset, SchemaField } from "./types";

/**
 * Static mirror of the collector specs the backend declares.
 *
 * This exists so the marketing surface renders before the backend is running.
 * It carries only facts that are true today — source URLs, legal basis, declared
 * schema, cadence, SLA — and no telemetry. The moment `DRYOS_API_URL` is set,
 * `repo.ts` reads the live catalogue instead and this becomes a fallback.
 *
 * Keep it in sync with `backend/src/dryos/collectors/`. If it drifts, the API
 * wins.
 */

/**
 * The shared LMP shape. Both ISOs publish locational prices; neither publishes
 * them in the same shape as the other, and normalising them onto one schema is
 * the actual product.
 */
const LMP_SCHEMA: SchemaField[] = [
  {
    name: "interval_start_utc",
    type: "timestamp",
    description:
      "Start of the settlement interval, UTC. Always UTC — the ISOs publish in local time with inconsistent DST handling.",
    nullable: false,
    example: "2026-08-14T15:00:00Z",
  },
  {
    name: "iso",
    type: "string",
    description: "Publishing ISO. CAISO or ERCOT.",
    nullable: false,
    example: "CAISO",
  },
  {
    name: "market",
    type: "string",
    description: "Market the price cleared in. DAM (day-ahead) or RTM (real-time).",
    nullable: false,
    example: "DAM",
  },
  {
    name: "node",
    type: "string",
    description: "Pricing node or settlement point identifier, as published by the ISO.",
    nullable: false,
    example: "SLAP_PGP2-APND",
  },
  {
    name: "node_type",
    type: "string",
    description: "Node classification where the ISO publishes one.",
    nullable: true,
    nullReason: "ERCOT does not classify settlement points in this report.",
    example: "APND",
  },
  {
    name: "lmp_total",
    type: "number",
    description: "Total locational marginal price, $/MWh.",
    nullable: false,
    example: "41.83",
  },
  {
    name: "lmp_energy",
    type: "number",
    description: "Energy component, $/MWh.",
    nullable: true,
    nullReason: "ERCOT settlement point prices are published without a component breakdown.",
    example: "39.12",
  },
  {
    name: "lmp_congestion",
    type: "number",
    description: "Congestion component, $/MWh.",
    nullable: true,
    nullReason: "ERCOT settlement point prices are published without a component breakdown.",
    example: "2.94",
  },
  {
    name: "lmp_loss",
    type: "number",
    description: "Loss component, $/MWh.",
    nullable: true,
    nullReason: "ERCOT settlement point prices are published without a component breakdown.",
    example: "-0.23",
  },
  {
    name: "source_published_at_utc",
    type: "timestamp",
    description:
      "When the ISO published this interval, UTC. Lets you tell 'we were slow' from 'the ISO was slow'.",
    nullable: true,
    nullReason: "Not every report carries a publication timestamp.",
  },
];

const PRIMARY_KEY = ["iso", "market", "node", "interval_start_utc"];

/** No collector has run yet, so there is nothing to report. */
const NO_TELEMETRY = {
  lastRunAt: null,
  rowCount: null,
  health: null,
  historyFrom: null,
};

export const catalogue: Dataset[] = [
  {
    slug: "caiso-day-ahead-nodal-lmp",
    vertical: "energy",
    name: "CAISO Day-Ahead Nodal LMP",
    tagline:
      "Hourly day-ahead locational marginal prices for every CAISO pricing node, with energy, congestion and loss components broken out.",
    description:
      "The day-ahead market clears once daily and publishes nodal prices through OASIS. Getting them out cleanly is more work than it looks: the endpoint returns a ZIP wrapping a CSV, caps a request at 31 days and silently truncates past that rather than erroring, and hands back long-format rows that have to be pivoted to get one row per node-interval.",
    category: "Market & Pricing",
    region: "CAISO (California)",
    sourceName: "CAISO OASIS",
    sourceUrl: "http://oasis.caiso.com/oasisapi",
    sourceBasis: "iso_public",
    sourceNotes: [
      "Returns a ZIP wrapping one CSV, not CSV.",
      "Caps a request at 31 days and silently truncates past that instead of erroring, so windows have to be chunked and each chunk row-counted.",
      "Prices arrive long-format — one row per node, interval and LMP_TYPE — and have to be pivoted to break the components out.",
      "Node identifiers are reused across network model updates, so a rename can silently re-point history unless it is reconciled against the current model.",
    ],
    cadence: "daily",
    slaMinutes: 30 * 60,
    tier: "standard",
    availableTiers: ["archive", "standard"],
    schema: LMP_SCHEMA,
    primaryKey: PRIMARY_KEY,
    status: "pending",
    telemetry: NO_TELEMETRY,
  },
  {
    slug: "ercot-day-ahead-spp",
    vertical: "energy",
    name: "ERCOT Day-Ahead Settlement Point Prices",
    tagline:
      "Hourly day-ahead prices for every ERCOT settlement point — hubs, load zones and resource nodes — on the same schema as the CAISO feed.",
    description:
      "ERCOT publishes day-ahead settlement point prices per settlement point with no component breakdown, on a local delivery date plus a 1–24 hour-ending, with a separate flag for the repeated hour in the autumn DST fold. Parsed naively, one hour a year is silently corrupted. This collector emits unambiguous UTC instants and the same column names as the CAISO feed.",
    category: "Market & Pricing",
    region: "ERCOT (Texas)",
    sourceName: "ERCOT Public API",
    sourceUrl: "https://api.ercot.com/api/public-reports",
    sourceBasis: "iso_public",
    sourceNotes: [
      "Requires a registered subscription key — ERCOT removed anonymous access to public reports.",
      "Published per settlement point with no component breakdown, so the energy, congestion and loss columns are legitimately null here.",
      "Timestamps are a local delivery date plus a 1–24 hour-ending, with a DST flag for the repeated autumn hour. Naive parsing corrupts one hour a year.",
    ],
    cadence: "daily",
    slaMinutes: 30 * 60,
    tier: "standard",
    availableTiers: ["archive", "standard"],
    schema: LMP_SCHEMA,
    primaryKey: PRIMARY_KEY,
    status: "pending",
    telemetry: NO_TELEMETRY,
  },
];
