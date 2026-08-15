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
  /** How the source is awkward, and what the collector does about it. */
  sourceNotes: string[];

  cadence: Cadence;
  /** Declared freshness window, in minutes. */
  slaMinutes: number;

  tier: ServingTier;
  availableTiers: ServingTier[];

  schema: SchemaField[];
  primaryKey: string[];

  status: DatasetStatus;
  telemetry: DatasetTelemetry;
}

export type DatasetCategory = "Market & Pricing";

/** One settlement interval, aggregated across nodes. */
export interface PreviewInterval {
  t: string;
  lo: number | null;
  avg: number | null;
  hi: number | null;
  nodes: number;
  /** Seconds between the interval and our collection of it. Measured. */
  lagSeconds: number | null;
}

export interface DatasetPreview {
  dataset: string;
  hours: number;
  unit: string;
  freshnessSlaSeconds: number;
  /** Expected gap between collections, from the declared schedule. */
  cadenceSeconds: number | null;
  intervals: PreviewInterval[];
}
