import { getApp } from "@/lib/workspace/store";
import { compile, errorScript } from "@/lib/workspace/runtime";

/** The compiled app, as its own script so nothing has to be escaped into HTML. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await getApp(id);
  if (!app) return new Response("// no such app", { status: 404 });

  const built = await compile(app.source);
  const js = built.js ?? errorScript(built.error ?? "Build failed");

  return new Response(js, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
  });
}
