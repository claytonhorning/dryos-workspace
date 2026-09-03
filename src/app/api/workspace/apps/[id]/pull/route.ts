import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { editApp } from "@/lib/workspace/agent";
import { ndjsonStream } from "@/lib/workspace/ndjson";
import { addRevision, getApp } from "@/lib/workspace/store";

// 300 is the Hobby plan's ceiling, and a deploy declaring more is refused
// after the build has already succeeded. Replaying many changes could want
// longer; if it ever does, the answer is a queue, not a bigger number.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Take someone else's change without taking their app.
 *
 * This is the part that would be a merge conflict if apps were versioned as
 * code. They are not — every revision carries the instruction that produced it,
 * so pulling means replaying that instruction against whatever your copy looks
 * like now. Two apps that diverged weeks ago can still exchange a single
 * change, and what the user picks from is a list of sentences rather than a
 * diff.
 *
 * The data attached to a revision travels with it, so a change that referenced
 * a mock weather schema arrives referencing the same one — and is re-expanded
 * against today's catalogue rather than replaying yesterday's query text.
 *
 * Each replay is gated the same way an ordinary edit is: it has to compile, or
 * it is skipped and the rest still apply. Streamed, because replaying several
 * changes is minutes of work and the dialog has to show whose turn it is.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Sign in to use the workspace." }, { status: 401 });
  }
  const { id } = await params;
  const mine = await getApp(id);
  if (!mine) return NextResponse.json({ error: "No such screen." }, { status: 404 });

  const { fromAppId, revisionIds } = (await req.json()) as {
    fromAppId: string;
    revisionIds: string[];
  };

  const theirs = await getApp(fromAppId);
  if (!theirs) return NextResponse.json({ error: "No such source screen." }, { status: 404 });

  // Oldest first, so a sequence of changes replays in the order it was made.
  const chosen = theirs.history
    .filter((r) => revisionIds.includes(r.id))
    .sort((a, b) => a.at - b.at);

  return ndjsonStream(async (send) => {
    let source = mine.source;
    const applied: string[] = [];
    const skipped: { intent: string; reason: string }[] = [];

    for (const [i, rev] of chosen.entries()) {
      send({ type: "revision", index: i + 1, total: chosen.length, intent: rev.intent });

      const result = await editApp({
        source,
        intent: rev.intent,
        refs: rev.refs,
        onEvent: send,
      });
      if (!result.source) {
        const reason = result.error ?? "did not apply";
        skipped.push({ intent: rev.intent, reason });
        send({ type: "skipped", intent: rev.intent, reason });
        continue;
      }

      source = result.source;
      await addRevision(id, {
        intent: rev.intent,
        refs: rev.refs,
        source,
        author: "you",
        note: result.note,
        pulledFrom: { appId: theirs.id, appName: theirs.name, revisionId: rev.id },
      });
      applied.push(rev.intent);
      send({ type: "applied", intent: rev.intent });
    }

    send({ type: "done", app: await getApp(id), applied, skipped });
  });
}
