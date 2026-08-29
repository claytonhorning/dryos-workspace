import { NextResponse } from "next/server";
import { createSpace, listSpaces } from "@/lib/workspace/spaces";
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
    })),
  });
}

export async function POST(req: Request) {
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  return NextResponse.json({ space: await createSpace(name ?? "") });
}
