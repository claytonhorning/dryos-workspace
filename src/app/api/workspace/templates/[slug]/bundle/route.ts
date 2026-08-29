import { buildDocument } from "@/lib/workspace/runtime";
import { templateSource } from "@/lib/workspace/templates";

/**
 * A template, running, before anyone has started from it.
 *
 * The same sandboxed document an app gets, so the tile on the shelf shows what
 * you would actually be handed rather than a blurb describing it. No revision in
 * the path because a template has none — it changes when the file on disk does,
 * which is a deploy, not a save.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await templateSource(slug))) return new Response("Not found", { status: 404 });

  const preview = new URL(req.url).searchParams.get("preview") === "1";

  return new Response(buildDocument(`/api/workspace/templates/${slug}/script`, { preview }), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
