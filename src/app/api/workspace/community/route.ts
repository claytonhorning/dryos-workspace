import { NextResponse } from "next/server";
import { listCommunitySpaces } from "@/lib/workspace/communitySpaces";

export const dynamic = "force-dynamic";

/** The Community tab of the shelf: every workspace Dryos has published. */
export async function GET() {
  try {
    return NextResponse.json({ spaces: await listCommunitySpaces() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
