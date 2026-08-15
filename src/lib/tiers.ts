/**
 * Serving tiers.
 *
 * Which engine backs a dataset is a property of the *listing*, chosen at publish
 * alongside delivery — not something the platform guesses at query time. It
 * determines the latency the buyer can hold us to, which access surfaces exist,
 * and what the data costs, because a billion-row table behind a sub-100ms cache
 * has a genuinely different cost structure than a monthly Parquet drop.
 */
export type ServingTier = "archive" | "standard" | "realtime" | "share";

export interface TierDef {
  id: ServingTier;
  name: string;
  /** What actually stores and serves it. */
  engine: string;
  /** What the buyer can hold us to. */
  latencySlo: string;
  /** Access surfaces this tier unlocks. */
  surfaces: string[];
  /**
   * Multiple of the standard rate for the same cadence and volume. `null` means
   * this tier is not priced per call at all — see `priceModel`.
   */
  priceMultiplier: number | null;
  priceModel: string;
  bestFor: string;
  /** Why it costs what it costs — shown to both sides. */
  rationale: string;
}

export const TIERS: TierDef[] = [
  {
    id: "archive",
    name: "Archive",
    engine: "Object store, Iceberg tables",
    latencySlo: "Job-based, minutes to first byte",
    surfaces: ["Bulk export (CSV/Parquet)"],
    priceMultiplier: 0.6,
    priceModel: "Per export",
    bestFor: "Large or slow-moving history that gets pulled whole, not queried.",
    rationale:
      "No always-on query engine to keep warm. You are paying for the collection and the normalisation, not for us to hold it in memory.",
  },
  {
    id: "standard",
    name: "Standard",
    engine: "Postgres",
    latencySlo: "p95 under 400 ms",
    surfaces: ["Query API", "Bulk export"],
    priceMultiplier: 1,
    priceModel: "Per 1k rows or calls",
    bestFor:
      "Filtered reads over recent and moderate history. The right answer for most listings.",
    rationale:
      "The default. Fast enough to build a product on, cheap enough that a prototype costs prototype money.",
  },
  {
    id: "realtime",
    name: "Realtime",
    engine: "ClickHouse + hot cache",
    latencySlo: "p50 under 100 ms, sustained 500 rps",
    surfaces: ["Query API", "Webhooks", "Bulk export"],
    priceMultiplier: 2.2,
    priceModel: "Per 1k calls",
    bestFor:
      "Dashboards and alerting that poll constantly — or that would rather be pushed than poll at all.",
    rationale:
      "A hot tier costs real money to keep warm whether you query it or not, and webhooks mean we hold delivery state per subscriber.",
  },
  {
    id: "share",
    name: "Warehouse share",
    engine: "Snowflake / Databricks zero-copy share",
    latencySlo: "Live table in your own warehouse",
    surfaces: ["Snowflake share", "Databricks Delta Share"],
    priceMultiplier: null,
    priceModel: "Flat, per consuming account per month",
    bestFor:
      "Billion-row datasets you want to join against your own data without moving them.",
    rationale:
      "You are not paying for egress or per-row reads because there aren't any — the table appears in your warehouse and your own compute queries it. So it prices per seat, not per call.",
  },
];

export const tierById = new Map(TIERS.map((t) => [t.id, t]));

export function tierDef(id: ServingTier): TierDef {
  return tierById.get(id)!;
}

/** Cheapest-first, so a tier list always reads as a ladder. */
export const TIER_ORDER: ServingTier[] = ["archive", "standard", "realtime", "share"];

export function sortTiers(tiers: ServingTier[]): ServingTier[] {
  return [...tiers].sort((a, b) => TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b));
}

/**
 * Which tiers a dataset is *allowed* to offer.
 *
 * The buyer picks the tier they subscribe on, but not from an unconstrained
 * list — a tier can never deliver data fresher than the collector produces it.
 * Promising p50-under-100ms reads on a monthly report would be selling latency
 * that means nothing, so the platform refuses to let a maintainer offer it.
 */
export function eligibleTiers(cadence: string, rowCount: number): ServingTier[] {
  const out: ServingTier[] = ["archive", "standard"];

  // Realtime only earns its premium when the underlying data actually moves.
  if (["5min", "15min", "hourly"].includes(cadence)) out.push("realtime");

  // Below ~100M rows a warehouse share costs more to operate than it saves.
  if (rowCount >= 100_000_000) out.push("share");

  return sortTiers(out);
}

export function tierIneligibleReason(
  tier: ServingTier,
  cadence: string,
  rowCount: number,
): string | null {
  if (eligibleTiers(cadence, rowCount).includes(tier)) return null;
  if (tier === "realtime") {
    return "This collector runs too infrequently for realtime to mean anything — buyers would pay 2.2× for data that changes on the same schedule either way.";
  }
  if (tier === "share") {
    return "Warehouse shares are for datasets large enough that moving them costs more than querying them in place. Under ~100M rows, an export is cheaper for everyone.";
  }
  return "Not available for this dataset.";
}
