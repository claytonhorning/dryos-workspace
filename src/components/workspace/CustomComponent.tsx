"use client";

import { useEffect, useState } from "react";
import { Button, cx } from "@/components/ui";
import {
  COMPONENTS,
  componentDef,
  type ComponentDef,
  type ComponentSpec,
} from "@/lib/workspace/components";
import type { DataRef } from "@/lib/workspace/catalog";
import type { PublishedComponent } from "@/lib/workspace/community";
import type { EditorStart } from "./BuildPanel";

/**
 * The thing no shape covers, asked for in a sentence — against whichever
 * component the sentence is about.
 *
 * It sits **under the screen**, not at the bottom of the panel. Everything in
 * the panel is a choice about one component; this is a request about the
 * dashboard in front of you, and it reads as one when it is beneath the
 * dashboard rather than at the end of a column of cards.
 *
 * **What it starts from is chosen, not guessed.** It used to pick a base shape
 * from the size of the selection — one series a ticker, anything else a chart —
 * which is fine for "a gauge that turns amber above $50" and useless for
 * "make the left-hand chart log scale", because the thing being described was
 * already on the page. So the starting point is a picker over everything that
 * counts as a component here: the tiles on this screen, the base shapes, what
 * you have saved, and what the community published. A tile brings its own data
 * and its own refined source and the change goes **back into its slot**;
 * everything else opens as something new.
 *
 * Either way the sentence is not answered here — it opens `ComponentEditor`
 * with the request already running, because a change nobody has seen yet is not
 * something to write straight onto a dashboard.
 */

/** Where a request starts from, encoded for one `<select>`. */
type Pick = `tile:${number}` | `base:${string}` | `saved:${string}` | `community:${string}`;

interface Saved extends ComponentSpec {
  id: string;
  name: string;
}

export function CustomComponent({
  refs,
  manifest,
  reloadKey,
  onOpen,
}: {
  refs: DataRef[];
  /**
   * The tiles on this screen, when it still has a manifest. A model-edited page
   * has none — nothing can reconstruct one from rewritten source — so its tiles
   * simply do not appear as starting points.
   */
  manifest?: ComponentSpec[];
  reloadKey: number;
  /**
   * Open the editor on the chosen starting point. `replaceAt` is the tile the
   * result belongs in, and only a tile has one.
   */
  onOpen: (start: EditorStart, replaceAt?: number) => void;
}) {
  const [ask, setAsk] = useState("");
  const [pick, setPick] = useState<Pick | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [community, setCommunity] = useState<PublishedComponent[]>([]);

  useEffect(() => {
    fetch("/api/workspace/components")
      .then((r) => r.json())
      .then((d) => {
        setSaved(d.components ?? []);
        setCommunity(d.community ?? []);
      })
      .catch(() => {});
  }, [reloadKey]);

  /*
    Nothing picked yet still has an answer: the shape the selection fits — one
    series is a ticker, anything else a chart. It is the shown value rather than
    a stored one, so it follows the selection until somebody chooses for
    themselves, and then stops.
  */
  const fallback =
    COMPONENTS.find((c) => c.kind === (refs.length === 1 ? "ticker" : "chart")) ??
    COMPONENTS[0];
  const value: Pick = pick ?? `base:${fallback.kind}`;

  const tiles = manifest ?? [];

  /** What the picked starting point is, or why it cannot be used. */
  function resolve(): { start: EditorStart; at?: number } | { why: string } {
    const [group, key] = value.split(":");

    if (group === "tile") {
      const at = Number(key);
      const spec = tiles[at];
      const def = spec ? componentDef(spec.kind) : undefined;
      if (!spec || !def) return { why: "That tile is no longer on the screen." };
      return {
        at,
        start: {
          def,
          refs: spec.refs ?? [],
          options: spec.options,
          custom: spec.custom,
          name: spec.custom?.name,
        },
      };
    }

    if (group === "saved" || group === "community") {
      const c =
        group === "saved"
          ? saved.find((s) => s.id === key)
          : community.find((s) => s.id === key);
      const def = c ? componentDef(c.kind) : undefined;
      if (!c || !def) return { why: "That component is no longer available." };
      return {
        start: {
          def,
          refs: c.refs,
          options: c.options,
          custom: c.custom ?? undefined,
          name: c.name,
        },
      };
    }

    const def = componentDef(key as ComponentDef["kind"]);
    if (!def) return { why: "Pick something to build from." };
    // A base shape has no data of its own, so it is the explorer's selection or
    // nothing — and the shape has to be able to draw it.
    if (refs.length === 0) return { why: "Select data to build against." };
    const verdict = def.accepts(refs);
    if (!verdict.ok) return { why: verdict.why! };
    return { start: { def, refs } };
  }

  const resolved = resolve();
  const blocked = "why" in resolved ? resolved.why : null;
  /** A tile is being changed, not created — the words for it are different. */
  const changing = value.startsWith("tile:");

  function submit() {
    if (!ask.trim() || "why" in resolved) return;
    onOpen({ ...resolved.start, ask: ask.trim() }, resolved.at);
    setAsk("");
  }

  return (
    <div className="flex h-full items-stretch gap-2 rounded-lg border border-line bg-surface px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex shrink-0 items-center gap-2">
          <span className="shrink-0 font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
            {changing ? "Change" : "Custom component"}
          </span>

          {/*
            One control over four kinds of thing, because from here they are the
            same kind of thing: what the sentence is about. Tiles come first —
            a request about something already on screen is the common one, and
            it is the one the old guess could not express at all.
          */}
          <select
            value={value}
            onChange={(e) => setPick(e.target.value as Pick)}
            title="What this request is about"
            className="min-w-0 max-w-[240px] shrink rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink outline-none focus:border-line-strong"
          >
            {tiles.length > 0 && (
              <optgroup label="On this screen">
                {tiles.map((t, i) => {
                  const def = componentDef(t.kind);
                  return (
                    <option key={i} value={`tile:${i}`}>
                      {i + 1}. {t.custom?.name ?? def?.name ?? t.kind}
                    </option>
                  );
                })}
              </optgroup>
            )}

            <optgroup label="New component">
              {COMPONENTS.map((c) => {
                const verdict = c.accepts(refs);
                return (
                  <option key={c.kind} value={`base:${c.kind}`}>
                    {c.name}
                    {refs.length > 0 && !verdict.ok ? " — not for this data" : ""}
                  </option>
                );
              })}
            </optgroup>

            {saved.length > 0 && (
              <optgroup label="Your components">
                {saved.map((c) => (
                  <option key={c.id} value={`saved:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}

            {community.length > 0 && (
              <optgroup label="Community">
                {community.map((c) => (
                  <option key={c.id} value={`community:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          {/* The reason it cannot go, where the hint would otherwise be. */}
          <span
            className={cx(
              "ml-auto min-w-0 truncate font-mono text-[9.5px]",
              blocked ? "text-warn" : "text-faint",
            )}
          >
            {blocked ?? "↵ to send · preview before it lands"}
          </span>
        </div>

        <textarea
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={Boolean(blocked)}
          placeholder={
            blocked
              ? "Select data to build against…"
              : changing
                ? "Make the axis start at zero…"
                : "A gauge that turns amber above $50…"
          }
          // Fills the bar rather than declaring rows: the bar's height is the
          // one the explorer's selection bar has, so the box grows into it.
          className="min-h-0 w-full flex-1 resize-none rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-line-strong disabled:opacity-50"
        />
      </div>

      <div className="flex shrink-0 items-end">
        <Button
          tone="primary"
          size="sm"
          disabled={!ask.trim() || Boolean(blocked)}
          onClick={submit}
        >
          {changing ? "Change with AI" : "Create with AI"}
        </Button>
      </div>
    </div>
  );
}
