import { NextResponse } from "next/server";
import { composeApp, describeComponent } from "@/lib/workspace/compose";
import { compile } from "@/lib/workspace/runtime";
import { getApp, removeTile } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

/**
 * Take one tile off the page.
 *
 * Recorded as a revision — removal is a change, and revert is its undo — and
 * gated by the same compile step as everything else: the file is regenerated
 * whole, so this is exactly the moment a changed generator would get baked in.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { index } = (await req.json()) as { index?: number };
  if (typeof index !== "number") {
    return NextResponse.json({ error: "Which tile?" }, { status: 400 });
  }

  const app = await getApp(id);
  if (!app) return NextResponse.json({ error: "No such screen." }, { status: 404 });
  const spec = app.manifest?.[index];
  if (!spec) {
    return NextResponse.json(
      {
        error: app.manifest
          ? "That tile is not on the page."
          : "This page was edited by the model, so tiles cannot be removed one " +
            "at a time — revert past the change instead.",
      },
      { status: 400 },
    );
  }

  const what =
    spec.custom?.name ?? describeComponent(spec.kind, spec.refs ?? []);
  const updated = await removeTile(id, index, `Removed ${what}`, composeApp, compile);
  if (!updated) {
    return NextResponse.json(
      { error: "The page did not compile without it; nothing was changed." },
      { status: 500 },
    );
  }
  return NextResponse.json({ app: updated });
}
