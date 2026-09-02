import { NextResponse } from "next/server";
import { editApp } from "@/lib/workspace/agent";
import { annexComponent } from "@/lib/workspace/annex";
import { composeApp, describeComponent } from "@/lib/workspace/compose";
import { compile } from "@/lib/workspace/runtime";
import { ndjsonStream } from "@/lib/workspace/ndjson";
import { addRevision, getApp } from "@/lib/workspace/store";
import {
  DEFAULT_LAYOUT,
  GRID,
  below,
  componentDef,
  packLayout,
  type ComponentKind,
} from "@/lib/workspace/components";
import type { DataRef } from "@/lib/workspace/catalog";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * A change, by whichever route is cheapest.
 *
 * Two paths, and which one runs is decided here rather than by the model:
 *
 *   · A typed component with no message, on an app that is still composed —
 *     regenerate the file from the manifest, compile it, save it. No model call,
 *     no tokens, no waiting, and the result is identical every time.
 *   · Anything else — the agent, seeded with the generated component when there
 *     is one. Modifying working code is a far better prompt than a blank file.
 *
 * The first path is the point. Most of what people ask for after picking data is
 * "chart this", and paying a model to retype the same forty lines is a cost with
 * no upside.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const app = await getApp(id);
  if (!app)
    return NextResponse.json({ error: "No such screen." }, { status: 404 });

  const { intent, refs, component, options, custom, layout, replaceAt, model, effort, group } =
    (await req.json()) as {
      intent?: string;
      refs?: DataRef[];
      component?: ComponentKind;
      options?: Record<string, string>;
      /** A saved component's finished source, used verbatim. */
      custom?: { name: string; code: string };
      /** Size, and the place on the canvas the drop landed on. */
      layout?: { x?: number; y?: number; w: number; h: number };
      /** Reconfigure the tile at this index instead of adding a new one. */
      replaceAt?: number;
      /** The composer's picks — validated in models.ts, not here. */
      model?: string;
      effort?: string;
      /**
       * Several tiles landing together as one drop, stacked top to bottom in
       * list order, wired before they exist: `wireTo` is a group-relative
       * index, resolved to the absolute manifest slot here — the client
       * cannot know where the group will sit.
       */
      group?: {
        component: ComponentKind;
        options?: Record<string, string>;
        custom?: { name: string; code: string };
        refs?: DataRef[];
        layout: { w: number; h: number };
        wireTo?: number;
      }[];
    };

  /* ── A wired group: one drop, one compose, one revision ─────────────── */
  if (group?.length) {
    if (!app.manifest) {
      return NextResponse.json(
        { error: "Wired groups need a composed page — this one was rewritten by the model." },
        { status: 400 },
      );
    }
    for (const m of group) {
      const d = componentDef(m.component);
      if (!d) {
        return NextResponse.json({ error: `No such component: ${m.component}.` }, { status: 400 });
      }
      if (!m.custom) {
        const verdict = d.accepts(m.refs ?? []);
        if (!verdict.ok) {
          return NextResponse.json(
            { error: `${d.name}: ${verdict.why ?? "that will not render."}` },
            { status: 400 },
          );
        }
      }
    }
    return ndjsonStream(async (send) => {
      send({ type: "phase", phase: "composing" });
      const manifest = packLayout(app.manifest!);
      const base = manifest.length;
      const anchor =
        typeof layout?.x === "number" && typeof layout?.y === "number"
          ? { x: layout.x, y: layout.y }
          : { x: 0, y: below(manifest) + (manifest.length ? GRID.gap : 0) };
      let down = 0;
      for (const m of group) {
        const opts = { ...(m.options ?? {}) };
        if (m.wireTo != null && group[m.wireTo]) {
          opts.follow = String(base + m.wireTo);
        }
        manifest.push({
          kind: m.component,
          refs: m.refs ?? [],
          options: opts,
          custom: m.custom,
          layout: {
            x: Math.max(0, Math.min(anchor.x, GRID.cols - m.layout.w)),
            y: anchor.y + down,
            w: m.layout.w,
            h: m.layout.h,
          },
        });
        down += m.layout.h + GRID.gap;
      }
      const source = composeApp(manifest);

      send({ type: "phase", phase: "compiling" });
      const built = await compile(source);
      if (!built.js) {
        send({ type: "failed", message: `The group did not compile: ${built.error}` });
        return;
      }
      const wires = group.filter((m) => m.wireTo != null).length;
      const updated = await addRevision(id, {
        intent: `Added ${group.length} tiles as one${wires ? `, ${wires} wired` : ""}`,
        refs: group.flatMap((m) => m.refs ?? []).length
          ? group.flatMap((m) => m.refs ?? [])
          : undefined,
        manifest,
        source,
        author: "you",
        note: "Built from typed components — no model was used.",
      });
      send({ type: "done", app: updated, composed: true });
    });
  }

  const said = intent?.trim() ?? "";
  const def = component ? componentDef(component) : undefined;

  if (!said && !def) {
    return NextResponse.json(
      { error: "Say what you want changed." },
      { status: 400 },
    );
  }

  const chosen = refs ?? [];
  // A saved component was already validated when it was built, and its source is
  // fixed — re-running the shape's rules against it would refuse a component
  // that demonstrably renders.
  if (def && !custom) {
    const verdict = def.accepts(chosen);
    if (!verdict.ok) {
      return NextResponse.json(
        { error: verdict.why ?? "That will not render." },
        { status: 400 },
      );
    }
  }

  /* ── Deterministic: no message, and the app still knows its own shape ──── */
  if (def && !said && app.manifest) {
    return ndjsonStream(async (send) => {
      send({ type: "phase", phase: "composing" });

      // A tile carries its own place, so the drop arrives knowing where it
      // goes and the manifest order is only paint order — appending is enough.
      // Everyone else is frozen where they already are first, so nothing on the
      // page shifts to make room. With `replaceAt` the new component takes over
      // the tile being reconfigured, keeping its place and its size: that is
      // what makes ⚙ a change to a tile rather than a swap of one.
      const manifest = packLayout(app.manifest!);
      const replacing =
        replaceAt != null && manifest[replaceAt] !== undefined;
      if (replacing) {
        manifest.splice(replaceAt!, 1, {
          kind: def.kind,
          refs: chosen,
          options,
          custom,
          layout: manifest[replaceAt!]?.layout ?? layout ?? DEFAULT_LAYOUT[def.kind],
        });
      } else {
        const size = layout ?? DEFAULT_LAYOUT[def.kind];
        manifest.push({
          kind: def.kind,
          refs: chosen,
          options,
          custom,
          // No place named — the only honest answer is under everything else,
          // which is where a page grows.
          layout:
            typeof size.x === "number" && typeof size.y === "number"
              ? size
              : { ...size, x: 0, y: below(manifest) + (manifest.length ? GRID.gap : 0) },
        });
      }
      const source = composeApp(manifest);

      // Gated exactly like a model's output. A generator can be wrong too, and
      // the rule is the same either way: nothing is saved unless it builds.
      send({ type: "phase", phase: "compiling" });
      const built = await compile(source);
      if (!built.js) {
        send({
          type: "failed",
          message: `The component did not compile: ${built.error}`,
        });
        return;
      }

      const updated = await addRevision(id, {
        intent: replacing
          ? `Reconfigured ${custom ? `“${custom.name}”` : describeComponent(def.kind, chosen)}`
          : custom
            ? `Add the “${custom.name}” component.`
            : describeComponent(def.kind, chosen),
        refs: chosen.length ? chosen : undefined,
        manifest,
        source,
        author: "you",
        note: "Built from a typed component — no model was used.",
      });
      send({ type: "done", app: updated, composed: true });
    });
  }

  /* ── Deterministic still: no message, but the file is not regenerable ──── */
  // A typed drop never reaches a model. Templates and model-edited pages have
  // no manifest to splice into, so the generated tile is annexed beneath the
  // page instead — same compile gate, same refusal on failure, zero tokens.
  if (def && !said) {
    return ndjsonStream(async (send) => {
      send({ type: "phase", phase: "composing" });
      let source: string;
      try {
        source = annexComponent(app.source, {
          kind: def.kind,
          refs: chosen,
          options,
          custom,
          layout: layout ?? DEFAULT_LAYOUT[def.kind],
        });
      } catch (err) {
        send({
          type: "failed",
          message: err instanceof Error ? err.message : "That did not place.",
        });
        return;
      }

      send({ type: "phase", phase: "compiling" });
      const built = await compile(source);
      if (!built.js) {
        send({
          type: "failed",
          message: `The component did not compile: ${built.error}`,
        });
        return;
      }

      const updated = await addRevision(id, {
        intent: custom
          ? `Add the “${custom.name}” component.`
          : describeComponent(def.kind, chosen),
        refs: chosen.length ? chosen : undefined,
        // Deliberately no manifest: the page was not regenerable before the
        // drop and is not after it. The annex extends; it does not adopt.
        source,
        author: "you",
        note: "Placed without a model — appended beneath the page.",
      });
      send({ type: "done", app: updated, composed: false });
    });
  }

  /* ── The agent, for an actual sentence ─────────────────────────────────── */
  return ndjsonStream(async (send) => {
    const seed = def
      ? composeApp([
          {
            kind: def.kind,
            refs: chosen,
            options,
            custom,
            layout: layout ?? DEFAULT_LAYOUT[def.kind],
          },
        ])
      : undefined;

    // The app is not composed, so there is no canvas to place it on — the
    // position becomes a sentence instead, which is the one form the agent can
    // act on, and "above everything" is all a y coordinate survives as.
    const place =
      def && typeof layout?.y === "number"
        ? layout.y === 0
          ? " Put it at the top."
          : " Put it below what is already there."
        : "";

    const request = def
      ? `${custom ? `Add the “${custom.name}” component.` : describeComponent(def.kind, chosen)}${place}${said ? `\n\nThen: ${said}` : ""}`
      : said;

    const result = await editApp({
      source: app.source,
      intent: request,
      refs: chosen,
      seed,
      model,
      effort,
      onEvent: send,
    });

    // Nothing is written unless it built. The app keeps running what it had.
    if (!result.source) {
      send({ type: "failed", message: result.error ?? "The change failed." });
      return;
    }

    const updated = await addRevision(id, {
      intent: request,
      refs: chosen.length ? chosen : undefined,
      // Deliberately absent: the model has rewritten the file and no manifest
      // describes it any more.
      source: result.source,
      author: "you",
      note: result.note,
    });
    send({ type: "done", app: updated });
  });
}
