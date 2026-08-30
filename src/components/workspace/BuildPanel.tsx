"use client";

import { useEffect, useState } from "react";
import { Button, cx } from "@/components/ui";
import {
  COMPONENTS,
  DEFAULT_LAYOUT,
  type ComponentDef,
  type ComponentKind,
  type ComponentSpec,
  withDefaults,
} from "@/lib/workspace/components";
import { type DataRef } from "@/lib/workspace/catalog";
import { usePreviewHost } from "@/lib/workspace/usePreviewHost";

/**
 * Two ways to make something, split by whether a model is needed.
 *
 * The top half is the shapes that already exist, laid out as a grid that wraps.
 * A rail that scrolled sideways hid half of them behind a gesture — there are
 * only a handful of shapes and the saved ones sit beside them, so they should
 * all be visible at once rather than discovered by dragging the row.
 *
 * A card answers two gestures, because there are two things to do with a shape:
 *
 * - **Drag it** onto the page. Nothing else to decide, and the drop is the
 *   answer to where — a button labelled "Add" cannot ask that.
 * - **Click it** to configure it first. Window, shape, how many rows: settings
 *   the generator reads but cannot guess. That opens the component editor, which
 *   is also where the model is reached for — so the shape becomes the starting
 *   point the agent edits, rather than a blank file.
 *
 * The bottom half is for the thing that starts from no shape at all: a sentence,
 * which picks a base for you and opens the same editor already running it.
 *
 * Every path reads the same selection from the explorer, so the data is chosen
 * once and the only remaining question is what to do with it.
 */
export const DRAG_TYPE = "application/x-dryos-component";

export interface TrayPayload {
  kind: ComponentKind;
  options?: Record<string, string>;
  custom?: { name: string; code: string };
  refs?: DataRef[];
  layout: { w: number; h: number };
}

interface Saved extends ComponentSpec {
  id: string;
  name: string;
}

/**
 * What the editor opens on.
 *
 * `refs` travels with it because a saved component carries its own data, which
 * is not necessarily what is selected in the explorer right now.
 */
export interface EditorStart {
  def: ComponentDef;
  refs: DataRef[];
  ask?: string;
  name?: string;
  options?: Record<string, string>;
  custom?: { name: string; code: string };
}

export function BuildPanel({
  refs,
  onDragStateChange,
  onOpen,
  reloadKey,
}: {
  refs: DataRef[];
  onDragStateChange: (payload: TrayPayload | null) => void;
  /**
   * Open the component editor on a starting point — a bare shape to configure,
   * a saved component to change, or a shape with a request already typed.
   */
  onOpen: (start: EditorStart) => void;
  reloadKey: number;
}) {
  const [saved, setSaved] = useState<Saved[]>([]);
  const [ask, setAsk] = useState("");
  /** Which card is in flight, so only that one shakes. */
  const [carrying, setCarrying] = useState<string | null>(null);
  /**
   * The shape being previewed, right here under the shelf. Clicking a card
   * runs the real thing — the preview route composes a one-tile app on live
   * data — with its settings beside it, so judging a chart never means
   * leaving the panel, and switching cards switches the preview.
   */
  const [previewKind, setPreviewKind] = useState<ComponentKind | null>(null);
  const [previewOpts, setPreviewOpts] = useState<Record<string, string>>({});

  const previewDef = previewKind
    ? COMPONENTS.find((c) => c.kind === previewKind)
    : undefined;
  // The missing parent: a sandboxed frame can only reach data through whoever
  // embeds it, and outside Runner that is this hook or a 30-second timeout.
  const previewFrame = usePreviewHost();

  useEffect(() => {
    fetch("/api/workspace/components")
      .then((r) => r.json())
      .then((d) => setSaved(d.components ?? []))
      .catch(() => {});
  }, [reloadKey]);

  /*
    A shape the selection has moved past leaves the shelf rather than greying on
    it. Only the ticker does this today: everything else that cannot take the
    selection has a reason worth reading, and greying carries the reason.
  */
  const offered = COMPONENTS.filter((c) => c.offered?.(refs) ?? true);

  /*
    A custom component still has to start from a shape that compiles, so it
    starts from the one the selection fits — a single series is a ticker,
    anything else a chart — and the agent rewrites from there.
  */
  const base =
    COMPONENTS.find(
      (c) => c.kind === (refs.length === 1 ? "ticker" : "chart"),
    ) ?? COMPONENTS[0];
  const canCustom = refs.length > 0 && base.accepts(refs).ok;

  function submit() {
    if (!ask.trim() || !canCustom) return;
    onOpen({ def: base, refs, ask: ask.trim() });
    setAsk("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
          Build
        </span>
      </div>

      {/* ── Components, on a grid that wraps ─────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col px-3 pt-2">
        <div className="flex shrink-0 items-baseline gap-2">
          <span className="font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
            Components
          </span>
          <span className="ml-auto font-mono text-[9.5px] text-faint">
            drag to place · click to set up
          </span>
        </div>

        {/*
          Two columns, wrapping into as many rows as there are shapes. Rows grow
          to their content (`auto-rows-min`) so a short list does not stretch
          four cards over the whole half.
        */}
        <div className="dr-scroll mt-2 grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto pb-2">
          {offered.map((c) => {
            const verdict = c.accepts(refs);
            return (
              <Card
                key={c.kind}
                kind={c.kind}
                title={c.name}
                body={verdict.ok ? c.blurb : verdict.why!}
                enabled={verdict.ok}
                carrying={carrying === c.kind}
                onOpen={() => {
                  if (previewKind === c.kind) {
                    setPreviewKind(null);
                    return;
                  }
                  setPreviewKind(c.kind);
                  setPreviewOpts(withDefaults(c));
                }}
                onDragStart={() => {
                  setCarrying(c.kind);
                  onDragStateChange({
                    kind: c.kind,
                    options: withDefaults(c),
                    refs,
                    layout: DEFAULT_LAYOUT[c.kind],
                  });
                }}
                onDragEnd={() => {
                  setCarrying(null);
                  onDragStateChange(null);
                }}
              />
            );
          })}

          {saved.map((c) => {
            const def = COMPONENTS.find((d) => d.kind === c.kind);
            return (
              <Card
                key={c.id}
                kind={c.kind}
                title={c.name}
                body={`Saved · ${c.refs.length} series`}
                enabled
                custom
                carrying={carrying === c.id}
                // A saved component opens on its own data and its own source —
                // what was saved, not what the explorer happens to hold now.
                onOpen={
                  def
                    ? () =>
                        onOpen({
                          def,
                          refs: c.refs,
                          name: c.name,
                          options: c.options,
                          custom: c.custom ?? undefined,
                        })
                    : undefined
                }
                onDragStart={() => {
                  setCarrying(c.id);
                  onDragStateChange({
                    kind: c.kind,
                    options: c.options,
                    custom: c.custom ?? undefined,
                    refs: c.refs,
                    layout: c.layout ?? DEFAULT_LAYOUT[c.kind],
                  });
                }}
                onDragEnd={() => {
                  setCarrying(null);
                  onDragStateChange(null);
                }}
              />
            );
          })}
        </div>
      </div>

      {previewDef && (
        <div className="shrink-0 border-t border-line px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
              {previewDef.name} · preview
            </span>
            <span className="font-mono text-[9.5px] text-faint">
              drag the card to place it
            </span>
            <button
              onClick={() => onOpen({ def: previewDef, refs, options: previewOpts })}
              className="ml-auto text-[11px] text-accent transition-colors hover:brightness-110"
            >
              Refine with AI ›
            </button>
            <button
              onClick={() => setPreviewKind(null)}
              aria-label="Close preview"
              className="rounded border border-line px-1.5 py-[2px] text-[10px] text-faint hover:text-ink"
            >
              ✕
            </button>
          </div>

          {previewDef.options.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {previewDef.options.map((o) => (
                <label key={o.key} className="flex items-center gap-1 text-[10.5px] text-faint">
                  {o.label}
                  <select
                    value={previewOpts[o.key] ?? o.fallback}
                    onChange={(e) =>
                      setPreviewOpts((prev) => ({ ...prev, [o.key]: e.target.value }))
                    }
                    className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink outline-none focus:border-line-strong"
                  >
                    {o.choices.map((ch) => (
                      <option key={ch.value} value={ch.value}>
                        {ch.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}

          {previewDef.accepts(refs).ok ? (
            <div className="mt-2 h-56 overflow-hidden rounded-md border border-line bg-code">
              <iframe
                ref={previewFrame}
                // Keyed by the spec so a settings change reloads the real
                // thing rather than mutating a stale frame. `bare` strips the
                // tile chrome, and the preview-only layout spans the grid so
                // the component fills the box — the drag payload keeps the
                // small default, so what lands on the page is unchanged.
                key={JSON.stringify({ k: previewKind, o: previewOpts, r: refs.length })}
                src={`/api/workspace/preview?bare=1&spec=${encodeURIComponent(
                  JSON.stringify({
                    kind: previewKind,
                    refs,
                    options: previewOpts,
                    layout: { w: 12, h: 178 },
                  }),
                )}`}
                sandbox="allow-scripts"
                className="h-full w-full border-0"
                title="Component preview"
              />
            </div>
          ) : (
            <p className="mt-2 text-[11.5px] text-muted">
              {previewDef.accepts(refs).why}
            </p>
          )}
        </div>
      )}

      {/* ── Something no shape covers ────────────────────────────────── */}
      <div className="border-t border-line px-3 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
            Custom component
          </span>
          <span className="ml-auto font-mono text-[9.5px] text-faint">
            preview before it lands
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
          rows={2}
          disabled={!canCustom}
          placeholder={
            refs.length === 0
              ? "Select data to build against…"
              : "A gauge that turns amber above $50…"
          }
          className="mt-1.5 w-full resize-none rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-line-strong disabled:opacity-50"
        />

        <div className="mt-2 flex items-center gap-2">
          <Button
            tone="primary"
            size="sm"
            disabled={!ask.trim() || !canCustom}
            onClick={submit}
          >
            Create with AI
          </Button>
          <span className="font-mono text-[9.5px] text-faint">
            ↵ to send · opens a preview
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * One shape, answering both gestures.
 *
 * Dragging places it as it comes; clicking opens it to be set up first. A drag
 * never produces a click, so the two do not collide — and it stays a `div`
 * because `draggable` on a `<button>` is unreliable outside Chrome. Keyboard
 * users get the click half through role and Enter, which is the half that can be
 * expressed without a pointer.
 */
function Card({
  kind,
  title,
  body,
  enabled,
  custom,
  carrying,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  kind: ComponentKind;
  title: string;
  body: string;
  enabled: boolean;
  custom?: boolean;
  /** This is the card the cursor has hold of right now. */
  carrying?: boolean;
  onOpen?: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const open = enabled && onOpen ? onOpen : undefined;
  return (
    <div
      draggable={enabled}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, "1");
        e.dataTransfer.effectAllowed = "copy";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={open}
      onKeyDown={(e) => {
        if (open && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          open();
        }
      }}
      role={open ? "button" : undefined}
      tabIndex={open ? 0 : undefined}
      title={body}
      className={cx(
        "min-w-0 rounded-md border px-2.5 py-2 text-left transition-colors outline-none",
        enabled
          ? "cursor-grab bg-surface-2 hover:border-accent-line focus-visible:border-accent-line active:cursor-grabbing"
          : "cursor-not-allowed border-dashed border-line bg-surface-2 opacity-45",
        enabled && (custom ? "border-accent-line/60" : "border-line"),
        carrying && "dr-jiggle border-accent-line",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Glyph kind={kind} on={Boolean(custom)} />
        <span className="truncate text-[12px] font-medium text-ink">
          {title}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-faint">
        {body}
      </p>
    </div>
  );
}

/** A shape for a shape. Drawn rather than lettered so the row scans at a glance. */
function Glyph({ kind, on }: { kind: ComponentKind; on: boolean }) {
  const stroke = on ? "var(--color-accent)" : "var(--color-muted)";
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      {kind === "chart" && (
        <path
          d="M1 10.5 L4.5 6 L7.5 8.5 L13 2.5"
          stroke={stroke}
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {kind === "bar" && (
        <>
          <path d="M2.5 11.5 V7" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <path d="M7 11.5 V2.5" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <path d="M11.5 11.5 V5" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {kind === "ticker" && (
        <>
          <rect
            x="1"
            y="3"
            width="12"
            height="8"
            rx="1.5"
            stroke={stroke}
            strokeWidth="1.2"
          />
          <path
            d="M3.5 7.5 H7"
            stroke={stroke}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </>
      )}
      {kind === "table" && (
        <>
          <rect
            x="1"
            y="2.5"
            width="12"
            height="9"
            rx="1.2"
            stroke={stroke}
            strokeWidth="1.2"
          />
          <path
            d="M1 5.5 H13 M5.5 5.5 V11.5"
            stroke={stroke}
            strokeWidth="1.1"
          />
        </>
      )}
      {kind === "map" && (
        <>
          <path
            d="M5 2 L1.5 3.5 V12 L5 10.5 L9 12 L12.5 10.5 V2 L9 3.5 Z"
            stroke={stroke}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path d="M5 2 V10.5 M9 3.5 V12" stroke={stroke} strokeWidth="1.1" />
        </>
      )}
    </svg>
  );
}
