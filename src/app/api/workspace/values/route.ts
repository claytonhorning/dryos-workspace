import { NextResponse } from "next/server";

const API = process.env.DRYOS_API_URL ?? "http://127.0.0.1:8000";

export const dynamic = "force-dynamic";

/**
 * What a column holds — the values an event stream's filter chips offer.
 *
 * A thin proxy over the delivery API's `/values`, for the same reason
 * `entities` is one: the explorer runs in the browser and the backend's address
 * is this server's business. The chips are the data's own values with their
 * counts, never a list written down here that the city would drift away from.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const dataset = p.get("dataset");
  const column = p.get("column");
  if (!dataset || !/^[a-z0-9-]+$/.test(dataset)) {
    return NextResponse.json({ error: "Which dataset?" }, { status: 400 });
  }
  if (!column || !/^[a-z0-9_]+$/.test(column)) {
    return NextResponse.json({ error: "Which column?" }, { status: 400 });
  }

  const url = new URL(`${API}/v1/datasets/${dataset}/values`);
  url.searchParams.set("column", column);
  url.searchParams.set("limit", p.get("limit") ?? "40");
  // The other filters already picked, so a chip's count is what it would
  // add within them — HVAC picked, the Job row counts HVAC's jobs.
  for (const w of p.getAll("where")) url.searchParams.append("where", w);
  const search = p.get("search");
  if (search) url.searchParams.set("search", search);

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
