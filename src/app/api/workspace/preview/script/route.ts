import { composeApp } from "@/lib/workspace/compose";
import { compile, errorScript } from "@/lib/workspace/runtime";
import { communityComponent } from "@/lib/workspace/community";
import { getSaved } from "@/lib/workspace/library";
import type { ComponentSpec } from "@/lib/workspace/components";

export const dynamic = "force-dynamic";

/**
 * The spec this preview is of.
 *
 * A base shape travels whole in `spec` — it is a kind, a handful of references
 * and some settings, and inlining it keeps the frame's address a pure function
 * of what is on screen. A saved or published component is fetched by id
 * instead: a refined one carries its finished source, and a few kilobytes of
 * TSX in a URL is a request line nothing is obliged to accept.
 */
async function specFrom(params: URLSearchParams): Promise<ComponentSpec | null> {
  const id = params.get("component");
  const slug = params.get("community");
  let spec: ComponentSpec | null = null;

  if (id) spec = await getSaved(id);
  else if (slug) spec = communityComponent(slug) ?? null;
  else {
    const raw = params.get("spec");
    if (!raw) return null;
    try {
      spec = JSON.parse(raw) as ComponentSpec;
    } catch {
      return null;
    }
  }
  if (!spec) return null;

  // Settings and footprint are the caller's to say: the panel re-tunes a saved
  // component's selects without saving, and the inline preview runs it at the
  // full width of the box rather than at the size it will land on the page.
  const options = params.get("options");
  if (options) {
    try {
      spec = { ...spec, options: JSON.parse(options) as Record<string, string> };
    } catch {
      // A malformed override is not worth failing the preview over; the
      // component's own settings are a perfectly good answer.
    }
  }
  const w = Number(params.get("w"));
  const h = Number(params.get("h"));
  if (w > 0 && h > 0) spec = { ...spec, layout: { w, h } };

  return spec;
}

/** The compiled one-tile app behind `/api/workspace/preview`. */
export async function GET(req: Request) {
  const spec = await specFrom(new URL(req.url).searchParams);
  if (!spec?.kind) return new Response("// no spec", { status: 400 });

  const built = await compile(composeApp([spec]));
  const js = built.js ?? errorScript(built.error ?? "Build failed");

  return new Response(js, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
  });
}
