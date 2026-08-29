import { NextResponse } from "next/server";
import { revertTo } from "@/lib/workspace/store";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { revisionId } = (await req.json()) as { revisionId: string };
  const app = await revertTo(id, revisionId);
  if (!app) return NextResponse.json({ error: "No such revision." }, { status: 404 });
  return NextResponse.json({ app });
}
