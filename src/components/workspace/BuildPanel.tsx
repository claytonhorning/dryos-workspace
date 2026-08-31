"use client";

import {
  useEffect,
  useState,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { cx } from "@/components/ui";
import {
  COMPONENTS,
  DEFAULT_LAYOUT,
  type ComponentDef,
  type ComponentKind,
  type ComponentSpec,
  withDefaults,
} from "@/lib/workspace/components";
import { type DataRef } from "@/lib/workspace/catalog";
import type { PublishedComponent } from "@/lib/workspace/community";
import { usePreviewHost } from "@/lib/workspace/usePreviewHost";
import { SeriesStyles } from "@/components/workspace/SeriesStyles";

/**
 * The shelf of things a screen can be built from, and the preview of one.
 *
 * The shelf is in three sections — the base shapes, the components you saved,
 * and the ones somebody published. They are listed apart because they answer
 * different questions: a shape is a starting point, a saved component is
 * something you already decided, and a published one is somebody else's
 * decision you are borrowing.
 *
 * **A card is not draggable, and only the preview is.** One gesture used to
 * mean two things: dragging a card placed the shape sight-unseen at its
 * defaults, while clicking it opened the real thing. Judging a component from
 * its name is the guess the inline preview exists to remove, so the shelf does
 * one job — click a card and the component runs on live data in the shelf's own
 * place, the pane taking one state or the other — and the thing you drag onto
 * the page is the thing you are looking at. What lands is what you saw,
 * settings and all, which is not something a card could ever promise.
 *
 * The sentence for the thing no shape covers is not here: `CustomComponent`
 * lives under the screen, because it is a request about the dashboard rather
 * than one more choice about a component.
 *
 * Every path reads the same selection from the explorer, so the data is chosen
 * once and the only remaining question is what to do with it.
 */
export const DRAG_TYPE = "application/x-dryos-component";

/** Turned down once, per machine — the same place the panel width lives. */
const HINTS_KEY = "dryos:hints";
/**
 * Long enough that someone who already knows the gesture never meets it, short
 * enough to arrive while they are still looking at the preview wondering.
 */
const HINT_DELAY = 4000;

/**
 * The preview box runs the component at the full width of the box it sits in.
 *
 * Tall enough for the worst case rather than for the typical one: a fan-out
 * over eight fuel types spends most of a short tile on its axes and legend and
 * draws a band you cannot read. A preview that has to be enlarged before it
 * answers the question is not previewing anything. The box outside it is a
 * little taller again — the generated grid keeps its own gutter.
 */
const PREVIEW_LAYOUT = { w: 12, h: 272 };

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

/** Which shelf a card came from. It decides how the preview addresses it. */
type Shelf = "base" | "saved" | "community";

/**
 * The component running in the shelf's place.
 *
 * It carries its own references rather than reading the explorer's, because a
 * saved or published component brings its own data — what was selected in the
 * explorer has nothing to do with it.
 */
interface Preview {
  /** Card identity, so clicking the open card closes it again. */
  id: string;
  shelf: Shelf;
  def: ComponentDef;
  name: string;
  refs: DataRef[];
  layout: { w: number; h: number };
  custom?: { name: string; code: string };
}

export function BuildPanel({
  refs,
  onDragStateChange,
  reloadKey,
}: {
  refs: DataRef[];
  onDragStateChange: (payload: TrayPayload | null) => void;
  reloadKey: number;
}) {
  const [saved, setSaved] = useState<Saved[]>([]);
  const [community, setCommunity] = useState<PublishedComponent[]>([]);
  /**
   * The component being previewed, in the shelf's own place. Clicking a card
   * runs the real thing — the preview route composes a one-tile app on live
   * data — with its settings above it, so judging a component never means
   * leaving the panel, and switching cards switches the preview.
   */
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewOpts, setPreviewOpts] = useState<Record<string, string>>({});
  /**
   * The hint in the corner: shown only after a preview has sat there long
   * enough to mean somebody is looking at it and has not worked out that it
   * is the thing to drag. Off for good once they say so — a hint that keeps
   * arriving after being turned down is not a hint.
   */
  const [hint, setHint] = useState(false);
  /** Assumed off until the flag is read, so it can never flash before we know. */
  const [hintsOff, setHintsOff] = useState(true);
  /** One drag is the whole lesson; after that there is nothing left to say. */
  const [dragged, setDragged] = useState(false);

  // The missing parent: a sandboxed frame can only reach data through whoever
  // embeds it, and outside Runner that is this hook or a 30-second timeout.
  const previewFrame = usePreviewHost();

  useEffect(() => {
    fetch("/api/workspace/components")
      .then((r) => r.json())
      .then((d) => {
        setSaved(d.components ?? []);
        setCommunity(d.community ?? []);
      })
      .catch(() => {});
  }, [reloadKey]);

  useEffect(() => {
    try {
      setHintsOff(localStorage.getItem(HINTS_KEY) === "off");
    } catch {
      // A machine that will not keep the flag still gets the hint.
      setHintsOff(false);
    }
  }, []);

  /*
    A shape the selection has moved past leaves the shelf rather than greying on
    it. Only the ticker does this today: everything else that cannot take the
    selection has a reason worth reading, and greying carries the reason.
  */
  const offered = COMPONENTS.filter((c) => c.offered?.(refs) ?? true);
  /** A stable identity for that list — the array itself is new every render. */
  const offeredKey = offered.map((c) => c.kind).join("|");

  /*
    A base shape is previewed *against the explorer*, so its references are read
    live rather than snapshotted when the card was clicked — change the
    selection and the preview redraws on it, which is the whole reason it is
    down there. A saved or published component brings its own data and ignores
    the selection entirely.
  */
  const previewRefs = preview
    ? preview.shelf === "base"
      ? refs
      : preview.refs
    : [];
  const verdict = preview ? preview.def.accepts(previewRefs) : null;
  const previewLive = Boolean(verdict?.ok);

  // A shape the selection has moved past is gone from the shelf, so leaving its
  // preview open would leave a component on screen with no card behind it.
  useEffect(() => {
    if (
      preview?.shelf === "base" &&
      !offeredKey.split("|").includes(preview.id)
    ) {
      setPreview(null);
    }
  }, [preview, offeredKey]);

  useEffect(() => {
    if (!previewLive || hintsOff || dragged) {
      setHint(false);
      return;
    }
    const t = setTimeout(() => setHint(true), HINT_DELAY);
    return () => clearTimeout(t);
  }, [previewLive, preview?.id, hintsOff, dragged]);

  /**
   * Which card the preview belongs to. Shelf and id together, because ids are
   * only unique within a shelf — a published component is free to be called
   * `chart`, and it must not light up the base shape of that name.
   */
  const isOpen = (shelf: Shelf, id: string) =>
    preview?.shelf === shelf && preview.id === id;

  /** Clicking the open card puts the preview away; any other card swaps it. */
  function show(next: Preview, options: Record<string, string>) {
    if (isOpen(next.shelf, next.id)) {
      setPreview(null);
      return;
    }
    setPreview(next);
    setPreviewOpts(options);
  }

  /**
   * The frame's address.
   *
   * A base shape travels whole — it is a kind, some references and some
   * settings. A saved or published one goes by id, because a refined component
   * carries its finished source and a few kilobytes of TSX does not belong in
   * a URL.
   */
  function previewSrc(
    p: Preview,
    options: Record<string, string>,
    on: DataRef[],
  ): string {
    const q = new URLSearchParams({ bare: "1" });
    if (p.shelf === "base") {
      q.set(
        "spec",
        JSON.stringify({
          kind: p.def.kind,
          refs: on,
          options,
          layout: PREVIEW_LAYOUT,
        }),
      );
    } else {
      q.set(p.shelf === "saved" ? "component" : "community", p.id);
      q.set("options", JSON.stringify(options));
      q.set("w", String(PREVIEW_LAYOUT.w));
      q.set("h", String(PREVIEW_LAYOUT.h));
    }
    return `/api/workspace/preview?${q.toString()}`;
  }

  /* A frozen source ignores settings, so offering selects would be a lie. */
  const tunable = preview ? !preview.custom : false;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
      {/*
        One pane, two states. The preview used to open as a second panel below
        the shelf, which left both of them short: a shelf you had to scroll past
        to reach the thing you were looking at, and a preview in the last third
        of the column. Choosing a component and judging it are consecutive, not
        simultaneous — so the preview takes the pane, and going back is one
        control in the same place the heading was.
      */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        {preview ? (
          <>
            <button
              onClick={() => setPreview(null)}
              className="-ml-1 shrink-0 rounded px-1 font-mono text-[10px] tracking-[0.14em] text-faint uppercase transition-colors hover:text-ink"
            >
              ‹ Components
            </button>
            <span className="ml-auto truncate font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
              {preview.name}
            </span>
          </>
        ) : (
          <>
            {/*
              The heading alone. The instruction that used to sit beside it said
              the same thing as the note on the Components section one line
              below, and the section is where somebody is actually looking when
              they need it.
            */}
            <span className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
              Build
            </span>
          </>
        )}
      </div>

      {preview ? (
        <PreviewPane
          def={preview.def}
          refs={previewRefs}
          live={previewLive}
          why={verdict?.why}
          tunable={tunable}
          options={previewOpts}
          onOption={(key, value) =>
            setPreviewOpts((prev) => ({ ...prev, [key]: value }))
          }
          src={previewSrc(preview, previewOpts, previewRefs)}
          frameKey={`${preview.shelf}:${preview.id}:${JSON.stringify(
            previewOpts,
          )}:${previewRefs.map((r) => r.schemaId + r.label).join("|")}`}
          frameRef={previewFrame}
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, "1");
            e.dataTransfer.effectAllowed = "copy";
            setDragged(true);
            setHint(false);
            onDragStateChange({
              kind: preview.def.kind,
              options: previewOpts,
              custom: preview.custom,
              refs: previewRefs,
              layout: preview.layout,
            });
          }}
          onDragEnd={() => onDragStateChange(null)}
        />
      ) : (
        <>
      {/* ── The shelf, in three sections ─────────────────────────────── */}
      <div className="dr-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pt-2 pb-2">
        <Section
          title="Components"
          note="click one to see it on your data"
        >
          {offered.map((c) => {
            const v = c.accepts(refs);
            return (
              <Card
                key={c.kind}
                kind={c.kind}
                title={c.name}
                body={v.ok ? c.blurb : v.why!}
                enabled={v.ok}
                open={isOpen("base", c.kind)}
                onOpen={() =>
                  show(
                    {
                      id: c.kind,
                      shelf: "base",
                      def: c,
                      name: c.name,
                      refs,
                      layout: DEFAULT_LAYOUT[c.kind],
                    },
                    withDefaults(c),
                  )
                }
              />
            );
          })}
        </Section>

        {/*
          Kept even while empty. The section is the answer to "where did the
          thing I saved go" — a heading that only exists once something is in
          it cannot answer that, and one line saying how to fill it can.
        */}
        <Section title="Your components" note="saved from the editor">
          {saved.length === 0 ? (
            <Empty>
              Build something, refine it, and <em>Save</em> keeps it here for
              the next screen.
            </Empty>
          ) : (
            saved.map((c) => {
              const def = COMPONENTS.find((d) => d.kind === c.kind);
              if (!def) return null;
              return (
                <Card
                  key={c.id}
                  kind={c.kind}
                  title={c.name}
                  body={`${def.name} · ${c.refs.length} series`}
                  meta={c.custom ? "refined" : undefined}
                  enabled
                  accent
                  open={isOpen("saved", c.id)}
                  // Opens on its own data and its own source — what was saved,
                  // not what the explorer happens to hold now.
                  onOpen={() =>
                    show(
                      {
                        id: c.id,
                        shelf: "saved",
                        def,
                        name: c.name,
                        refs: c.refs,
                        layout: c.layout ?? DEFAULT_LAYOUT[c.kind],
                        custom: c.custom ?? undefined,
                      },
                      withDefaults(def, c.options),
                    )
                  }
                  onDelete={async () => {
                    if (isOpen("saved", c.id)) setPreview(null);
                    await fetch(
                      `/api/workspace/components?id=${encodeURIComponent(c.id)}`,
                      { method: "DELETE" },
                    );
                    const d = await fetch("/api/workspace/components").then((r) =>
                      r.json(),
                    );
                    setSaved(d.components ?? []);
                  }}
                />
              );
            })
          )}
        </Section>

        {community.length > 0 && (
          <Section title="Community" note="published, ready to take">
            {community.map((c) => {
              const def = COMPONENTS.find((d) => d.kind === c.kind);
              if (!def) return null;
              return (
                <Card
                  key={c.id}
                  kind={c.kind}
                  title={c.name}
                  body={c.blurb}
                  meta={`by ${c.author}`}
                  enabled
                  accent
                  open={isOpen("community", c.id)}
                  onOpen={() =>
                    show(
                      {
                        id: c.id,
                        shelf: "community",
                        def,
                        name: c.name,
                        refs: c.refs,
                        layout: c.layout ?? DEFAULT_LAYOUT[c.kind],
                        custom: c.custom ?? undefined,
                      },
                      withDefaults(def, c.options),
                    )
                  }
                />
              );
            })}
          </Section>
        )}
      </div>

        </>
      )}

      {/*
        The corner, not the widget: a hint that lived on the preview competed
        with the preview for the same glance. Bottom right is the free corner —
        the usage dock owns bottom left.
      */}
      {hint && (
        <div
          role="status"
          className="dr-rise fixed right-4 bottom-4 z-30 w-[248px] rounded-xl border border-line-strong bg-surface p-3 shadow-2xl shadow-black/50"
        >
          <div className="flex items-start gap-2">
            <p className="text-[12px] leading-snug text-ink">
              Drag the preview onto the screen to place it. The cards behind it
              only open it.
            </p>
            <button
              onClick={() => setHint(false)}
              aria-label="Dismiss this hint"
              className="-mt-0.5 -mr-1 shrink-0 rounded px-1 text-[11px] text-faint transition-colors hover:text-ink"
            >
              ✕
            </button>
          </div>
          <button
            onClick={() => {
              setHintsOff(true);
              setHint(false);
              try {
                localStorage.setItem(HINTS_KEY, "off");
              } catch {
                // Nothing to do: it stays gone for this session either way.
              }
            }}
            className="mt-2 font-mono text-[9.5px] text-faint underline underline-offset-2 transition-colors hover:text-ink"
          >
            don&rsquo;t show hints again
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The component itself, running, with the pane to itself.
 *
 * It is the shelf's other state rather than a box below it: what you are
 * looking at is the only thing on screen, so it gets the height a chart needs
 * instead of the strip left over under three sections of cards. Settings sit
 * above it because changing one reloads what is underneath.
 */
function PreviewPane({
  def,
  refs,
  live,
  why,
  tunable,
  options,
  onOption,
  src,
  frameKey,
  frameRef,
  onDragStart,
  onDragEnd,
}: {
  def: ComponentDef;
  /** What it is drawing, so the series can be listed and painted. */
  refs: DataRef[];
  live: boolean;
  why?: string;
  tunable: boolean;
  options: Record<string, string>;
  onOption: (key: string, value: string) => void;
  src: string;
  frameKey: string;
  frameRef: RefObject<HTMLIFrameElement | null>;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pt-2.5 pb-3">
      {tunable && def.options.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {def.options.map((o) => (
            <label
              key={o.key}
              className="flex items-center gap-1 text-[10.5px] text-faint"
            >
              {o.label}
              <select
                value={options[o.key] ?? o.fallback}
                onChange={(e) => onOption(o.key, e.target.value)}
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

      {live ? (
        <div
          // The widget itself is the handle: what you drag is what lands, so
          // the accent border belongs to the thing being carried rather than to
          // a chip pointing at it. It is also the *only* handle — the cards
          // behind it place nothing.
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title="Drag onto the page to place exactly what you see"
          // A fixed height, not the rest of the pane. It is tall enough for the
          // worst case — a fan-out over eight fuel types spends a short tile
          // entirely on axes and legend — and the height below it belongs to
          // the series, which is where the reading of the chart is decided.
          className="relative h-72 shrink-0 cursor-grab overflow-hidden rounded-md border border-accent bg-code active:cursor-grabbing"
        >
          <iframe
            ref={frameRef}
            // Keyed by the spec so a settings change reloads the real thing
            // rather than mutating a stale frame. `bare` strips the tile
            // chrome, and the preview-only layout spans the grid so the
            // component fills the box — the drag payload keeps the component's
            // own footprint, so what lands is unchanged.
            key={frameKey}
            src={src}
            sandbox="allow-scripts"
            className="h-full w-full border-0"
            title="Component preview"
          />
          {/*
            Pointer events do not cross into an iframe, so a drag started over
            the frame would never reach this wrapper. A transparent sheet
            catches it — and carries the one label in the panel, because the
            shelf behind it does not answer a drag and something has to say
            where the gesture moved to.
          */}
          <div className="absolute inset-0 flex items-start justify-start p-1.5">
            <span className="pointer-events-none rounded border border-accent-line bg-surface/85 px-1.5 py-[2px] font-mono text-[9.5px] tracking-[0.08em] text-accent uppercase backdrop-blur">
              ⠿ drag onto the screen
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[11.5px] text-muted">{why}</p>
      )}

      {/*
        Under the preview, taking the height it no longer does: what the
        component is actually drawing, and how each one is drawn. Scrolls on
        its own — eight series and a short panel is a normal combination.

        Frozen source is exempt for the same reason the selects above are: a
        refined component ignores its settings, so offering them would be a lie.
      */}
      {live && tunable && (
        <div className="dr-scroll min-h-0 flex-1 overflow-y-auto">
          <SeriesStyles
            refs={refs}
            kind={def.kind}
            options={options}
            onChange={(series) => onOption("series", series)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * One heading and the cards under it.
 *
 * Three shelves rather than one list, because "a shape", "something I made" and
 * "something somebody published" are three different things to be looking for,
 * and a single grid makes you read every card to tell them apart.
 */
function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <div className="shrink-0">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
          {title}
        </span>
        <span className="ml-auto truncate font-mono text-[9.5px] text-faint">
          {note}
        </span>
      </div>
      {/*
        Two columns, wrapping into as many rows as there are cards. Rows grow to
        their content (`auto-rows-min`) so a short section does not stretch its
        cards over the space a longer one would have used.
      */}
      <div className="mt-1.5 grid auto-rows-min grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

/** A section with nothing in it yet, saying how it fills rather than vanishing. */
function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="col-span-2 rounded-md border border-dashed border-line px-2.5 py-2 text-[11px] leading-snug text-faint">
      {children}
    </p>
  );
}

/**
 * One component on the shelf, answering one gesture.
 *
 * Clicking it runs the thing underneath. It is not draggable, and that is the
 * point: a card dragged onto the page placed something nobody had looked at
 * yet, at settings nobody had chosen. The preview is the drag handle now, so
 * what lands is always what was on screen a moment before.
 *
 * It stays a `div` with a role rather than a `<button>` only because the
 * surrounding grid styles it as a tile; Enter and Space open it like a button.
 */
function Card({
  kind,
  title,
  body,
  meta,
  enabled,
  accent,
  open,
  onOpen,
  onDelete,
}: {
  kind: ComponentKind;
  title: string;
  body: string;
  /** A word about where it came from — an author, or that it was refined. */
  meta?: string;
  enabled: boolean;
  /** Saved and published components wear the accent; the base shapes do not. */
  accent?: boolean;
  /** Its preview is the one currently open. */
  open?: boolean;
  onOpen: () => void;
  /** Saved components can leave the shelf; shapes and published ones cannot. */
  onDelete?: () => void;
}) {
  const act = enabled ? onOpen : undefined;
  return (
    <div
      onClick={act}
      onKeyDown={(e) => {
        if (act && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          act();
        }
      }}
      role={act ? "button" : undefined}
      tabIndex={act ? 0 : undefined}
      aria-pressed={act ? Boolean(open) : undefined}
      title={body}
      className={cx(
        "min-w-0 rounded-md border px-2.5 py-2 text-left transition-colors outline-none",
        enabled
          ? "cursor-pointer bg-surface-2 hover:border-accent-line focus-visible:border-accent-line"
          : "cursor-not-allowed border-dashed border-line bg-surface-2 opacity-45",
        enabled && (accent ? "border-accent-line/60" : "border-line"),
        // The open card stays lit while its preview is below, so the two read
        // as one thing rather than as a card and an unrelated widget.
        open && "border-accent bg-accent-dim",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Glyph kind={kind} on={Boolean(accent || open)} />
        <span className="truncate text-[12px] font-medium text-ink">
          {title}
        </span>
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={`Delete ${title}`}
            title="Delete this saved component"
            className="ml-auto shrink-0 rounded px-1 text-[11px] text-faint transition-colors hover:text-fail"
          >
            ✕
          </button>
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-faint">
        {body}
      </p>
      {meta && (
        <p className="mt-0.5 truncate font-mono text-[9px] tracking-[0.08em] text-faint uppercase">
          {meta}
        </p>
      )}
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
      {kind === "scatter" && (
        <>
          {[
            [3, 10],
            [5.5, 7.5],
            [7, 9],
            [8.5, 5],
            [10.5, 6],
            [12, 3],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.1" fill={stroke} />
          ))}
        </>
      )}
      {/* The duration curve's own shape: high on the left, a long tail. */}
      {kind === "distribution" && (
        <path
          d="M1 3 C 4 3.4, 5 9, 13 10.5"
          stroke={stroke}
          strokeWidth="1.3"
          strokeLinecap="round"
          fill="none"
        />
      )}
      {kind === "bar" && (
        <>
          <path d="M2.5 11.5 V7" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <path d="M7 11.5 V2.5" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <path d="M11.5 11.5 V5" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {kind === "heatmap" && (
        <>
          {[2, 6.5, 11].flatMap((x) =>
            [2, 6.5, 11].map((y) => (
              <rect key={`${x}-${y}`} x={x} y={y - 1} width="3" height="3" rx="0.5" fill={stroke} opacity={(x + y) / 20} />
            )),
          )}
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
