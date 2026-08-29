import { NextResponse } from "next/server";
import { deleteApp, getApp, renameApp } from "@/lib/workspace/store";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await getApp(id);
  if (!app) return NextResponse.json({ error: "No such screen." }, { status: 404 });
  return NextResponse.json({ app });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name } = (await req.json()) as { name: string };
  const app = await renameApp(id, name);
  if (!app) return NextResponse.json({ error: "No such screen." }, { status: 404 });
  return NextResponse.json({ app });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ deleted: await deleteApp(id) });
}
