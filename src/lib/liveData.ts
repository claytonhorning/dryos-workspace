import { PUBLIC_API } from "@/lib/apiDocs";

/**
 * What the delivery API says about a stream, read at render time so a
 * catalogue page shows the stream as it is rather than as it was written
 * down.
 *
 * Three rules hold everywhere in this module, and they are the reason it is
 * separate from the pages that use it:
 *
 *  - **A failure is null, never a throw.** These pages are prerendered, so a
 *    backend that is slow, restarting or mid-deploy would otherwise fail the
 *    whole build — and the page is worth serving without its live figure:
 *    the columns, the source and the prose are the substance. Every caller
 *    renders the absence.
 *  - **Every request carries a timeout.** `fetch` has none by default, and
 *    134 pages behind one hung socket is a build that never ends.
 *  - **Nothing here is on the request path.** Pages revalidate hourly, so a
 *    reader is served HTML and the API sees one call an hour per page, not
 *    one per visit.
 */

/** Long enough for a cold aggregate, short enough that 134 of them end. */
const TIMEOUT_MS = 8_000;

/** Pages are rebuilt hourly; the fetch cache is told the same thing. */
export const REVALIDATE_SECONDS = 3_600;

export interface Column {
  name: string;
  type: string;
  description: string;
  nullable: boolean;
  nullReason: string | null;
  example: string | null;
}

export interface Change {
  on: string;
  what: string;
  why: string;
}

export interface DatasetEntry {
  slug: string;
  name: string;
  tagline: string;
  source: { name: string; url: string; basis: string };
  schedule: string;
  freshnessSlaSeconds: number;
  schema: Column[];
  primaryKey: string[];
  changelog: Change[];
  serving: { entity: string | null; entityType: string | null; measure: string | null; unit: string | null };
  status: string;
  lastRunAt: string | null;
  rowCount: number | null;
  health: string | null;
}

export interface Row {
  interval_start_utc: string;
  [column: string]: unknown;
}

export interface Coverage {
  rows: number;
  nodes: number;
  located: number | null;
  earliest: string | null;
  latest: string | null;
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${PUBLIC_API}${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // A timeout, a DNS failure, a 500, a body that is not JSON: all the same
    // answer to the only question a page asks, which is whether to draw it.
    return null;
  }
}

/** The catalogue entry: columns, source, primary key, schedule, changelog. */
export function datasetEntry(slug: string): Promise<DatasetEntry | null> {
  return get<DatasetEntry>(`/v1/datasets/${slug}`);
}

/**
 * The newest rows for one entity, or for the stream where it has none.
 *
 * `newest=true` would answer for every entity at once, which is the right
 * call for a map and the wrong one here: a page shows two or three named
 * places, and asking for one of them is an indexed seek.
 */
export async function newestRows(
  slug: string,
  opts: { node?: string; limit?: number } = {},
): Promise<Row[] | null> {
  const params = new URLSearchParams();
  if (opts.node) params.set("node", opts.node);
  params.set("limit", String(opts.limit ?? 1));
  const body = await get<{ rows: Row[] }>(`/v1/datasets/${slug}/query?${params}`);
  return body?.rows ?? null;
}

/**
 * The table's extent — how many rows, how many entities, and since when.
 *
 * This is the one expensive call: the API scans a dataset once per collector
 * run to derive it, so the first request after a run pays for it and every
 * one after is milliseconds. A page that does not get it draws without the
 * coverage line.
 */
export function coverage(slug: string): Promise<Coverage | null> {
  return get<{ coverage: Coverage }>(`/v1/datasets/${slug}/nodes?limit=1`).then(
    (b) => b?.coverage ?? null,
  );
}

/** The headline figure for a group page: one current value per named entity. */
export async function headline(
  slug: string,
  entities: string[],
  measure: string,
): Promise<{ entity: string; value: number; at: string }[]> {
  const found = await Promise.all(
    entities.map(async (entity) => {
      const rows = await newestRows(slug, { node: entity, limit: 1 });
      const row = rows?.[0];
      const value = row?.[measure];
      if (typeof value !== "number" || !row) return null;
      return { entity, value, at: row.interval_start_utc };
    }),
  );
  return found.filter((f): f is { entity: string; value: number; at: string } => f !== null);
}

/* ── Formatting, shared by every page that draws a live figure ─────────── */

/** A number as its unit wants to be read: money to the cent, MW whole. */
export function formatValue(value: number, unit: string | null | undefined): string {
  if (unit && unit.startsWith("$")) {
    return value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  }
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 1 ? 1 : 2;
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * A UTC instant, written as UTC.
 *
 * Never localised: the server renders this once an hour and the reader may be
 * anywhere, so a local time here would be the build machine's, which is a
 * wrong number rather than a missing one.
 */
export function formatInstant(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** "17 September 2026" — for a coverage line, where the clock does not matter. */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** ISO-8601 interval, the form schema.org's `temporalCoverage` wants. */
export function temporalCoverage(c: Coverage | null): string | undefined {
  if (!c?.earliest) return undefined;
  return `${c.earliest.slice(0, 10)}/${c.latest ? c.latest.slice(0, 10) : ".."}`;
}
