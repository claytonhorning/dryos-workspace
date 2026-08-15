/**
 * Data access facade.
 *
 * Reads the live catalogue from the backend when `DRYOS_API_URL` is set, and
 * falls back to the static mirror in `catalogue.ts` when it is not — which is
 * the state before the backend is deployed.
 *
 * The fallback carries no telemetry, so a page rendered from it shows a dataset
 * as `pending` rather than inventing a health badge. That is the whole point:
 * there is no code path here that can produce a number nobody measured.
 */
import { catalogue } from "./catalogue";
import type { Dataset, DatasetCategory, DatasetPreview } from "./types";
import type { VerticalId } from "./verticals";

const API = process.env.DRYOS_API_URL;

/**
 * The API is authoritative for anything measured — status, telemetry, schema,
 * tiers, SLA. The catalogue supplies editorial copy the backend has no business
 * holding: region, description, why the source is awkward.
 *
 * Merging rather than replacing means a listing keeps its prose when the backend
 * comes online, and keeps rendering honestly when it goes away.
 */
function merge(local: Dataset, live: Record<string, unknown>): Dataset {
  const t = live as {
    name?: string;
    tagline?: string;
    schema?: Dataset["schema"];
    primaryKey?: string[];
    tiers?: Dataset["availableTiers"];
    defaultTier?: Dataset["tier"];
    freshnessSlaSeconds?: number;
    status?: Dataset["status"];
    lastRunAt?: string | null;
    rowCount?: number | null;
    health?: Dataset["telemetry"]["health"];
  };
  return {
    ...local,
    name: t.name ?? local.name,
    tagline: t.tagline ?? local.tagline,
    schema: t.schema ?? local.schema,
    primaryKey: t.primaryKey ?? local.primaryKey,
    availableTiers: t.tiers ?? local.availableTiers,
    tier: t.defaultTier ?? local.tier,
    slaMinutes: t.freshnessSlaSeconds
      ? Math.round(t.freshnessSlaSeconds / 60)
      : local.slaMinutes,
    status: t.status ?? local.status,
    telemetry: {
      lastRunAt: t.lastRunAt ?? null,
      rowCount: t.rowCount ?? null,
      health: t.health ?? null,
      historyFrom: local.telemetry.historyFrom,
    },
  };
}

async function fetchCatalogue(): Promise<Dataset[]> {
  if (!API) return catalogue;
  try {
    const res = await fetch(`${API}/v1/datasets`, { next: { revalidate: 30 } });
    if (!res.ok) throw new Error(`${res.status} from ${API}`);
    const body = (await res.json()) as { datasets: Record<string, unknown>[] };
    const bySlug = new Map(body.datasets.map((d) => [d.slug as string, d]));
    return catalogue.map((d) => {
      const live = bySlug.get(d.slug);
      return live ? merge(d, live) : d;
    });
  } catch (err) {
    // A backend that is down must not blank the marketing site. Serve the
    // static mirror — which carries no telemetry, so the page degrades to the
    // honest pre-launch state rather than to stale numbers.
    console.warn(`[repo] falling back to static catalogue: ${err}`);
    return catalogue;
  }
}

/**
 * Recent data, aggregated per interval. Returns null when there is no backend
 * or nothing collected — the caller renders the empty state rather than a chart
 * of zeroes.
 */
export async function getPreview(
  slug: string,
  hours = 24,
): Promise<DatasetPreview | null> {
  if (!API) return null;
  try {
    const res = await fetch(`${API}/v1/datasets/${slug}/preview?hours=${hours}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as DatasetPreview;
    return body.intervals.length ? body : null;
  } catch {
    return null;
  }
}

export interface DatasetFilters {
  q?: string;
  vertical?: VerticalId;
  category?: DatasetCategory | "all";
}

export async function listDatasets(filters: DatasetFilters = {}): Promise<Dataset[]> {
  const { q, vertical, category = "all" } = filters;
  const needle = q?.trim().toLowerCase();
  const all = await fetchCatalogue();

  return all.filter((d) => {
    if (vertical && d.vertical !== vertical) return false;
    if (category !== "all" && d.category !== category) return false;
    if (!needle) return true;
    const hay = [
      d.name,
      d.tagline,
      d.description,
      d.category,
      d.region,
      d.sourceName,
      ...d.schema.map((f) => f.name),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(needle);
  });
}

export async function getDataset(slug: string): Promise<Dataset | undefined> {
  const all = await fetchCatalogue();
  return all.find((d) => d.slug === slug);
}

/**
 * Marketplace rollup.
 *
 * Only counts. No uptime, no latency, no SLA attainment — nothing has run, so
 * there is nothing to measure and any figure here would be invented.
 */
export async function getMarketplaceStats() {
  const all = await fetchCatalogue();
  return {
    datasetCount: all.length,
    liveCount: all.filter((d) => d.status === "live").length,
    pendingCount: all.filter((d) => d.status === "pending").length,
  };
}

export const CATEGORIES: DatasetCategory[] = ["Market & Pricing"];
