import { getAppForFrame } from "@/lib/workspace/store";
import { buildDocument } from "@/lib/workspace/runtime";

/**
 * The document the sandbox frame loads.
 *
 * Served from our own origin but framed with `sandbox="allow-scripts"` and no
 * `allow-same-origin`, so the app runs in an opaque origin: it can execute, it
 * can talk to the host by postMessage, and it can do nothing else.
 *
 * The revision is a path segment rather than a query string, so every saved
 * change has its own address. That is what makes the frame reload after an edit
 * — the src genuinely changed — and it leaves the response cacheable per
 * revision rather than permanently uncacheable.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; v: string }> },
) {
  const { id, v } = await params;
  // Cookie-less by construction — see getAppForFrame.
  const app = await getAppForFrame(id);
  if (!app) return new Response("Not found", { status: 404 });

  // `?preview=1` swaps in the self-serving shim: the frame generates its own
  // rows instead of asking a host that a thumbnail does not have. See
  // `PREVIEW_SHIM` for why, and what it costs (nothing, which is the point).
  const preview = new URL(req.url).searchParams.get("preview") === "1";

  return new Response(
    buildDocument(`/api/workspace/apps/${id}/script/${v}`, { preview }),
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}
