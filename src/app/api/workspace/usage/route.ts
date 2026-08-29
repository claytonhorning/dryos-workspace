import { NextResponse } from "next/server";
import { usage } from "@/lib/workspace/meter";
import { getSpace } from "@/lib/workspace/spaces";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // `?app=` narrows to one page, `?space=` to every page in a workspace, and
  // neither to everything this machine has served.
  const params = new URL(req.url).searchParams;
  const app = params.get("app");
  const spaceId = params.get("space");

  if (app) return NextResponse.json(await usage([app]));
  if (spaceId) {
    const space = await getSpace(spaceId);
    return NextResponse.json(await usage(space?.pages ?? []));
  }
  return NextResponse.json(await usage());
}
