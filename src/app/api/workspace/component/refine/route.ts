import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { refineComponent } from "@/lib/workspace/agent";
import { composeApp } from "@/lib/workspace/compose";
import { ndjsonStream } from "@/lib/workspace/ndjson";
import {
  componentDef,
  withDefaults,
  type ComponentKind,
  type ComponentSpec,
} from "@/lib/workspace/components";
import type { DataRef } from "@/lib/workspace/catalog";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Change one component with a sentence.
 *
 * The starting point is whatever the editor is currently showing — the generated
 * source, or the last refinement of it — so successive asks build on each other
 * rather than each starting from the template again.
 */
export async function POST(req: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Sign in to use the workspace." }, { status: 401 });
  }

  const { kind, refs, options, code, ask } = (await req.json()) as {
    kind: ComponentKind;
    refs: DataRef[];
    options?: Record<string, string>;
    code?: string | null;
    ask?: string;
  };

  if (!ask?.trim()) {
    return NextResponse.json({ error: "Say what you want changed." }, { status: 400 });
  }

  const def = componentDef(kind);
  if (!def) return NextResponse.json({ error: "No such component." }, { status: 404 });

  const verdict = def.accepts(refs ?? []);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.why ?? "That will not render." }, { status: 400 });
  }

  const start = code ?? def.emit(refs, 0, withDefaults(def, options)).code;

  return ndjsonStream(async (send) => {
    const result = await refineComponent({
      code: start,
      ask: ask.trim(),
      // Compiled as a one-tile app: a bare function is not something esbuild
      // can check, and this is the exact shape the dashboard will build too.
      compileWith: (section) =>
        composeApp([
          { kind, refs, options, custom: { name: def.name, code: section } } as ComponentSpec,
        ]),
      onEvent: send,
    });

    if (!result.code) {
      send({ type: "failed", message: result.error ?? "That did not work." });
      return;
    }
    send({ type: "done", code: result.code, note: result.note });
  });
}
