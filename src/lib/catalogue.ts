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
    description: "Market the price cleared in. DAM (day-ahead) or RTM (real-time, SCED).",
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
    description:
      "Node classification. ERCOT is derived from the settlement point naming convention (HUB / LOAD_ZONE / DC_TIE / RESOURCE_NODE); CAISO from its node identifier suffix.",
    nullable: true,
    nullReason: "CAISO occasionally publishes a node whose suffix matches no known classification.",
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
    cadence: "daily",
    slaMinutes: 30 * 60,
    tier: "standard",
    availableTiers: ["standard"],
    pricing: {
      standard: { unitPriceUsd: 0.3, unit: "1k rows", freeAllowance: "50k rows/mo" },
    },
    schema: LMP_SCHEMA,
    primaryKey: PRIMARY_KEY,
    status: "pending",
    telemetry: NO_TELEMETRY,
  },
  {
    slug: "ercot-realtime-lmp",
    vertical: "energy",
    name: "ERCOT Real-Time LMPs by Settlement Point",
    tagline:
      "Locational marginal prices for all ~1,100 ERCOT settlement points — resource nodes, load zones, trading hubs and DC ties — from the latest SCED run, roughly every five minutes.",
    description:
      "ERCOT's SCED engine prices every settlement point about every five minutes and publishes each run as a zipped CSV on the MIS. The collector walks the report listing, pulls every run published since the last watermark, and emits unambiguous UTC instants with settlement points classified — on the same column names as the CAISO feed. Verified end to end against the live endpoint: 1,118 settlement points per run, all validation checks passing.",
    category: "Market & Pricing",
    region: "ERCOT (Texas)",
    sourceName: "ERCOT MIS · NP6-788-CD",
    sourceUrl:
      "https://www.ercot.com/mp/data-products/data-product-details?id=NP6-788-CD",
    sourceBasis: "iso_public",
    cadence: "5min",
    slaMinutes: 20,
    tier: "realtime",
    availableTiers: ["standard", "realtime"],
    pricing: {
      standard: { unitPriceUsd: 0.3, unit: "1k rows", freeAllowance: "50k rows/mo" },
      realtime: { unitPriceUsd: 0.85, unit: "1k API calls", freeAllowance: "5k calls/mo" },
    },
    schema: LMP_SCHEMA,
    primaryKey: PRIMARY_KEY,
    status: "pending",
    telemetry: NO_TELEMETRY,
  },
];
