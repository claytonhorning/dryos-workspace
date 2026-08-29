import { NextResponse } from "next/server";

/**
 * What the workspace knows about a dataset, straight from the Dryos API.
 *
 * Proxied rather than fetched in the browser so the explorer and the running
 * apps travel the same path to the same service — if this returns something,
 * an app asking the same question gets the same answer.
 */
const API = process.env.DRYOS_API_URL ?? "http://127.0.0.1:8000";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("dataset") ?? "ercot-realtime-lmp";
  try {
    const res = await fetch(`${API}/v1/datasets/${slug}`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Dryos API ${res.status}` },
        { status: res.status },
      );
    }
    return NextResponse.json({ ...(await res.json()), endpoint: `${API}/v1/datasets/${slug}` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Catalogue unavailable." },
      { status: 502 },
    );
  }
}
