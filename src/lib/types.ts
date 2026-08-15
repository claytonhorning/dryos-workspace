import type { ServingTier } from "./tiers";
import type { VerticalId } from "./verticals";

export type SourceBasis = "iso_public" | "public_government" | "tos_reviewed" | "licensed";

export type Cadence = "5min" | "15min" | "hourly" | "daily" | "weekly" | "monthly";

export type FieldType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "timestamp"
  | "date";

export interface SchemaField {
  name: string;
  type: FieldType;
  description: string;
  nullable: boolean;
  /** Why it can be null. Required on nullable fields — the backend enforces it. */
  nullReason?: string | null;
  example?: string | null;
}

/**
 * A dataset's *status*, not its health.
 *
 * `pending` means no collector run has landed yet. There is deliberately no
 * health badge in that state — a listing that has never run has not earned a
 * green light, and showing one would be the exact thing this rewrite removed.
 */
export type DatasetStatus = "pending" | "live";

export type HealthStatus = "healthy" | "degraded" | "stale" | "failing";

/**
 * Telemetry is absent until a collector actually runs.
 *
 * Every field here is nullable on purpose. The frontend must render the
 * not-yet-collected case rather than substituting a plausible number.
 */
export interface DatasetTelemetry {
  lastRunAt: string | null;
  rowCount: number | null;
  health: HealthStatus | null;
  historyFrom: string | null;
}

/**
 * Everything here is verifiable: it mirrors the `CollectorSpec` the backend
 * declares. No subscriber counts, no revenue, no uptime — those come from the
 * API once there is something to measure.
 */
export interface Dataset {
  slug: string;
  vertical: VerticalId;
  name: string;
  tagline: string;
  description: string;
  category: DatasetCategory;
  region: string;

  sourceName: string;
  sourceUrl: string;
  sourceBasis: SourceBasis;

  cadence: Cadence;
  /** Declared freshness window, in minutes. */
  slaMinutes: number;

  tier: ServingTier;
  availableTiers: ServingTier[];

  schema: SchemaField[];
  primaryKey: string[];

  /** Indicative launch pricing, per offered tier. */
  pricing: Partial<Record<ServingTier, TierPrice>>;

  status: DatasetStatus;
  telemetry: DatasetTelemetry;
}

export type DatasetCategory = "Market & Pricing";

/**
 * One settlement interval, described by its timing rather than its values.
 *
 * The preview deliberately carries no prices. What a buyer needs to judge
 * before paying is whether the data shows up when it is supposed to — the
 * numbers themselves are what they are buying, not a free sample.
 */
export interface PreviewInterval {
  t: string;
  /** When the ISO posted this interval. */
  postedAt: string | null;
  /** When Dryos had it. */
  collectedAt: string | null;
  nodes: number;
  /** Seconds from interval to the source publishing it. */
  postLagSeconds: number | null;
  /** Seconds from interval to us having it. Drives the graph colour. */
  collectLagSeconds: number | null;
}

export interface DatasetPreview {
  dataset: string;
  hours: number;
  freshnessSlaSeconds: number;
  /** Expected gap between collections, from the declared schedule. */
  cadenceSeconds: number | null;
  intervals: PreviewInterval[];
}

/** What a buyer pays on a given tier. A decision, not a measurement. */
export interface TierPrice {
  unitPriceUsd: number;
  unit: string;
  freeAllowance: string;
}
