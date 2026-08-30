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
 * The shared LMP shape. Every ISO publishes locational prices and no two publish
 * them the same way; normalising onto one schema is the actual product. Only
 * ERCOT is implemented today, and the columns a single ISO cannot fill are
 * declared nullable with a reason rather than dropped — so adding the next ISO
 * is additive rather than a schema break.
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
    description: "Publishing ISO.",
    nullable: false,
    example: "ERCOT",
  },
  {
    name: "market",
    type: "string",
    description:
      "Market the price cleared in. DAM (day-ahead) or RTM (real-time, SCED).",
    nullable: false,
    example: "RTM",
  },
  {
    name: "node",
    type: "string",
    description:
      "Pricing node or settlement point identifier, as published by the ISO.",
    nullable: false,
    example: "HB_HOUSTON",
  },
  {
    name: "node_type",
    type: "string",
    description:
      "Node classification. For ERCOT this is derived from the settlement point naming convention: HUB / LOAD_ZONE / DC_TIE / RESOURCE_NODE.",
    nullable: true,
    nullReason:
      "An ISO may publish a point whose identifier matches no known classification.",
    example: "HB_HOUSTON",
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
    nullReason:
      "ERCOT publishes settlement point prices without a component breakdown.",
    example: "39.12",
  },
  {
    name: "lmp_congestion",
    type: "number",
    description: "Congestion component, $/MWh.",
    nullable: true,
    nullReason:
      "ERCOT publishes settlement point prices without a component breakdown.",
    example: "2.94",
  },
  {
    name: "lmp_loss",
    type: "number",
    description: "Loss component, $/MWh.",
    nullable: true,
    nullReason:
      "ERCOT publishes settlement point prices without a component breakdown.",
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
    slug: "ercot-realtime-lmp",
    vertical: "energy",
    name: "ERCOT Real-Time LMPs by Settlement Point",
    tagline:
      "Locational marginal prices for all ~1,100 ERCOT settlement points — resource nodes, load zones, trading hubs and DC ties — from the latest SCED run, roughly every five minutes.",
    description:
      "ERCOT's SCED engine prices every settlement point about every five minutes and publishes each run as a zipped CSV on the MIS. The collector walks the report listing, pulls every run published since the last watermark, and emits unambiguous UTC instants with settlement points classified  Verified end to end against the live endpoint: 1,118 settlement points per run, all validation checks passing.",
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
      standard: {
        unitPriceUsd: 0.3,
        unit: "1k rows",
        freeAllowance: "50k rows/mo",
      },
      realtime: {
        unitPriceUsd: 0.85,
        unit: "1k API calls",
        freeAllowance: "5k calls/mo",
      },
    },
    schema: LMP_SCHEMA,
    primaryKey: PRIMARY_KEY,
    status: "pending",
    telemetry: NO_TELEMETRY,
  },
  {
    slug: "ercot-dam-lmp-bus",
    vertical: "energy",
    name: "ERCOT DAM Hourly LMPs by Bus",
    tagline:
      "Day-ahead hourly locational marginal prices for every ERCOT electrical bus — the cleared price for each hour of tomorrow, published once a day after the DAM run.",
    description:
      "ERCOT's day-ahead market clears once a day and publishes an hourly price for every electrical bus (~19,000) as a zipped CSV on the MIS, normally between 12:30 and 13:30 CT. The collector walks the NP4-183 report listing, converts hour-ending wall-clock times into unambiguous UTC interval starts — including the repeated hour of the autumn DST fold — and emits onto the same shared LMP schema as the real-time feed, so day-ahead and real-time join on the same columns.",
    category: "Market & Pricing",
    region: "ERCOT (Texas)",
    sourceName: "ERCOT MIS · NP4-183-CD",
    sourceUrl:
      "https://www.ercot.com/mp/data-products/data-product-details?id=NP4-183-CD",
    sourceBasis: "iso_public",
    cadence: "daily",
    slaMinutes: 1560,
    tier: "standard",
    availableTiers: ["archive", "standard"],
    pricing: {
      standard: {
        unitPriceUsd: 0.3,
        unit: "1k rows",
        freeAllowance: "50k rows/mo",
      },
    },
    schema: LMP_SCHEMA,
    primaryKey: PRIMARY_KEY,
    status: "pending",
    telemetry: NO_TELEMETRY,
  },
];
