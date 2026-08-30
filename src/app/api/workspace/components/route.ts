import { NextResponse } from "next/server";
import { deleteSaved, listSaved, saveComponent } from "@/lib/workspace/library";
import { communityComponents } from "@/lib/workspace/community";
import type { ComponentSpec } from "@/lib/workspace/components";

export const dynamic = "force-dynamic";

/**
 * The two shelves that are not the base shapes: what you saved, and what was
 * published. They travel together because the build panel lists them together,
 * and separating them into two round trips would only make the shelf arrive in
 * two pieces.
 */
export async function GET() {
  return NextResponse.json({
    components: await listSaved(),
    community: communityComponents(),
  });
}

export async function POST(req: Request) {
  const { spec, name } = (await req.json()) as { spec: ComponentSpec; name?: string };
  if (!spec?.kind) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  return NextResponse.json({
    component: await saveComponent(spec, name?.trim() || spec.kind),
  });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Which one?" }, { status: 400 });
  return NextResponse.json({ ok: await deleteSaved(id) });
}
