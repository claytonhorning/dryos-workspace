import { NextResponse } from "next/server";
import { composeApp } from "@/lib/workspace/compose";
import { compile } from "@/lib/workspace/runtime";
import { moveTile, setLayout } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

/**
 * Where a tile ended up after someone dragged its corner.
 *
 * Separate from `/edit` because it is not an edit: no revision and no model.
 * It does keep the compile gate. A rearrangement regenerates the whole file from
 * the manifest, so it is the moment a changed generator gets baked into someone's
 * page — skipping the check here shipped a broken screen exactly once, which was
 * once more than the shortcut was worth.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as {
    index?: number;
    w?: number;
    h?: number;
    x?: number;
    y?: number;
    swap?: { index: number; x: number; y: number } | null;
  };

  // A move: one tile to a place of its own, and at most one other tile trading
  // places with it. Never a third — the canvas does not reflow.
  if (body.index !== undefined && body.x !== undefined && body.y !== undefined) {
    const moved = await moveTile(
      id,
      body.index,
      { x: Math.max(0, Math.round(body.x)), y: Math.max(0, Math.round(body.y)) },
      body.swap
        ? {
            index: body.swap.index,
            x: Math.max(0, Math.round(body.swap.x)),
            y: Math.max(0, Math.round(body.swap.y)),
          }
        : null,
      composeApp,
      compile,
    );
    if (!moved) {
      return NextResponse.json({ error: "That did not build." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  }

  const { index, w, h } = body as { index: number; w: number; h: number };

  const app = await setLayout(
    id,
    index,
    { w: Math.max(2, Math.min(12, Math.round(w))), h: Math.max(120, Math.min(900, Math.round(h))) },
    composeApp,
    compile,
  );
  if (!app) {
    return NextResponse.json({ error: "That did not build." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
