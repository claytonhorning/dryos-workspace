"use client";

import {
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { cx } from "@/components/ui";
import { Select } from "@/components/Select";
import {
  COMPONENTS,
  DEFAULT_LAYOUT,
  GRID,
  type ComponentDef,
  type ComponentKind,
  type ComponentSpec,
  withDefaults,
} from "@/lib/workspace/components";
import { type DataRef, domainOf, schemaById } from "@/lib/workspace/catalog";
import {
  DataExplorer,
  DomainSelect,
} from "@/components/workspace/DataExplorer";
import { SelectionStrip } from "@/components/workspace/DataChip";
import {
  communityComponents,
  communityGroups,
  type PublishedGroup,
} from "@/lib/workspace/community";
import { usePreviewHost } from "@/lib/workspace/usePreviewHost";
import { useTimeZone } from "@/lib/useTimeZone";
import { SeriesStyles } from "@/components/workspace/SeriesStyles";

/**
 * The shelf of things a screen can be built from, and the preview of one.
 *
 * One shelf, the **Library**, in three sections: the base shapes, then what
 * was published (`lib/workspace/community.ts`) — single components and wired
 * groups of them. **The shape is chosen first and its data second.** A card
 * on the shelf opens the explorer with the shape named above it, the
 * explorer's Next answers to that shape's `accepts`, and the pane comes back
 * as the real thing running on the selection. A published component or
 * group brings its own data, so it skips the explorer and opens on its
 * preview; so does a shape that reads no data at all. Your saved components
 * are not on the shelf today.
 *
 * **A card is not draggable; the bar above the running preview is.** One
 * gesture used to mean two things: dragging a card placed the shape
 * sight-unseen at its defaults, while clicking it opened the real thing.
 * Judging a component from its name is the guess the inline preview exists to
 * remove, so the shelf does one job — click a card and the component runs on
 * live data in the shelf's own place, the pane taking one state or the other —
 * and what you drag out is the thing you are looking at. What lands is what
 * you saw, settings and all, which is not something a card could ever promise.
 *
 * The handle is a strip above the frame rather than the frame itself, because
 * an iframe cannot hand a drag to its host: catching one meant a sheet over
 * the component, and a sheet over the component meant a map that would not pan
 * and a chart that would not hover. See PreviewPane.
 *
 * The sentence for the thing no shape covers is not here either: the chat
 * lives under the screen (`ChatDock`), because it is a request about the
 * dashboard rather than one more choice about a component.
 */
export const DRAG_TYPE = "application/x-dryos-component";

/**
 * The palette slots a wire may wear, and slot 1 is not one of them.
 *
 * Slot 1 is the accent, and the accent is the app talking about itself —
 * selection, focus, the drop boundary, every chip that says "wired". A pair
 * outlined in it on the launched screen is indistinguishable from chrome, and
 * in edit mode it is indistinguishable from the tile you have open. The seven
 * left are still the validated set, so nothing about color-vision safety
 * changes; a wire saved with slot 1 before this still draws as it was, and
 * cycling moves it into the seven and cannot bring it back.
 *
 * Here rather than in the wires strip because both places hand a group to
 * the canvas, and the strip already imports from this file.
 */
export const WIRE_SLOTS = [2, 3, 4, 5, 6, 7, 8];

/** The one after this, around the seven. */
export function nextWireSlot(slot?: number): number {
  const i = slot === undefined ? -1 : WIRE_SLOTS.indexOf(slot);
  return WIRE_SLOTS[(i + 1) % WIRE_SLOTS.length];
}

/**
 * How many wired groups a manifest holds — one per tile that something
 * follows. The next group to land takes the slot after them, so two groups
 * never arrive wearing the same color by default.
 */
export function wiredGroupCount(manifest?: ComponentSpec[]): number {
  const sources = new Set<number>();
  (manifest ?? []).forEach((s) => {
    const n = Number(s.options?.follow);
    if (Number.isInteger(n) && n >= 0 && manifest?.[n]) sources.add(n);
  });
  return sources.size;
}

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
 *
 * The ticker is the exception: one number at a fixed content height, so its
 * worst case *is* its tile height, and padding it to the chart's budget only
 * framed a small card in dead space. It previews at the height it lands at.
 */
/**
 * The grab bar above a placeable preview. A row, not a chip on the widget —
 * see PreviewPane — and its height is added to the box rather than taken out
 * of the component's own budget.
 */
export const GRAB_BAR = 22;

export function previewLayout(kind: ComponentKind) {
  return {
    w: 12,
    h:
      kind === "ticker" || kind === "text"
        ? DEFAULT_LAYOUT[kind].h
        : 272,
  };
}

/**
 * One member of a staged group: a whole component, plus who it follows.
 * `wireTo` is group-relative — the server resolves it to a manifest slot at
 * placement, because only the server knows where the group will sit.
 */
export interface StagedComponent {
  kind: ComponentKind;
  options?: Record<string, string>;
  custom?: { name: string; code: string };
  refs?: DataRef[];
  layout: { w: number; h: number };
  wireTo?: number;
}

export interface TrayPayload {
  kind: ComponentKind;
  options?: Record<string, string>;
  custom?: { name: string; code: string };
  refs?: DataRef[];
  layout: { w: number; h: number };
  /**
   * Several tiles travelling as one drop, stacked in list order. When set,
   * the singular fields above are only the ghost's footprint — the members
   * are what land.
   */
  group?: StagedComponent[];
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
  name?: string;
  options?: Record<string, string>;
  custom?: { name: string; code: string };
}

/** Which shelf a card came from. It decides how the preview addresses it. */
type Shelf = "base" | "saved" | "community";

/**
 * What the shelf is called, in the heading and on every way back to it.
 *
 * Not "Shapes": the base shapes are one section of it, beside what other
 * people published. Not "Components": that is the word for a tile on a
 * page, and the shelf also holds groups of them. A library is the thing
 * you take something from to build with, which is what this is.
 */
const SHELF = "Library";

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
  onToggle,
  onClear,
  onDragStateChange,
  manifest,
  domain,
  onDomainChange,
  resetTick = 0,
}: {
  /** The explorer's selection: what a shape taken from the shelf is drawn on. */
  refs: DataRef[];
  onToggle: (ref: DataRef) => void;
  onClear: () => void;
  onDragStateChange: (payload: TrayPayload | null) => void;
  /** The page's manifest, so a landing group takes the next free wire color. */
  manifest?: ComponentSpec[];
  /**
   * The subject the panel is narrowed to, or `"all"`. The shelf and the
   * explorer both read it: the catalogue filters by it, and so does what is
   * published, since a published component belongs to the domain of the
   * streams it reads. The page owns it, because the workspace's own subject
   * arrives after the panel mounts.
   */
  domain: string;
  onDomainChange: (domain: string) => void;
  /**
   * Bumped by the page when a drop lands. A landed drop ends the build it
   * was part of, so the panel goes back to the shelf for the next one.
   */
  resetTick?: number;
}) {
  /**
   * Where in the build you are. The shelf is the beginning; `data` is the
   * explorer, open because a shape was chosen and it needs something to draw.
   * The preview has no stage of its own: it is the shelf state with a
   * component chosen, the way it always was.
   */
  const [stage, setStage] = useState<"shelf" | "data">("shelf");
  /**
   * A published group, open in the shelf's place. It is not a `Preview`: a
   * group has no single frame to run, so it opens as its members listed in
   * stacking order and the whole list is the drag handle.
   */
  const [group, setGroup] = useState<PublishedGroup | null>(null);
  // Rebuilt from today's catalogue on every read, which is cheap and is the
  // point — a recipe is a stream and a shape, never a frozen chip.
  const inDomain = (rs: DataRef[] | undefined) =>
    !domain ||
    domain === "all" ||
    (rs ?? []).some((r) => {
      const schema = schemaById(r.schemaId);
      return schema !== undefined && domainOf(schema) === domain;
    });
  const published = useMemo(
    () => communityComponents().filter((c) => inDomain(c.refs)),
    // `inDomain` closes over `domain` and nothing else that changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [domain],
  );
  const groups = useMemo(
    () =>
      communityGroups().filter((g) =>
        g.members.some((m) => inDomain(m.refs)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [domain],
  );
  /**
   * The component chosen from the shelf. A base shape is chosen *before* its
   * data, so it is held here through the explorer stage and previewed once
   * the explorer's Next brings the pane back — the preview route composes a
   * one-tile app on live data, with its settings above it, so judging a
   * component never means leaving the panel.
   */
  const [preview, setPreview] = useState<Preview | null>(
    null,
  );
  const [previewOpts, setPreviewOpts] = useState<
    Record<string, string>
  >({});
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
  // The previews have no Runner to message them the display timezone, so it
  // rides their URL instead.
  const tzPref = useTimeZone();

  useEffect(() => {
    try {
      setHintsOff(
        localStorage.getItem(HINTS_KEY) === "off",
      );
    } catch {
      // A machine that will not keep the flag still gets the hint.
      setHintsOff(false);
    }
  }, []);

  // A landed drop ends the build it was part of.
  useEffect(() => {
    if (!resetTick) return;
    setPreview(null);
    setGroup(null);
    setStage("shelf");
  }, [resetTick]);

  /*
    A base shape is previewed *against the explorer*, so its references are read
    live rather than snapshotted when the card was clicked — change the
    selection and the preview redraws on it. A saved or published component
    brings its own data and ignores the selection entirely.
  */
  const previewRefs = preview
    ? preview.shelf === "base"
      ? refs
      : preview.refs
    : [];
  const verdict = preview
    ? preview.def.accepts(previewRefs)
    : null;
  const previewLive = Boolean(verdict?.ok);
  /** The preview is on screen: chosen, and not behind the explorer. */
  const showingPreview = preview !== null && stage === "shelf";

  useEffect(() => {
    if (!showingPreview || !previewLive || hintsOff || dragged) {
      setHint(false);
      return;
    }
    const t = setTimeout(() => setHint(true), HINT_DELAY);
    return () => clearTimeout(t);
  }, [showingPreview, previewLive, preview?.id, hintsOff, dragged]);

  /** Back to the shelf, with nothing chosen. */
  function toShelf() {
    setPreview(null);
    setGroup(null);
    setStage("shelf");
  }

  /**
   * A base shape is chosen first and its data second, so picking one opens
   * the explorer. The one exception is a shape that accepts an empty
   * selection — a title reads no data — which has nothing to pick and goes
   * straight to its preview.
   */
  function pickShape(c: ComponentDef) {
    setGroup(null);
    setPreview({
      id: c.kind,
      shelf: "base",
      def: c,
      name: c.name,
      refs,
      layout: DEFAULT_LAYOUT[c.kind],
    });
    setPreviewOpts(withDefaults(c));
    setStage(c.accepts([]).ok ? "shelf" : "data");
  }

  /** A published component brings its own data, so it opens on its preview. */
  function show(
    next: Preview,
    options: Record<string, string>,
  ) {
    setGroup(null);
    setPreview(next);
    setPreviewOpts(options);
    setStage("shelf");
  }

  function showGroup(next: PublishedGroup) {
    setPreview(null);
    setGroup(next);
    setStage("shelf");
  }

  /**
   * A published group leaves as one drop, exactly the way a staged group
   * leaves the wires strip: the members are what land, the singular fields
   * are only the ghost's footprint, and every follower wears the next unused
   * wire color so the pair is told apart from the groups already on the page.
   */
  function grabGroup(e: DragEvent, g: PublishedGroup) {
    e.dataTransfer.setData(DRAG_TYPE, "1");
    e.dataTransfer.effectAllowed = "copy";
    const color = String(
      WIRE_SLOTS[wiredGroupCount(manifest) % WIRE_SLOTS.length],
    );
    onDragStateChange({
      kind: g.members[0].kind,
      layout: {
        w: Math.max(...g.members.map((m) => m.layout.w)),
        h:
          g.members.reduce((a, m) => a + m.layout.h, 0) +
          (g.members.length - 1) * GRID.gap,
      },
      group: g.members.map((m) => ({
        kind: m.kind,
        refs: m.refs,
        layout: m.layout,
        wireTo: m.wireTo,
        options:
          m.wireTo !== undefined
            ? { ...(m.options ?? {}), wireColor: color }
            : m.options,
      })),
    });
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
    // `naked`: the widget and nothing else. The pane is short, the shelf above
    // already says what this is, and a legend, a scrubber and a title bar are
    // most of a 260px box.
    const q = new URLSearchParams({
      bare: "1",
      naked: "1",
      tz: tzPref,
    });
    if (p.shelf === "base") {
      q.set(
        "spec",
        JSON.stringify({
          kind: p.def.kind,
          refs: on,
          options,
          layout: previewLayout(p.def.kind),
        }),
      );
    } else {
      q.set(
        p.shelf === "saved" ? "component" : "community",
        p.id,
      );
      q.set("options", JSON.stringify(options));
      q.set("w", String(previewLayout(p.def.kind).w));
      q.set("h", String(previewLayout(p.def.kind).h));
    }
    return `/api/workspace/preview?${q.toString()}`;
  }

  /* A frozen source ignores settings, so offering selects would be a lie. */
  const tunable = preview ? !preview.custom : false;

  /*
    The explorer, with the chosen shape named above it. It takes the whole
    column the way it does inside the tile editor; the strip is the way back
    to the shelf and the reminder of what the data is for, and the explorer's
    own Next — answering to the shape's `accepts` — is the way on.
  */
  if (stage === "data" && preview) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
          <button
            onClick={toShelf}
            className="flex items-center gap-2 text-left text-[12px] text-muted transition-colors hover:text-ink"
          >
            ‹ {SHELF}
          </button>
          <span className="ml-auto flex min-w-0 items-center gap-1.5">
            <Glyph kind={preview.def.kind} on />
            <span className="truncate text-[12px] font-medium text-ink">
              {preview.name}
            </span>
            <span className="font-mono text-[10px] text-faint">
              · pick its data
            </span>
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <DataExplorer
            domain={domain}
            onDomainChange={onDomainChange}
            selected={refs}
            onToggle={onToggle}
            onClear={onClear}
            verdict={preview.def.accepts(refs)}
            onNext={() => setStage("shelf")}
          />
        </div>
      </div>
    );
  }

  /*
    A base shape's selection stays in view above its preview — the same
    bordered strip the tile editor wears: the way back to the data, the
    count, the chips removable in place. A published component brings its
    own data and a title reads none, so neither shows it.
  */
  const withData =
    showingPreview &&
    preview!.shelf === "base" &&
    !preview!.def.accepts([]).ok;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {withData && (
        <div className="flex shrink-0 flex-col gap-1.5 rounded-lg border border-line bg-surface px-3 py-2">
          <button
            onClick={() => setStage("data")}
            className="flex items-center gap-2 text-left text-[12px] text-muted transition-colors hover:text-ink"
          >
            ‹ Data
            <span className="font-mono text-[10px] text-faint">
              {refs.length} selected
            </span>
          </button>
          <SelectionStrip
            selected={refs}
            onRemove={onToggle}
            onClear={onClear}
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface">
        {/*
          One pane, two states. The preview used to open as a second panel
          below the shelf, which left both of them short: a shelf you had to
          scroll past to reach the thing you were looking at, and a preview in
          the last third of the column. Choosing a component and judging it are
          consecutive, not simultaneous — so the preview takes the pane, and
          going back is one control in the same place the heading was.
        */}
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          {preview || group ? (
            <>
              <button
                onClick={toShelf}
                className="-ml-1 shrink-0 rounded px-1 font-mono text-[10px] tracking-[0.14em] text-faint uppercase transition-colors hover:text-ink"
              >
                ‹ {SHELF}
              </button>
              <span className="ml-auto truncate font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
                {preview ? preview.name : group?.name}
              </span>
            </>
          ) : (
            <>
              <span className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
                {SHELF}
              </span>
              {/*
                The domain at the row's far end. It narrows what is published,
                and it is the same value the explorer opens on — and it names
                itself, so it carries no label.
              */}
              <span className="ml-auto flex items-center">
                <DomainSelect
                  value={domain}
                  onChange={onDomainChange}
                  size="sm"
                  align="right"
                />
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
              setPreviewOpts((prev) => ({
                ...prev,
                [key]: value,
              }))
            }
            src={previewSrc(
              preview,
              previewOpts,
              previewRefs,
            )}
            frameKey={`${preview.shelf}:${preview.id}:${JSON.stringify(
              previewOpts,
            )}:${previewRefs.map((r) => r.schemaId + r.label).join("|")}`}
            frameRef={previewFrame}
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, "1");
              e.dataTransfer.effectAllowed = "copy";
              setDragged(true);
              setHint(false);
              // What lands is what was being looked at — settings, data, source.
              // Not its size: the page swaps in the shape's default, because the
              // preview is as wide as the panel so it can be judged, and a
              // dropped tile is one of several.
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
        ) : group ? (
          <GroupPane
            group={group}
            onDragStart={(e) => grabGroup(e, group)}
            onDragEnd={() => onDragStateChange(null)}
          />
        ) : (
          <div className="dr-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pt-2 pb-2">
            {/* ── The base shapes: chosen first, drawn on data chosen next ── */}
            <Section
              title="Components"
              note="click one, then pick its data"
            >
              {COMPONENTS.filter((c) => !c.sourceOnly).map((c) => (
                <Card
                  key={c.kind}
                  kind={c.kind}
                  title={c.name}
                  body={c.blurb}
                  onOpen={() => pickShape(c)}
                />
              ))}
            </Section>
            {/* ── Published: components, then wired groups ───────────────── */}
            <Section
              title="From the community"
              note="each brings its own data"
            >
              {published.map((c) => {
                const def = COMPONENTS.find((d) => d.kind === c.kind);
                if (!def) return null;
                return (
                  <Card
                    key={c.id}
                    kind={c.kind}
                    title={c.name}
                    body={c.blurb}
                    meta={c.author}
                    accent
                    onOpen={() =>
                      show(
                        {
                          id: c.id,
                          shelf: "community",
                          def,
                          name: c.name,
                          refs: c.refs,
                          layout: c.layout ?? DEFAULT_LAYOUT[c.kind],
                          custom: c.custom,
                        },
                        withDefaults(def, c.options),
                      )
                    }
                  />
                );
              })}
            </Section>
            <Section
              title="Wired groups"
              note="several tiles that answer each other, one drop"
            >
              {groups.map((g) => (
                <GroupCard
                  key={g.id}
                  group={g}
                  onOpen={() => showGroup(g)}
                />
              ))}
            </Section>
          </div>
        )}
      </div>

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
              Drag the ⠿ bar above the preview onto the
              screen to place it. The cards behind it only
              open it.
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
 * instead of the strip left over under three sections of cards. The pane reads
 * top to bottom into the thing it produces — settings, then the series they
 * shape, then the running component at the bottom, which is also the handle
 * you drag out and so sits nearest the screen it lands on.
 *
 * It is also the whole of editing a tile: `ComponentEditor` renders this same
 * pane, because building a component and changing one are the same activity
 * and two layouts for it made each other harder to learn. The one difference
 * is the gesture at the bottom — `onDragStart` present makes the preview the
 * drag handle (creating: the drop says where it lands); absent, the preview
 * is just the preview and the editor's own footer says keep-or-remove
 * (editing: the tile already has a place).
 */
export function PreviewPane({
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
  layersEditor,
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
  /**
   * Present when there is a drop to make — the create path. The handle is the
   * bar above the frame, so the widget's own rectangle is passed in rather
   * than read off `e.currentTarget`: what lands is the size of the thing that
   * was being looked at, and the bar is not that thing.
   */
  onDragStart?: (e: DragEvent, box: DOMRect) => void;
  onDragEnd?: () => void;
  /**
   * An editable stand-in for the read-only layer list, for the map in an
   * editing context — layers *are* a map's composition, so editing a map tile
   * means adding, removing and reordering them in place.
   */
  layersEditor?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pt-2.5 pb-3">
      {/*
        The words themselves, for the one shape whose setting is not a choice
        from a list. It rides in `options.text` undeclared, the way the
        per-series styles do, so every route carries it without learning it.
      */}
      {tunable && def.kind === "text" && (
        <input
          value={options.text ?? ""}
          onChange={(e) => onOption("text", e.target.value)}
          placeholder="Title"
          title="{pick} is replaced by the node picked on the tile this is wired to"
          className="w-full shrink-0 rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-accent"
        />
      )}
      {tunable && def.options.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {def.options.map((o) => (
            <label
              key={o.key}
              className="flex items-center gap-1 text-[10.5px] text-faint"
            >
              {o.label}
              <Select
                value={options[o.key] ?? o.fallback}
                onChange={(v) => onOption(o.key, v)}
                options={o.choices.map((ch) => ({
                  value: ch.value,
                  label: ch.label,
                }))}
                size="sm"
              />
            </label>
          ))}
        </div>
      )}

      {!live && (
        <p className="text-[11.5px] text-muted">{why}</p>
      )}

      {/*
        Between the settings and the preview: what the component is actually
        drawing, and how each one is drawn. Scrolls on its own — eight series
        and a short panel is a normal combination.

        A map's references are layers rather than series — nothing per-row to
        color or dash, since the measure's own scale paints the points and
        visibility and order live on the map's own legend — so it gets the list
        in the map's words instead.

        Frozen source is exempt for the same reason the selects above are: a
        refined component ignores its settings, so offering them would be a lie.
      */}
      {live && tunable && def.kind !== "text" && (
        <div className="dr-scroll min-h-0 flex-1 overflow-y-auto">
          {def.kind === "map" ? (
            (layersEditor ?? <MapLayers refs={refs} />)
          ) : (
            <SeriesStyles
              refs={refs}
              kind={def.kind}
              options={options}
              onChange={(series) =>
                onOption("series", series)
              }
            />
          )}
        </div>
      )}

      {live && (
        <div
          // At the bottom of the pane, under the settings and the series that
          // shape it — the controls read top to bottom into the thing they
          // produce, and the handle you drag out sits nearest the screen it is
          // dragged onto. `mt-auto` keeps it pinned there when what is above
          // runs short. A fixed height, not the rest of the pane: exactly the
          // shape's own preview height (the chart's worst-case budget, the
          // ticker's tile height), plus the grab bar when there is one. No
          // gutter — `naked` takes the document's padding and the tile's
          // alike, so the widget reaches all four edges and a box any taller
          // would be a band of empty ground under it.
          className={cx(
            "mt-auto flex shrink-0 flex-col overflow-hidden rounded-md bg-code",
            onDragStart
              ? "border border-accent"
              : "border border-line",
          )}
          style={{
            height:
              previewLayout(def.kind).h +
              (onDragStart ? GRAB_BAR : 0),
          }}
        >
          {/*
            The grab bar, and the reason it is a bar.

            What you drag is still what lands, so the accent border belongs to
            the whole box — but the *handle* cannot be the widget itself.
            Pointer events do not cross into an iframe, so the drag used to be
            caught by a transparent sheet over the frame, and that sheet
            swallowed everything else with it: a map could not be panned or
            zoomed, a chart could not be hovered, and the one label in the
            panel sat on top of the thing it was labelling.

            A strip above the frame is outside the component entirely. It is
            the only drag source, the frame below it is live, and the box is
            grown by the bar's own height rather than lending it the widget's.
          */}
          {onDragStart && (
            <div
              draggable
              onDragStart={(e) => {
                const box =
                  frameRef.current?.getBoundingClientRect();
                // No frame, no footprint — and a drag carrying no payload is
                // one that ends in nothing landing. Refuse it instead.
                if (!box) return e.preventDefault();
                onDragStart(e, box);
              }}
              onDragEnd={onDragEnd}
              title="Drag onto the page to place exactly what you see"
              className="flex shrink-0 cursor-grab items-center gap-1.5 border-b border-accent-line bg-accent-dim px-2 font-mono text-[9.5px] tracking-[0.08em] text-accent uppercase select-none active:cursor-grabbing"
              style={{ height: GRAB_BAR }}
            >
              <span aria-hidden="true">⠿</span>
              drag to place
            </div>
          )}

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
            className="w-full min-h-0 flex-1 border-0"
            title="Component preview"
          />
        </div>
      )}
    </div>
  );
}

/**
 * A map's references, listed as the layers they become.
 *
 * The series list is wrong here twice over: nothing per-row is choosable (the
 * measure's declared scale colors the points, so a color picker would be
 * overridden by the data), and "series" is not what anyone calls a set of
 * things on a map. Visibility and draw order are decided on the map itself —
 * its legend is the layer switch — so this list only says what will be there.
 */
function MapLayers({ refs }: { refs: DataRef[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/40 p-2">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
          Layers
        </span>
        <span className="ml-auto font-mono text-[9.5px] text-faint">
          {refs.length} on the map
        </span>
      </div>

      {refs.length === 0 ? (
        <p className="mt-1.5 text-[11.5px] text-muted">
          Nothing selected yet.
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {refs.map((r) => (
            <li
              key={r.schemaId + r.label}
              className="truncate rounded-md border border-line bg-surface px-2 py-1.5 text-[11.5px] text-ink"
            >
              {r.label}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1.5 font-mono text-[9.5px] leading-snug text-faint">
        visibility and draw order are set on the map itself,
        in its legend
      </p>
    </div>
  );
}

/**
 * A published group on the shelf: its shapes in stacking order, and who
 * published it. Same footprint and gesture as a component card; the glyphs
 * in a row are what say "several" at a glance.
 */
function GroupCard({
  group,
  onOpen,
}: {
  group: PublishedGroup;
  onOpen: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      title={group.blurb}
      className="min-w-0 cursor-pointer rounded-md border border-accent-line/60 bg-surface-2 px-2.5 py-2 text-left transition-colors outline-none hover:border-accent-line focus-visible:border-accent-line"
    >
      <div className="flex items-center gap-1.5">
        <span className="flex shrink-0 items-center gap-0.5">
          {group.members.map((m, i) => (
            <Glyph key={i} kind={m.kind} on />
          ))}
        </span>
        <span className="truncate text-[12px] font-medium text-ink">
          {group.name}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-faint">
        {group.blurb}
      </p>
      <p className="mt-0.5 truncate font-mono text-[9px] tracking-[0.08em] text-faint uppercase">
        {group.author} · ⌁ {group.members.length}
      </p>
    </div>
  );
}

/**
 * A published group, open in the shelf's place.
 *
 * Names rather than live previews, for the reason the wires strip gives:
 * N frames compiling to read a list is N compiles, and what is being judged
 * here is which components in what order. The whole list is the drag handle
 * — a group lands as one piece, so there is one thing to pick up.
 */
function GroupPane({
  group,
  onDragStart,
  onDragEnd,
}: {
  group: PublishedGroup;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
}) {
  // The tile the others point at, if anything points at anything.
  const source =
    group.members.find((m) => m.wireTo !== undefined)?.wireTo ?? -1;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pt-2.5 pb-3">
      <p className="text-[11.5px] leading-snug text-muted">{group.blurb}</p>
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title="Drag onto the screen to place the whole group"
        className="dr-scroll mt-auto flex min-h-0 cursor-grab flex-col overflow-y-auto rounded-md border border-accent bg-accent-dim select-none active:cursor-grabbing"
      >
        <span
          className="sticky top-0 flex shrink-0 items-center gap-1.5 border-b border-accent-line bg-accent-dim px-2 font-mono text-[9.5px] tracking-[0.08em] text-accent uppercase"
          style={{ height: GRAB_BAR }}
        >
          <span aria-hidden="true">⠿</span>
          drag to place
        </span>
        <span className="flex flex-col gap-1 p-2">
          {group.members.map((m, i) => {
            const def = COMPONENTS.find((d) => d.kind === m.kind);
            const data =
              m.refs.map((r) => r.label).join(" · ") || "no data";
            const isSource = i === source;
            return (
              <span
                key={i}
                className={cx(
                  "flex items-center gap-2 rounded border px-2 py-1.5",
                  isSource
                    ? "border-accent-line bg-surface"
                    : "border-line bg-surface",
                )}
              >
                <Glyph kind={m.kind} on={isSource} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12px] font-medium text-ink">
                      {def?.name ?? m.kind}
                    </span>
                    {isSource && (
                      <span className="shrink-0 rounded border border-accent-line px-1 font-mono text-[9px] tracking-[0.08em] text-accent uppercase">
                        source
                      </span>
                    )}
                    {m.wireTo !== undefined && (
                      <span className="shrink-0 rounded border border-accent-line bg-accent-dim px-1 font-mono text-[9px] tracking-[0.08em] text-accent uppercase">
                        ⌁ follows {m.wireTo + 1}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[10.5px] text-muted">
                    {data}
                  </span>
                </span>
              </span>
            );
          })}
        </span>
      </div>
    </div>
  );
}

/** One heading and the cards under it. */
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
      <div className="mt-1.5 grid auto-rows-min grid-cols-2 gap-2">
        {children}
      </div>
    </div>
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
  accent,
  onOpen,
  onDelete,
}: {
  kind: ComponentKind;
  title: string;
  body: string;
  /** A word about where it came from — an author, or that it was refined. */
  meta?: string;
  /** Saved and published components wear the accent; the base shapes do not. */
  accent?: boolean;
  onOpen: () => void;
  /** Saved components can leave the shelf; shapes and published ones cannot. */
  onDelete?: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      title={body}
      className={cx(
        "min-w-0 cursor-pointer rounded-md border bg-surface-2 px-2.5 py-2 text-left transition-colors outline-none hover:border-accent-line focus-visible:border-accent-line",
        accent ? "border-accent-line/60" : "border-line",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Glyph kind={kind} on={Boolean(accent)} />
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
function Glyph({
  kind,
  on,
}: {
  kind: ComponentKind;
  on: boolean;
}) {
  const stroke = on
    ? "var(--color-accent)"
    : "var(--color-muted)";
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
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r="1.1"
              fill={stroke}
            />
          ))}
        </>
      )}
      {kind === "bar" && (
        <>
          <path
            d="M2.5 11.5 V7"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M7 11.5 V2.5"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M11.5 11.5 V5"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
      {kind === "heatmap" && (
        <>
          {[2, 6.5, 11].flatMap((x) =>
            [2, 6.5, 11].map((y) => (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y - 1}
                width="3"
                height="3"
                rx="0.5"
                fill={stroke}
                opacity={(x + y) / 20}
              />
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
      {kind === "text" && (
        <path
          d="M2.5 3.5 H11.5 M7 3.5 V11.5"
          stroke={stroke}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      )}
      {kind === "picker" && (
        <>
          <circle
            cx="6"
            cy="6"
            r="3.8"
            stroke={stroke}
            strokeWidth="1.3"
          />
          <path
            d="M8.8 8.8 L12.5 12.5"
            stroke={stroke}
            strokeWidth="1.4"
            strokeLinecap="round"
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
          <path
            d="M5 2 V10.5 M9 3.5 V12"
            stroke={stroke}
            strokeWidth="1.1"
          />
        </>
      )}
    </svg>
  );
}
