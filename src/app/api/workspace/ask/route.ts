import { NextResponse } from "next/server";
import { ask } from "@/lib/workspace/dataAgent";
import { ndjsonStream } from "@/lib/workspace/ndjson";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { question, model, effort } = (await req.json()) as {
    question?: string;
    model?: string;
    effort?: string;
  };
  if (!question?.trim()) {
    return NextResponse.json({ error: "Ask something about the data." }, { status: 400 });
  }
  // Validated inside `ask` against the roster in models.ts — an unknown model
  // falls back to the default rather than reaching the API.
  return ndjsonStream((send) => ask(question.trim(), send, { model, effort }));
}
