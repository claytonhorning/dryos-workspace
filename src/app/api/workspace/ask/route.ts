import { NextResponse } from "next/server";
import { ask } from "@/lib/workspace/dataAgent";
import { ndjsonStream } from "@/lib/workspace/ndjson";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { question } = (await req.json()) as { question?: string };
  if (!question?.trim()) {
    return NextResponse.json({ error: "Ask something about the data." }, { status: 400 });
  }
  return ndjsonStream((send) => ask(question.trim(), send));
}
