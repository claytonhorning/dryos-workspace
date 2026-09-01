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
    An empty page is served from today's generator, not the stored text. The
    empty screen is a pure function of nothing — no data, no layout, nothing of
    the user's in it — and nothing ever recomposes a page nobody has touched,
    so a stored empty state would show whatever the generator said the day the
    page was created, forever.
  */
  const source =
    app.manifest && app.manifest.length === 0 ? composeApp([]) : app.source;

  const built = await compile(source);
  const js = built.js ?? errorScript(built.error ?? "Build failed");

  return new Response(js, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
