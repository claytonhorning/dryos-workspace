import { supabaseServer } from "@/lib/supabase/server";
import { type Schema, schemaFor } from "./catalog";

/**
 * Usage, actually counted.
 *
 * The data route has always been described as the one place that could meter a
 * call. This is that meter. It exists because the pricing claim on the landing
 * page — you pay for production data, by the query, and for nothing else — is
 * only worth making if the product can show you the number.
 *
 * Two rules, and they are the whole billing model:
 *   · A live schema costs its `tokens` per query.
 *   · A mock schema costs nothing. It is generated locally; charging for it
 *     would be charging for our own placeholder.
 *
 * The ledger lives in Supabase now — one row per (day, screen, schema), owned
 * by the user whose token made the query, incremented atomically by the
 * `record_usage` function so concurrent polls never lose a line. Anonymous
 * queries have no row to land on and are deliberately not counted: a ledger
 * entry that cannot be billed to anyone is noise wearing the clothes of data.
 */

export interface Entry {
  queries: number;
  rows: number;
  tokens: number;
}

export interface Ledger {
  /**
   * UTC day → screen → schema → totals.
   *
   * Keyed by day so a window is a range of lookups, and by screen so a screen
   * can be asked what it cost without asking the whole workspace. Queries that
   * arrive without a screen — the standalone bundle URL, a preview — land under
   * `-`, which is honest about not knowing rather than attributing them to
   * whatever was open at the time.
   */
  days: Record<string, Record<string, Record<string, Entry>>>;
}

export interface WindowUsage {
  queries: number;
  rows: number;
  tokens: number;
  /** Calls that cost something, so "1,204 calls · 12 billable" reads true. */
  billable: number;
  bySchema: {
    schemaId: string;
    path: string;
    availability: "live" | "mock";
    queries: number;
    rows: number;
    tokens: number;
  }[];
}

export interface UsageSummary {
  day: string;
  /** Counted windows, not projections. What was actually served. */
  today: WindowUsage;
  week: WindowUsage;
  month: WindowUsage;
  allTime: WindowUsage;
  /** The range each window covers, said plainly. */
  ranges: { today: string; week: string; month: string };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** UTC day keys covering a window, newest first. */
function daysBack(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

/** Day keys from the first of the current month to today. */
function monthToDate(): string[] {
  const now = new Date();
  const days = now.getUTCDate();
  return daysBack(days);
}

async function read(): Promise<Ledger> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("usage_entries")
    .select("day, app_id, schema_id, queries, rows, tokens");

  const out: Ledger = { days: {} };
  for (const r of data ?? []) {
    const screens = (out.days[r.day] ??= {});
    (screens[r.app_id] ??= {})[r.schema_id] = {
      queries: Number(r.queries),
      rows: Number(r.rows),
      tokens: r.tokens,
    };
  }
  return out;
}

/**
 * Bill one query.
 *
 * Deliberately never throws and never awaits anything the caller depends on — a
 * failure to write the ledger must not fail the query it was counting. Losing a
 * line of accounting is recoverable; refusing to serve data because accounting
 * hiccuped is not.
 */
export async function record(
  datasetRef: string,
  rows: number,
  appId?: string,
): Promise<void> {
  const schema = schemaFor(datasetRef);
  if (!schema) return;

  try {
    const supabase = await supabaseServer();
    await supabase.rpc("record_usage", {
      p_day: today(),
      p_app: appId || "-",
      p_schema: schema.id,
      p_rows: rows,
      p_tokens: cost(schema),
    });
  } catch {
    // Accounting is best-effort. The query already succeeded.
  }
}

/** What one query against this schema costs. Mock data is free. */
export function cost(schema: Schema): number {
  return schema.availability === "live" ? schema.tokens : 0;
}

/** Roll a set of days up, optionally narrowed to a set of screens. */
function windowOf(
  ledger: Ledger,
  days: string[],
  only?: Set<string>,
): WindowUsage {
  const totals = new Map<string, Entry>();

  for (const day of days) {
    const screens = ledger.days[day];
    if (!screens) continue;
    for (const [id, perSchema] of Object.entries(screens)) {
      if (only && !only.has(id)) continue;
      for (const [schemaId, e] of Object.entries(perSchema)) {
        const t = totals.get(schemaId) ?? { queries: 0, rows: 0, tokens: 0 };
        t.queries += e.queries;
        t.rows += e.rows;
        t.tokens += e.tokens;
        totals.set(schemaId, t);
      }
    }
  }

  const bySchema = [...totals.entries()]
    .map(([schemaId, t]) => {
      const s = schemaFor(schemaId);
      return {
        schemaId,
        path: s ? s.path.join(" › ") : schemaId,
        availability: (s?.availability ?? "mock") as "live" | "mock",
        ...t,
      };
    })
    .sort((a, b) => b.tokens - a.tokens || b.queries - a.queries);

  return {
    queries: bySchema.reduce((n, r) => n + r.queries, 0),
    rows: bySchema.reduce((n, r) => n + r.rows, 0),
    tokens: bySchema.reduce((n, r) => n + r.tokens, 0),
    billable: bySchema
      .filter((r) => r.availability === "live")
      .reduce((n, r) => n + r.queries, 0),
    bySchema,
  };
}

/**
 * Counted usage, optionally for a set of screens.
 *
 * A set rather than one id because a workspace is asked the same question its
 * pages are, and summing its pages here beats making the caller fetch each of
 * them and add up.
 */
export async function usage(appIds?: string[]): Promise<UsageSummary> {
  const ledger = await read();
  const all = Object.keys(ledger.days);
  const month = monthToDate();
  const only = appIds ? new Set(appIds) : undefined;

  return {
    day: today(),
    today: windowOf(ledger, [today()], only),
    week: windowOf(ledger, daysBack(7), only),
    month: windowOf(ledger, month, only),
    allTime: windowOf(ledger, all, only),
    ranges: {
      today: today(),
      week: `${daysBack(7)[6]} → ${today()}`,
      month: `${month[month.length - 1]} → ${today()}`,
    },
  };
}
