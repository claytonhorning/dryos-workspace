import { compile, errorScript } from "@/lib/workspace/runtime";
import { templateSource } from "@/lib/workspace/templates";

/** The compiled template, as its own script so nothing has to be escaped into HTML. */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const source = await templateSource(slug);
  if (!source) return new Response("// no such template", { status: 404 });

  const built = await compile(source);
  const js = built.js ?? errorScript(built.error ?? "Build failed");

  return new Response(js, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
  });
}
