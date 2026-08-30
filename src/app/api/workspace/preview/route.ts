import { buildDocument } from "@/lib/workspace/runtime";

export const dynamic = "force-dynamic";

/**
 * One component, on its own, running.
 *
 * The component editor needs to show what it is about to add before it is
 * added — and the only honest way to do that is to compile and run the same
 * source the dashboard would receive. So the spec travels in the URL, gets
 * composed into a one-tile app, and is served through the ordinary sandbox.
 *
 * It reads live data through the host like any other frame, because a preview
 * that quietly showed sample rows would be answering a different question than
 * the one being asked.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const spec = params.get("spec") ?? "";
  // `preview=1` for a tile on a shelf, which has no host to answer its queries
  // and should not bill one anyway. The editor omits it and gets live data.
  const preview = params.get("preview") === "1";
  const bare = params.get("bare") === "1";

  return new Response(
    buildDocument(`/api/workspace/preview/script?spec=${encodeURIComponent(spec)}`, { preview, bare }),
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
