import { NextResponse } from "next/server";

/** Every entity in a dataset, with coverage — the "what can I reference?" list. */
const API = process.env.DRYOS_API_URL ?? "http://127.0.0.1:8000";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const slug = params.get("dataset") ?? "ercot-realtime-lmp";

  const url = new URL(`${API}/v1/datasets/${slug}/nodes`);
  const q = params.get("q");
  const type = params.get("type");
  if (q) url.searchParams.set("q", q);
  if (type) url.searchParams.set("node_type", type);
  url.searchParams.set("limit", params.get("limit") ?? "200");

  try {
    const res = await fetch(url, { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: body.detail ?? `Dryos API ${res.status}` },
        { status: res.status },
      );
    }
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Node list unavailable." },
      { status: 502 },
    );
  }
}
