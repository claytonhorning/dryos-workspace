import { composeApp } from "@/lib/workspace/compose";
import { getAppForFrame } from "@/lib/workspace/store";
import { compile, errorScript } from "@/lib/workspace/runtime";

/** The compiled app, as its own script so nothing has to be escaped into HTML. */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Cookie-less by construction — see getAppForFrame.
  const app = await getAppForFrame(id);
  if (!app) return new Response("// no such app", { status: 404 });

  /*
    A composed page is served from today's generator, not the stored text.

    The manifest is the truth and the file is derived from it, so deriving it
    here rather than reading back the derivation from the day of the last
    write is the same file on the day it was written and a better one after —
    a change to the shared runtime (the tile chrome, the ask gesture, the
    drag mechanics) reaches every page on its next load instead of waiting
    for somebody to nudge a tile. Nothing ever recomposes a page nobody has
    touched; this is the only place that could. The stored source stays the
    record — history, revert and pull read it — and is what a model-edited
    page (no manifest) still runs.

    Behind the same gate as everything else: a fresh compose that does not
    build is a changed generator with a bug, and the page keeps running what
    it had rather than showing the error.
  */
  const stored = app.source;
  const fresh = app.manifest ? composeApp(app.manifest) : null;

  let built = fresh === null || fresh === stored ? await compile(stored) : await compile(fresh);
  if (!built.js && fresh !== null && fresh !== stored) built = await compile(stored);
  const js = built.js ?? errorScript(built.error ?? "Build failed");

  return new Response(js, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
