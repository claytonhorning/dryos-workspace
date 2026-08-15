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
import type { Dataset, DatasetCategory } from "./types";
import type { VerticalId } from "./verticals";

const API = process.env.DRYOS_API_URL;

async function fetchCatalogue(): Promise<Dataset[]> {
  if (!API) return catalogue;
  try {
    const res = await fetch(`${API}/v1/datasets`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`${res.status} from ${API}`);
    const body = (await res.json()) as { datasets: Dataset[] };
    return body.datasets;
  } catch (err) {
    // A backend that is down must not blank the marketing site. Serve the
    // static mirror and say so in the log rather than throwing.
    console.warn(`[repo] falling back to static catalogue: ${err}`);
    return catalogue;
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
