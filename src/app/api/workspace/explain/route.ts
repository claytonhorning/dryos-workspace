import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import type { AskTurn, TileAsk } from "@/lib/workspace/ask";
import { ndjsonStream } from "@/lib/workspace/ndjson";
import { explain } from "@/lib/workspace/pointAgent";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** How much of a screen a click is allowed to carry in. */
const MAX_BODY = 600_000;

/**
 * A question about a point on a tile.
 *
 * The frame packed the context at the click and the popover sends it whole
 * with every turn: the route holds nothing between questions, so a page can
 * be reloaded mid-conversation and a follow-up still knows the tile it is
 * about. The model is spent here, so this asks the auth server rather than
 * trusting the cookie the middleware already read.
 */
export async function POST(req: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Sign in to use the workspace." }, { status: 401 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ error: "That screen is too large to ask about." }, { status: 413 });
  }

  let body: {
    question?: string;
    ask?: TileAsk;
    page?: string;
    tz?: string;
    history?: AskTurn[];
    model?: string;
    effort?: string;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "Ask something about the data." }, { status: 400 });
  }
  const ask = body.ask;
  if (!ask || typeof ask !== "object" || !ask.tile || !Array.isArray(ask.screen)) {
    return NextResponse.json({ error: "Nothing was clicked." }, { status: 400 });
  }

  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string")
    // The last dozen turns; a popover conversation is short, and the context
    // ahead of it is the part that matters.
    .slice(-12);

  return ndjsonStream((send) =>
    explain(
      {
        ask,
        page: typeof body.page === "string" && body.page ? body.page : "Untitled page",
        tz: typeof body.tz === "string" && body.tz ? body.tz : "source",
        history,
        question,
        model: body.model,
        effort: body.effort,
      },
      send,
    ),
  );
}
