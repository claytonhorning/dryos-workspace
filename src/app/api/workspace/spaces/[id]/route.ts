import { NextResponse } from "next/server";
import { deleteSpace, listSpaces, renameSpace, sharedPages } from "@/lib/workspace/spaces";
import { listApps } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const spaces = await listSpaces();
  const space = spaces.find((s) => s.id === id);
  if (!space) return NextResponse.json({ error: "No such workspace." }, { status: 404 });

  const apps = await listApps();
  const byId = new Map(apps.map((a) => [a.id, a]));
  return NextResponse.json({
    space: {
      ...space,
      pageList: space.pages.map((p) => byId.get(p)).filter(Boolean),
      // Pages another workspace also lists — deleting this one keeps them.
      shared: sharedPages(space, spaces),
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name } = (await req.json()) as { name?: string };
  const space = await renameSpace(id, name ?? "");
  if (!space) return NextResponse.json({ error: "No such workspace." }, { status: 404 });
  return NextResponse.json({ space });
}

/** Takes the workspace's pages with it — see `deleteSpace`. */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await deleteSpace(id);
  if (!result) return NextResponse.json({ error: "No such workspace." }, { status: 404 });
  return NextResponse.json({ ok: true, ...result });
}
