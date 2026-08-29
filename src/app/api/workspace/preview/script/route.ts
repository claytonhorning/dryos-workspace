import { composeApp } from "@/lib/workspace/compose";
import { compile, errorScript } from "@/lib/workspace/runtime";
import type { ComponentSpec } from "@/lib/workspace/components";

export const dynamic = "force-dynamic";

/** The compiled one-tile app behind `/api/workspace/preview`. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("spec");
  if (!raw) return new Response("// no spec", { status: 400 });

  let spec: ComponentSpec;
  try {
    spec = JSON.parse(raw) as ComponentSpec;
  } catch {
    return new Response("// malformed spec", { status: 400 });
  }

  const built = await compile(composeApp([spec]));
  const js = built.js ?? errorScript(built.error ?? "Build failed");

  return new Response(js, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
  });
}
