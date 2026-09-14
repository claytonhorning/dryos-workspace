import { NextResponse } from "next/server";
import { domains } from "@/lib/workspace/catalog";
import { ALL_DOMAINS, createSpace, listSpaces, sharedPages } from "@/lib/workspace/spaces";
import { listApps } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

/** Every workspace, with its pages resolved enough to render tabs and tiles. */
export async function GET() {
  const [spaces, apps] = await Promise.all([listSpaces(), listApps()]);
  const byId = new Map(apps.map((a) => [a.id, a]));

  return NextResponse.json({
    spaces: spaces.map((s) => ({
      ...s,
      pageList: s.pages.map((id) => byId.get(id)).filter(Boolean),
      // Pages another workspace also lists — deleting this one keeps them.
      shared: sharedPages(s, spaces),
    })),
  });
}

export async function POST(req: Request) {
  const { name, domain } = (await req.json().catch(() => ({}))) as {
    name?: string;
    domain?: string;
  };
  // Only a subject the catalogue serves, or the blend. Anything else — a
  // domain declared as "next", a typo — is stored as no choice at all.
  const subject =
    domain === ALL_DOMAINS || (domain && domains().includes(domain)) ? domain : undefined;
  return NextResponse.json({ space: await createSpace(name ?? "", subject) });
}
