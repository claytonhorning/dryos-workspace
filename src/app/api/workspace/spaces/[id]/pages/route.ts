import { NextResponse } from "next/server";
import { addPage, getSpace, removePage, reorderPages } from "@/lib/workspace/spaces";
import { createApp, getApp } from "@/lib/workspace/store";
import { BLANK, TEMPLATES, templateSource } from "@/lib/workspace/templates";

export const dynamic = "force-dynamic";

/**
 * A new page in this workspace.
 *
 * Creating and filing happen together on purpose. Two calls would mean a window
 * where a page exists and belongs nowhere, and the only thing that could rescue
 * it is the orphan sweep — which is a safety net, not a workflow.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const space = await getSpace(id);
  if (!space) return NextResponse.json({ error: "No such workspace." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    template?: string;
    name?: string;
    at?: number;
  };

  const slug = body.template ?? BLANK.slug;
  const source = await templateSource(slug);
  if (!source) return NextResponse.json({ error: "No such template." }, { status: 404 });

  const template = slug === BLANK.slug ? BLANK : TEMPLATES.find((t) => t.slug === slug)!;
  const app = await createApp({
    name: body.name ?? `${template.name}`,
    template: slug,
    source,
    manifest: template.composed ? [] : undefined,
  });

  await addPage(id, app.id, body.at);
  return NextResponse.json({ page: app });
}

/** Rearrange the tabs. Order is the only thing a workspace owns about its pages. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { order } = (await req.json()) as { order?: string[] };
  if (!Array.isArray(order)) {
    return NextResponse.json({ error: "Send an order." }, { status: 400 });
  }
  const space = await reorderPages(id, order);
  if (!space) return NextResponse.json({ error: "No such workspace." }, { status: 404 });
  return NextResponse.json({ space });
}

/** Take a page out of the workspace. The page itself is left alone. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pageId = new URL(req.url).searchParams.get("page");
  if (!pageId) return NextResponse.json({ error: "Which page?" }, { status: 400 });
  if (!(await getApp(pageId))) {
    return NextResponse.json({ error: "No such page." }, { status: 404 });
  }
  const space = await removePage(id, pageId);
  if (!space) return NextResponse.json({ error: "No such workspace." }, { status: 404 });
  return NextResponse.json({ space });
}
