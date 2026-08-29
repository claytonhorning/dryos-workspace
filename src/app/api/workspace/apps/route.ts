import { NextResponse } from "next/server";
import { createApp, getApp, listApps } from "@/lib/workspace/store";
import { BLANK, TEMPLATES, templateSource } from "@/lib/workspace/templates";
import { addPage } from "@/lib/workspace/spaces";

export async function GET() {
  return NextResponse.json({ apps: await listApps(), templates: TEMPLATES });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    template?: string;
    forkOf?: string;
    name?: string;
    /** File it into this workspace on the way out. */
    space?: string;
  };

  // Forking copies the source but not the history: the fork's own history
  // starts here, and the parent's revisions stay pullable rather than inherited.
  if (body.forkOf) {
    const parent = await getApp(body.forkOf);
    if (!parent) return NextResponse.json({ error: "No such screen." }, { status: 404 });
    const app = await createApp({
      name: body.name ?? `${parent.name} (copy)`,
      template: parent.template,
      source: parent.source,
      // A fork of a composed app is still composed, so it keeps the free path.
      manifest: parent.manifest,
      forkedFrom: parent,
    });
    if (body.space) await addPage(body.space, app.id);
    return NextResponse.json({ app });
  }

  const slug = body.template ?? TEMPLATES[0].slug;
  const source = await templateSource(slug);
  if (!source) return NextResponse.json({ error: "No such template." }, { status: 404 });

  const template = slug === BLANK.slug ? BLANK : TEMPLATES.find((t) => t.slug === slug)!;
  const app = await createApp({
    name: body.name ?? template.name,
    template: slug,
    source,
    manifest: template.composed ? [] : undefined,
  });
  if (body.space) await addPage(body.space, app.id);
  return NextResponse.json({ app });
}
