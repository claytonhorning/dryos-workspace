import { NextResponse } from "next/server";

const API = process.env.DRYOS_API_URL ?? "http://127.0.0.1:8000";

export const dynamic = "force-dynamic";

/**
 * What can I reference? — the entity list behind a stream.
 *
 * A thin proxy over the delivery API's `/nodes`, because the explorer runs in
 * the browser and the backend's address is this server's business, not the
 * page's. Counts and coverage come back real: they are aggregated from the
 * table, not from the catalogue's summary.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const dataset = p.get("dataset");
  if (!dataset || !/^[a-z0-9-]+$/.test(dataset)) {
    return NextResponse.json({ error: "Which dataset?" }, { status: 400 });
  }

  const url = new URL(`${API}/v1/datasets/${dataset}/nodes`);
  const q = p.get("q");
  if (q) url.searchParams.set("q", q);
  const nodeType = p.get("node_type");
  if (nodeType) url.searchParams.set("node_type", nodeType);
  url.searchParams.set("limit", p.get("limit") ?? "12");

  try {
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: json.detail ?? "The catalogue could not answer." },
        { status: res.status },
      );
    }
    return NextResponse.json(json);
  } catch {
    return NextResponse.json(
      { error: "The delivery API is not reachable." },
      { status: 502 },
    );
  }
}
