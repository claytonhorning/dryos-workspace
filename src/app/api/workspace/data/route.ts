import { NextResponse, after } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { record } from "@/lib/workspace/meter";
import { isMockDataset, mockRows } from "@/lib/workspace/mockData";
import { normaliseRow, resolveTime } from "@/lib/workspace/time";

/**
 * The only way an app reaches data.
 *
 * Apps run with no network of their own and post their requests to the host,
 * which arrives here. Everything a credential would be needed for happens on
 * this side of the boundary — which is also the single place that would meter,
 * cache or refuse a call once this is more than a proof of concept.
 *
 * It is also where every query is metered — see `meter.ts`. Live schemas cost
 * their token price per call, mock ones cost nothing, and that difference is
 * the entire pricing model.
 *
 * It is also where a mock schema is served. Routing them here rather than in the
 * app means an app cannot tell the difference, which is the point: you find out
 * whether the thing you built works before the collector behind it exists. What
 * marks it as mock is the catalogue, and that badge travels with every chip.
 */
const API = process.env.DRYOS_API_URL ?? "http://127.0.0.1:8000";
// High enough for a fanned-out stream — a whole small-entity dataset in one
// query is ~10 series × a week of hourly rows. The backend caps at 50k.
const MAX_LIMIT = 10_000;

export async function POST(req: Request) {
  let body: {
    dataset?: string;
    node?: string | string[];
    start?: string;
    end?: string;
    limit?: number;
    /**
     * Bucket size for a rollup — "15m", "1h", "1d" — and how each bucket is
     * reduced. Absent means raw rows, which is what every existing caller gets.
     *
     * This is what a window longer than a week costs: a quarter of five-minute
     * prices is 25,900 rows per series, past the cap below and past what a
     * chart can draw. Bucketed at an hour it is 2,160 and reads better.
     */
    interval?: string;
    agg?: "avg" | "min" | "max";
    /**
     * Only rows the map can place. For a located stream whose table is
     * partial — PJM's buses, 1,101 placed of 13,967 — a whole-stream query
     * would otherwise spend its limit on rows that draw nothing. The API
     * filters on its own node table; a list of 1,101 names would fan out here
     * into 1,101 requests.
     */
    located?: boolean;
    /** Which screen asked, so a screen can be told what it costs. */
    appId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const dataset = body.dataset ?? "ercot-realtime-lmp";
  const limit = Math.min(body.limit ?? 200, MAX_LIMIT);
  const start = resolveTime(body.start);
  const end = resolveTime(body.end);

  // An array of nodes fans out into one request each, so `limit: 1` means
  // "the newest interval for every node" rather than "one row in total".
  const nodes = Array.isArray(body.node) ? body.node : [body.node];

  if (isMockDataset(dataset)) {
    const rows = mockRows({ dataset, node: body.node, start, end, limit });
    // Counted after the answer has left: the ledger is a Supabase round trip,
    // and a map scrubbing through time waited on it once per frame.
    after(() => record(dataset, rows.length, body.appId));
    return NextResponse.json({ rows, count: rows.length, mock: true });
  }

  /*
    Attach the caller's identity for the backend to meter on — read locally
    from the cookie, no auth-server round trip, because this route is polled by
    every tile on a screen. A token inside a minute of expiry is withheld
    instead of forwarded: the backend refuses stale credentials outright, and
    an anonymous call is still served while auth is optional, so the screen
    keeps drawing either way.
  */
  const supabase = await supabaseServer();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const auth =
    session && (session.expires_at ?? 0) * 1000 - Date.now() > 60_000
      ? { authorization: `Bearer ${session.access_token}` }
      : undefined;

  try {
    const results = await Promise.all(
      nodes.map(async (node) => {
        const url = new URL(`${API}/v1/datasets/${dataset}/query`);
        if (node) url.searchParams.set("node", node);
        if (start) url.searchParams.set("start", start);
        if (end) url.searchParams.set("end", end);
        if (body.interval) url.searchParams.set("interval", body.interval);
        if (body.agg) url.searchParams.set("agg", body.agg);
        if (body.located) url.searchParams.set("located", "true");
        url.searchParams.set("limit", String(limit));

        const res = await fetch(url, { cache: "no-store", headers: auth });
        if (!res.ok) {
          const detail = await res.text();
          throw new Error(
            res.status === 503
              ? `${dataset} has not been collected yet.`
              : `Dryos API ${res.status}: ${detail.slice(0, 160)}`,
          );
        }
        const json = (await res.json()) as { rows: Record<string, unknown>[] };
        return json.rows.map(normaliseRow);
      }),
    );

    const rows = results.flat();
    // Counted after the answer has left: the ledger is a Supabase round trip,
    // and a map scrubbing through time waited on it once per frame.
    after(() => record(dataset, rows.length, body.appId));
    return NextResponse.json({ rows, count: rows.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Query failed." },
      { status: 502 },
    );
  }
}
