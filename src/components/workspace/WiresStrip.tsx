"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { cx } from "@/components/ui";
import {
  COMPONENTS,
  DEFAULT_LAYOUT,
  GRID,
  componentDef,
  emitsPicks,
  followable,
  withDefaults,
  type ComponentKind,
  type ComponentSpec,
} from "@/lib/workspace/components";
import {
  schemaById,
  streamRef,
  type DataRef,
} from "@/lib/workspace/catalog";
import { SERIES_PALETTE } from "@/lib/workspace/palette";
import { useTheme } from "@/lib/useTheme";
import {
  DRAG_TYPE,
  WIRE_SLOTS,
  nextWireSlot,
  type StagedComponent,
  type TrayPayload,
} from "./BuildPanel";

/**
 * The strip under the screen: the groups of components wired together on this
 * page, the one you are looking at, and the widget that lands.
 *
 * A wire is stored on the receiver as its `follow` option — the source tile's
 * index — which is what makes it replayable like every other setting, and a
 * group is simply every tile pointing at one source. So the list here is read
 * back out of the manifest rather than kept anywhere: nothing can go stale
 * against the page it describes.
 *
 * **The whole box is the drop target**, and the whole box is what lights up.
 * An inset dashed rectangle drew a second, smaller target inside the one
 * someone was already aiming at — and being the only thing that highlighted,
 * it claimed the strip's spare room was not droppable when it was.
 *
 * The topbar says what the strip holds and carries the one action that makes
 * something new. It used to be a pair of tabs — wires and the community shelf
 * taking turns — and a hint line explaining the gesture; a toggle between two
 * unrelated jobs is a control you have to read before you can use either.
 */
export function WiresStrip({
  onDragStateChange,
  placedTick = 0,
  manifest,
  onConnect,
  carrying,
  onStaged,
  marked = [],
  onMarkedChange,
}: {
  onDragStateChange: (payload: TrayPayload | null) => void;
  /** Bumped by the page each time a staged group lands on the screen. */
  placedTick?: number;
  /** The page's manifest, for wiring. Absent on a model-edited page. */
  manifest?: ComponentSpec[];
  /** Set (or clear, with null) the wire on one tile, by slot. */
  onConnect?: (
    target: number,
    source: number | null,
    color?: string,
  ) => Promise<void> | void;
  /** Whatever drag is in flight right now — the strip is a drop target. */
  carrying?: TrayPayload | null;
  /** A drop landed in the strip — the page resets its panel on this. */
  onStaged?: () => void;
  /**
   * Tiles shift-clicked on the screen, by slot, in click order. The page owns
   * the list because the frame has to be told which tiles to ring; the strip
   * folds them into its draft.
   */
  marked?: number[];
  onMarkedChange?: (marked: number[]) => void;
}) {
  /**
   * The draft's members. They live here rather than in the pane because the
   * drop target is the whole strip, and so does the open group, because the
   * topbar's button is what starts a new one.
   */
  const [staged, setStaged] = useState<StagedItem[]>([]);
  const seq = useRef(0);
  const [overBox, setOverBox] = useState(false);
  /**
   * Whether a new group is being built. It is what lights the boundary: the
   * box says it will take a drop because somebody asked it to, rather than
   * because something happens to be in flight over it.
   */
  const [drafting, setDrafting] = useState(false);
  const [pick, setPick] = useState<string | null>(null);

  // A component can be staged whenever a single one is being carried — a
  // staged group dragged back over its own strip is not a new member.
  const accepts = Boolean(carrying && !carrying.group);

  function stageDrop(e: DragEvent) {
    e.preventDefault();
    setOverBox(false);
    if (!carrying || carrying.group) return;
    setStaged((prev) => [
      ...prev,
      {
        // A stable id, because the group is a list of ids: indexing the pool
        // by position re-aims every selection the moment one item is removed.
        id: `d${++seq.current}`,
        kind: carrying.kind,
        options: carrying.options,
        custom: carrying.custom,
        refs: carrying.refs,
        layout: { w: carrying.layout.w, h: carrying.layout.h },
      },
    ]);
    // A drop opens a draft if there was none — the button is the way in, not
    // the only way in.
    setDrafting(true);
    setPick("draft");
    // Cleared here, not left to the source's dragend: staging resets the
    // panel, which unmounts the drag's source, and a removed source's
    // dragend is not guaranteed — the same reason the canvas drop clears
    // the payload itself.
    onDragStateChange(null);
    onStaged?.();
  }

  function newGroup() {
    // Tiles already marked on the screen are what the group starts with;
    // only the previews dropped into an earlier draft are cleared.
    setStaged((prev) => prev.filter((x) => x.slot !== undefined));
    setDrafting(true);
    setPick("draft");
  }

  /*
    The marked tiles are members of the draft, kept in step with the page's
    list: a tile shift-clicked joins at the end, one shift-clicked again (or
    taken out here) leaves. Keyed on the slots rather than the array, which
    the page hands over fresh on every render. The manifest is read through a
    ref for the same reason — it only has to be current at the moment a tile
    is added, and a save must not re-run the sync.
  */
  const specs = useRef(manifest);
  specs.current = manifest;
  const markedKey = marked.join(",");
  useEffect(() => {
    const slots = markedKey ? markedKey.split(",").map(Number) : [];
    setStaged((prev) => {
      const kept = prev.filter(
        (x) => x.slot === undefined || slots.includes(x.slot),
      );
      const have = new Set(kept.map((x) => x.slot));
      const added = slots
        .filter((s) => !have.has(s) && specs.current?.[s])
        .map((s) => {
          const spec = specs.current![s];
          return {
            id: `s${s}`,
            slot: s,
            kind: spec.kind,
            options: spec.options,
            custom: spec.custom,
            refs: spec.refs,
            layout: {
              w: spec.layout?.w ?? DEFAULT_LAYOUT[spec.kind].w,
              h: spec.layout?.h ?? DEFAULT_LAYOUT[spec.kind].h,
            },
          };
        });
      return added.length === 0 && kept.length === prev.length
        ? prev
        : [...kept, ...added];
    });
    // Two tiles marked is a group whether or not anyone pressed the button:
    // there is nothing else two shift-clicks could mean.
    if (slots.length >= 2) {
      setDrafting(true);
      setPick("draft");
    }
  }, [markedKey]);

  /**
   * A landed group is a record now. The draft that made it goes away rather
   * than standing beside its own result saying "draft" — the same thing
   * listed twice, one of them a lie about not existing yet. The pick goes
   * with it so the list opens the newest group, which is the one that landed.
   */
  const placed = useRef(placedTick);
  useEffect(() => {
    if (placedTick === placed.current) return;
    placed.current = placedTick;
    setStaged([]);
    setDrafting(false);
    setPick(null);
    onMarkedChange?.([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the tick is the trigger
  }, [placedTick]);

  return (
    <div
      onDragOver={(e) => {
        if (!accepts) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOverBox(true);
      }}
      onDragLeave={(e) => {
        // `dragleave` fires at every child boundary inside the box, so the
        // only leave that counts is one whose destination is outside it.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setOverBox(false);
      }}
      onDrop={stageDrop}
      className={cx(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-surface transition-colors",
        overBox && accepts
          ? "border-accent ring-2 ring-accent/45"
          : drafting || accepts
            ? "border-accent-line ring-1 ring-accent/30"
            : "border-line",
      )}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">
          Components wired in a group on this page
        </span>
        {/*
          The one action the strip has, at the end of the bar that names what
          it acts on. In the list it was a row among the groups it makes,
          which put "start something" and "open that thing" in the same
          column reading as the same kind of thing.
        */}
        <button
          onClick={newGroup}
          className={cx(
            "flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
            drafting
              ? "border-accent bg-accent-dim text-accent"
              : accepts
                ? "border-accent-line text-accent"
                : "border-line text-muted hover:border-accent-line hover:text-accent",
          )}
        >
          <span aria-hidden="true">+</span>
          {drafting
            ? "building — drop previews in, or ⇧-click tiles"
            : accepts
              ? // A drop with no draft opens one, so the button says what a
                // release would do rather than standing there unexplained.
                "drop it to start a group"
              : "new wired group"}
        </button>
      </div>

      <WiresPane
        manifest={manifest}
        onConnect={onConnect}
        staged={staged}
        setStaged={setStaged}
        nextId={() => `d${++seq.current}`}
        drafting={drafting}
        setDrafting={setDrafting}
        pick={pick}
        setPick={setPick}
        over={overBox && accepts}
        onDragStateChange={onDragStateChange}
        marked={marked}
        onMarkedChange={onMarkedChange}
      />
    </div>
  );
}

/**
 * One staged drop, with an id of its own.
 *
 * The draft is addressed by id rather than by position: indexing into it
 * would silently re-aim every reference the moment somebody removed a member
 * above it.
 */
export type StagedItem = StagedComponent & {
  id: string;
  /** Its manifest slot, when it was shift-clicked off the screen. */
  slot?: number;
};

/** Any component, named the way its card was: kind, then its data. */
function itemName(m: {
  kind: ComponentKind;
  custom?: { name: string };
  refs?: DataRef[];
}): { kind: string; data: string } {
  return {
    kind:
      m.custom?.name ??
      COMPONENTS.find((d) => d.kind === m.kind)?.name ??
      m.kind,
    data: (m.refs ?? []).map((r) => r.label).join(" · ") || "no data",
  };
}

/**
 * A glyph per shape, so a list of names is scannable by silhouette as well as
 * by reading. Cheap on purpose — a column of live frames is a column of
 * compiles, and the thing being chosen here is which component, not what it
 * looks like today.
 */
const GLYPH: Partial<Record<ComponentKind, string>> = {
  chart: "∿",
  scatter: "⁘",
  bar: "▮",
  heatmap: "▩",
  ticker: "●",
  table: "▤",
  map: "◎",
  picker: "⌕",
};

/** One component inside a group. */
interface Part {
  /** Stable within its group, for keys and for removing a draft member. */
  key: string;
  kind: ComponentKind;
  options?: Record<string, string>;
  custom?: { name: string; code: string };
  refs?: DataRef[];
  layout: { w: number; h: number };
  /** Its manifest slot, when it came off the screen. */
  slot?: number;
}

/**
 * A wired group: several components that answer each other.
 *
 * Either one that exists on the screen — a tile every other one follows — or
 * the draft being assembled by dropping previews onto the strip. They are
 * listed together because they are the same object at two ages.
 */
interface WireGroup {
  id: string;
  origin: "wire" | "draft";
  parts: Part[];
  /** The palette slot the pair wears on the launched screen. */
  colorSlot?: number;
  /** The manifest slots of the source and everything following it. */
  wireSlots?: { source: number; followers: number[] };
}

function partOf(spec: ComponentSpec, slot: number): Part {
  return {
    key: `t${slot}`,
    kind: spec.kind,
    options: spec.options,
    custom: spec.custom,
    refs: spec.refs,
    layout: {
      w: spec.layout?.w ?? DEFAULT_LAYOUT[spec.kind].w,
      h: spec.layout?.h ?? DEFAULT_LAYOUT[spec.kind].h,
    },
    slot,
  };
}

/** A group, said in one line: the shapes it holds, in order. */
const groupLabel = (g: WireGroup) =>
  g.parts.map((x) => itemName(x).kind).join(" → ") ||
  "empty";

/** …and what it draws, deduped, because a wire often shares a stream. */
const groupData = (g: WireGroup) =>
  [
    ...new Set(
      g.parts
        .map((x) => itemName(x).data)
        .filter((d) => d !== "no data"),
    ),
  ].join(" · ") || "no data";

/**
 * The wiring pane: the wired groups on this screen, the one you are looking
 * at, and the widget that lands.
 *
 * Left is the **list of groups** — every set of tiles on the screen that
 * answers each other, one row each, plus the draft while one is being built.
 * It is a single selection, not a multi-select: a group is a thing you open,
 * the way you open a file, and the two columns beside it are that one group
 * being read and changed.
 *
 * A new group starts from **New wired group**, which arms the boundary: the
 * whole strip lights, and running previews dropped anywhere on it join the
 * draft in the order they land. Every chart and ticker follows the first
 * source in it — computed, not stored, so reordering re-derives it rather
 * than leaving a stale index behind. **The source is set in the draft**: a
 * map dropped or marked in counts, and otherwise the draft offers the two
 * kinds of source over the stream its members read — a map, or a search over
 * the stream's own names — and adds the one chosen at the top of the stack.
 * The search exists only this way (`sourceOnly`): alone it is a box nothing
 * hears. Right is the **widget**: the group named as a list, and the only
 * thing in the pane that can be dragged onto the screen.
 *
 * **There is no Connect control.** Two selects and a button asked somebody to
 * name two tiles by number and then assert a relationship between them; a
 * group says the same thing by what is in it and in what order.
 */
function WiresPane({
  manifest,
  onConnect,
  staged,
  setStaged,
  nextId,
  drafting,
  setDrafting,
  pick,
  setPick,
  over,
  onDragStateChange,
  marked,
  onMarkedChange,
}: {
  manifest?: ComponentSpec[];
  onConnect?: (
    target: number,
    source: number | null,
    color?: string,
  ) => Promise<void> | void;
  staged: StagedItem[];
  setStaged: Dispatch<SetStateAction<StagedItem[]>>;
  /** A fresh id for a member the pane adds itself — the source it sets. */
  nextId: () => string;
  /** A new group is being assembled. */
  drafting: boolean;
  setDrafting: Dispatch<SetStateAction<boolean>>;
  /** The open group, held by the strip because its topbar starts new ones. */
  pick: string | null;
  setPick: Dispatch<SetStateAction<string | null>>;
  /** A stageable drag is currently over the strip. */
  over: boolean;
  onDragStateChange: (payload: TrayPayload | null) => void;
  marked: number[];
  onMarkedChange?: (marked: number[]) => void;
}) {
  const specs = manifest ?? [];
  const [busy, setBusy] = useState(false);
  const palette = SERIES_PALETTE[useTheme()];

  // Who follows whom on the screen right now: a source slot, and every tile
  // pointed at it. One entry is one wired group.
  const followers = new Map<number, number[]>();
  specs.forEach((s, i) => {
    const n = Number(s.options?.follow);
    if (!Number.isInteger(n) || n < 0 || !specs[n]) return;
    followers.set(n, [...(followers.get(n) ?? []), i]);
  });

  const wires: WireGroup[] = [...followers.entries()].map(
    ([src, fs]) => {
      const slot = Number(specs[fs[0]].options?.wireColor);
      return {
        id: `w${src}`,
        origin: "wire",
        parts: [
          partOf(specs[src], src),
          ...fs.map((f) => partOf(specs[f], f)),
        ],
        colorSlot:
          Number.isInteger(slot) && slot >= 1 && slot <= 8
            ? slot
            : undefined,
        wireSlots: { source: src, followers: fs },
      };
    },
  );

  const draft: WireGroup | null = drafting
    ? {
        id: "draft",
        origin: "draft",
        parts: staged.map((m) => ({
          key: m.id,
          kind: m.kind,
          options: m.options,
          custom: m.custom,
          refs: m.refs,
          layout: m.layout,
          slot: m.slot,
        })),
      }
    : null;

  const groups = [...(draft ? [draft] : []), ...wires];
  // Nothing picked opens the last group: after a placement that is the one
  // that just landed, which is what somebody is looking for. Before any pick
  // at all, one end of the list is as arbitrary as the other.
  const open =
    groups.find((g) => g.id === pick) ??
    draft ??
    groups.at(-1) ??
    null;

  /**
   * Who each part of the open group follows, as a position in its own parts.
   *
   * An existing wire already knows — its first part is the tile the others
   * point at. A draft applies the rule that makes dropping a source and a
   * chart one after another enough on its own. A source is anything that
   * emits picks: a map, by clicking a node, or a search, by choosing one out
   * of the stream's own names.
   */
  const firstSource = open ? open.parts.findIndex(emitsPicks) : -1;
  /**
   * The one stream every part reads, if there is one. A source drives its
   * followers by naming an entity, and a name out of one stream means
   * nothing to a tile reading another — so this is what a source can be
   * offered over, and its absence is why one cannot.
   */
  const streams = new Set(
    (open?.parts ?? []).flatMap((p) =>
      (p.refs ?? []).map((r) => r.schemaId),
    ),
  );
  const oneStream =
    streams.size === 1 ? schemaById([...streams][0]) : undefined;
  /**
   * The two kinds of source, each as the component it would add over that
   * stream. The map answers to its own `accepts` — a stream nothing places
   * cannot be a map, and the button says so in the map's words.
   */
  const sources = (["map", "picker"] as const).map((kind) => {
    const def = componentDef(kind)!;
    const refs = oneStream ? [streamRef(oneStream)] : [];
    const verdict = oneStream
      ? def.accepts(refs)
      : { ok: false, why: "Everything in the group has to read one stream." };
    return { kind, def, refs, verdict };
  });

  /** Put the chosen source at the top of the draft; the rule wires the rest. */
  function setSource(kind: "map" | "picker") {
    const src = sources.find((x) => x.kind === kind);
    if (!src || !src.verdict.ok) return;
    setStaged((prev) => [
      {
        id: nextId(),
        kind,
        options: withDefaults(src.def),
        refs: src.refs,
        layout: { ...DEFAULT_LAYOUT[kind] },
      },
      ...prev,
    ]);
  }
  const wiring = (open?.parts ?? []).map((p, i) => {
    if (open?.origin === "wire")
      return i === 0 ? undefined : 0;
    return firstSource !== -1 &&
      i !== firstSource &&
      followable({
        kind: p.kind,
        options: p.options,
        custom: p.custom,
        refs: p.refs ?? [],
      })
      ? firstSource
      : undefined;
  });

  function discardDraft() {
    setStaged([]);
    setDrafting(false);
    setPick(null);
    onMarkedChange?.([]);
  }

  /** Take one member out: a marked tile leaves the page's list, a drop leaves ours. */
  function dropMember(p: Part) {
    if (p.slot !== undefined)
      onMarkedChange?.(marked.filter((s) => s !== p.slot));
    else setStaged((prev) => prev.filter((x) => x.id !== p.key));
  }

  const moveMember = (i: number, by: number) =>
    setStaged((prev) => {
      const j = i + by;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // The next palette slot after the wires already on the page, so two groups
  // never arrive wearing the same color by default.
  const nextSlot = String(WIRE_SLOTS[followers.size % WIRE_SLOTS.length]);

  function grabGroup(e: DragEvent) {
    if (!open || open.parts.length === 0) return;
    e.dataTransfer.setData(DRAG_TYPE, "1");
    e.dataTransfer.effectAllowed = "copy";
    const color =
      open.colorSlot !== undefined
        ? String(open.colorSlot)
        : nextSlot;
    onDragStateChange({
      kind: open.parts[0].kind,
      layout: {
        w: Math.max(...open.parts.map((p) => p.layout.w)),
        h:
          open.parts.reduce((a, p) => a + p.layout.h, 0) +
          (open.parts.length - 1) * GRID.gap,
      },
      group: open.parts.map((p, i) => {
        const to = wiring[i];
        return {
          kind: p.kind,
          custom: p.custom,
          refs: p.refs,
          layout: p.layout,
          wireTo: to,
          options:
            to !== undefined
              ? { ...(p.options ?? {}), wireColor: color }
              : p.options,
        };
      }),
    });
  }

  /*
    A draft made of tiles already on the screen does not land — it is wired
    where it stands, one replace-in-slot write per follower, the same path an
    existing group's color and unlink go down. A draft of dropped previews
    still lands as one drop. A draft of both has no single act that finishes
    it (the previews do not exist yet, so nothing on the screen can follow
    them), so the widget says so rather than doing half.
  */
  const onScreen =
    open?.origin === "draft"
      ? open.parts.filter((p) => p.slot !== undefined)
      : [];
  const mixed =
    open?.origin === "draft" &&
    onScreen.length > 0 &&
    onScreen.length < open.parts.length;
  const wireable =
    open?.origin === "draft" &&
    !mixed &&
    onScreen.length > 0 &&
    firstSource !== -1 &&
    wiring.some((w) => w !== undefined);

  async function wireDraft() {
    if (!open || !onConnect || busy || !wireable) return;
    const src = open.parts[firstSource]?.slot;
    if (src === undefined) return;
    // A source that already has followers is already a group with a color;
    // a tile joining it wears that color, not the next one, or the map ends
    // up bordered in one blue beside a chart in another.
    const joined = wires.find((w) => w.wireSlots?.source === src);
    const color =
      joined?.colorSlot !== undefined ? String(joined.colorSlot) : nextSlot;
    setBusy(true);
    try {
      for (let i = 0; i < open.parts.length; i++) {
        const slot = open.parts[i].slot;
        if (wiring[i] === undefined || slot === undefined) continue;
        await onConnect(slot, src, color);
      }
      // The wire now reads back out of the manifest as a real group, and the
      // draft that made it would only stand beside it saying "draft".
      discardDraft();
    } finally {
      setBusy(false);
    }
  }

  /** One wire's worth of writes: every follower, in turn. */
  async function reWire(
    g: WireGroup,
    to: number | null,
    color?: string,
  ) {
    if (!onConnect || busy || !g.wireSlots) return;
    setBusy(true);
    try {
      for (const f of g.wireSlots.followers)
        await onConnect(f, to, color);
    } finally {
      setBusy(false);
    }
  }

  /*
    Nothing wired and nothing being built: one placeholder, not three empty
    columns. Headings over nothing are a structure to work out before you can
    read that it holds nothing — GROUPS 0 · COMPONENTS 0 · WIDGET asks
    somebody to learn the pane in order to be told it is empty.
  */
  if (groups.length === 0)
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
        <span
          aria-hidden="true"
          className={cx(
            "font-mono text-[15px] transition-colors",
            over ? "text-accent" : "text-faint",
          )}
        >
          ⌁
        </span>
        <p
          className={cx(
            "text-[12.5px] transition-colors",
            over ? "text-accent" : "text-muted",
          )}
        >
          {over
            ? "Release to start a group with it"
            : marked.length === 1
              ? "One tile marked — shift-click another to start a group with both"
              : "Nothing here yet"}
        </p>
        <p className="max-w-[52ch] text-[11px] leading-relaxed text-faint">
          Wire components together and they answer each other — clicking a node
          on a map retargets the charts beside it. Shift-click two tiles on the
          screen, or start a group above and drag running previews onto this
          box.
        </p>
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 gap-2.5 px-3 py-2.5">
      {/*
        ── The groups on this screen ──────────────────────────────────────
        A wired set is one row, because that is what it is. One selection at
        a time: the columns beside it are this group being read, so two of
        them open at once would be two answers to the question the pane is
        asking.
      */}
      <Column
        title="groups"
        count={groups.length}
        hint={over ? "release to add it" : undefined}
      >
        {groups.length === 0 ? (
          <p className="px-0.5 text-[11px] leading-relaxed text-faint">
            Nothing on this screen is wired yet. Start a
            group, then drag running previews onto this box
            to fill it.
          </p>
        ) : (
          groups.map((g) => {
            const on = open?.id === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setPick(g.id)}
                aria-pressed={on}
                className={cx(
                  "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
                  on
                    ? "border-accent-line bg-accent-dim"
                    : "border-line bg-surface-2 hover:border-line-strong",
                )}
              >
                <span
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 rounded-full ring-1 ring-line"
                  style={{
                    background:
                      g.origin === "draft"
                        ? "transparent"
                        : g.colorSlot !== undefined
                          ? palette[
                              (g.colorSlot - 1) %
                                palette.length
                            ]
                          : "var(--color-accent)",
                    borderStyle:
                      g.origin === "draft"
                        ? "dashed"
                        : undefined,
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-ink">
                    {g.origin === "draft" &&
                    g.parts.length === 0
                      ? "New group"
                      : groupLabel(g)}
                  </span>
                  <span className="block truncate text-[10.5px] text-muted">
                    {g.origin === "draft" &&
                    g.parts.length === 0
                      ? "waiting for its first component"
                      : groupData(g)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[9px] tracking-[0.08em] text-faint uppercase">
                  {g.origin === "draft"
                    ? "draft"
                    : `⌁ ${g.parts.length}`}
                </span>
              </button>
            );
          })
        )}
      </Column>

      {/*
        ── The open group ─────────────────────────────────────────────────
        What it holds, in stacking order, with the wiring written on the rows
        rather than asserted anywhere. A draft is arranged here; a wire that
        exists is read here, and its two real controls — the color it wears
        on the launched screen and the cut — sit under it.
      */}
      <Column
        title={
          open?.origin === "draft"
            ? "building"
            : "components"
        }
        count={open?.parts.length ?? 0}
        rule
      >
        {!open ? (
          <p className="px-0.5 text-[11px] leading-relaxed text-faint">
            Pick a wired group on the left to look at it, or
            start a new one.
          </p>
        ) : open.parts.length === 0 ? (
          <p className="px-0.5 text-[11px] leading-relaxed text-faint">
            Shift-click tiles on the screen, or drag a running preview
            anywhere onto this box. They stack in the order they arrive, and
            every chart and ticker follows the group&rsquo;s source — a map,
            or a search over the stream&rsquo;s own names, set here once
            there is something for it to drive.
          </p>
        ) : (
          <>
            {open.parts.map((p, i) => {
              const n = itemName(p);
              const to = wiring[i];
              const isSource =
                i === firstSource ||
                (open.origin === "wire" && i === 0);
              return (
                <div
                  key={p.key}
                  className={cx(
                    "flex items-center gap-2 rounded-md border px-2 py-1.5",
                    isSource && open.parts.length > 1
                      ? "border-accent-line bg-accent-dim"
                      : "border-line bg-surface-2",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="grid h-5 w-5 shrink-0 place-items-center rounded bg-surface-3 font-mono text-[11px] text-muted"
                  >
                    {GLYPH[p.kind] ?? "◆"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12px] font-medium text-ink">
                        {n.kind}
                      </span>
                      {isSource &&
                        open.parts.length > 1 && (
                          <span className="shrink-0 rounded border border-accent-line px-1 font-mono text-[9px] tracking-[0.08em] text-accent uppercase">
                            source
                          </span>
                        )}
                      {to !== undefined && (
                        <span className="shrink-0 rounded border border-accent-line bg-accent-dim px-1 font-mono text-[9px] tracking-[0.08em] text-accent uppercase">
                          ⌁ follows {to + 1}
                        </span>
                      )}
                      {p.slot !== undefined && (
                        <span className="shrink-0 font-mono text-[9px] tracking-[0.08em] text-faint uppercase">
                          slot {p.slot + 1}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[10.5px] text-muted">
                      {n.data}
                    </span>
                  </span>
                  {/* A draft is arranged; a wire on the screen is read. */}
                  {open.origin === "draft" && (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button
                        onClick={() => moveMember(i, -1)}
                        disabled={i === 0}
                        aria-label="Move up the stack"
                        className="grid h-5 w-5 place-items-center rounded text-[11px] text-muted transition-colors hover:bg-surface-3 hover:text-accent disabled:opacity-25 disabled:hover:bg-transparent"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveMember(i, 1)}
                        disabled={
                          i === open.parts.length - 1
                        }
                        aria-label="Move down the stack"
                        className="grid h-5 w-5 place-items-center rounded text-[11px] text-muted transition-colors hover:bg-surface-3 hover:text-accent disabled:opacity-25 disabled:hover:bg-transparent"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => dropMember(p)}
                        aria-label="Take out of the group"
                        className="grid h-5 w-5 place-items-center rounded text-[11px] text-muted transition-colors hover:bg-surface-3 hover:text-fail"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </div>
              );
            })}

            {/*
              A group with nothing driving it is the one state the auto-wiring
              cannot fix by itself, so the draft asks: a map over the stream
              the members read, or a search over its names. Either is added
              at the top of the stack and the rule does the rest. A draft of
              tiles already on the screen cannot take one — the source would
              not exist yet, and nothing on the screen can follow a preview —
              so that draft is told to mark a source instead.
            */}
            {open.origin === "draft" && firstSource === -1 && (
              <div className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1.5">
                <span className="text-[11px] leading-relaxed text-faint">
                  {onScreen.length > 0
                    ? "Nothing here drives the others. Shift-click a map on the screen to make it the source."
                    : oneStream
                      ? "Set the source — what the others follow:"
                      : "Nothing here drives the others, and a source needs every member reading one stream."}
                </span>
                {onScreen.length === 0 && oneStream && (
                  <span className="flex flex-wrap gap-1.5">
                    {sources.map(({ kind, def, verdict }) => (
                      <button
                        key={kind}
                        onClick={() => setSource(kind)}
                        disabled={!verdict.ok}
                        title={verdict.ok ? def.blurb : verdict.why}
                        className="flex items-center gap-1.5 rounded-md border border-accent-line bg-accent-dim px-2 py-1 font-mono text-[10px] tracking-[0.08em] text-accent uppercase transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-faint"
                      >
                        <span aria-hidden="true">{GLYPH[kind]}</span>
                        {def.name}
                      </button>
                    ))}
                  </span>
                )}
              </div>
            )}

            {open.origin === "draft" ? (
              <button
                onClick={discardDraft}
                className="self-start rounded px-1 font-mono text-[10px] text-faint transition-colors hover:text-fail"
              >
                discard this group
              </button>
            ) : (
              <div className="mt-0.5 flex items-center gap-2">
                {/*
                  The color both tiles wear on the launched screen. Clicking
                  cycles the palette, because a swatch this small is a control
                  you press, not a picker you open; painted from the host's own
                  copy, since the frame's tokens do not exist out here.
                */}
                <button
                  onClick={() =>
                    void reWire(
                      open,
                      open.wireSlots!.source,
                      String(nextWireSlot(open.colorSlot)),
                    )
                  }
                  disabled={busy}
                  title="Border color on the launched screen — click to change"
                  className="flex items-center gap-1.5 rounded border border-line bg-surface-2 px-1.5 py-1 font-mono text-[9.5px] tracking-[0.08em] text-muted uppercase transition-colors hover:text-ink"
                >
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 rounded-full ring-1 ring-line"
                    style={{
                      background:
                        open.colorSlot !== undefined
                          ? palette[
                              (open.colorSlot - 1) %
                                palette.length
                            ]
                          : "var(--color-accent)",
                    }}
                  />
                  color
                </button>
                {/*
                  Unlinking is not deleting: it removes the connection and
                  leaves both components exactly where they are. The button
                  says which of the two it is, because the other reading is
                  the one somebody would be afraid of.
                */}
                <button
                  onClick={() => void reWire(open, null)}
                  disabled={busy}
                  title="Remove the connection — the components stay on the screen"
                  className="rounded border border-line bg-surface-2 px-1.5 py-1 font-mono text-[9.5px] tracking-[0.08em] text-muted uppercase transition-colors hover:border-fail-line hover:text-fail"
                >
                  {busy ? "…" : "⌁ unlink"}
                </button>
                <span className="min-w-0 flex-1 truncate text-[10px] text-faint">
                  the components stay on the screen
                </span>
              </div>
            )}
          </>
        )}
      </Column>

      {/*
        ── The widget ─────────────────────────────────────────────────────
        The open group as the thing that lands, and the only drag handle in
        the pane. Names rather than a live preview on purpose: N frames
        compiling behind a column somebody is scanning is N compiles to read a
        list, and what is being judged here is which components in what order
        — each one was previewed on its way in.
      */}
      <div className="flex w-[210px] shrink-0 flex-col gap-1.5 border-l border-line pl-2.5">
        <span className="font-mono text-[10px] tracking-[0.08em] text-faint uppercase">
          widget
        </span>
        {!open || open.parts.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-line px-3 text-center text-[11px] leading-relaxed text-faint">
            A group lands as one piece. Open one and drag it
            from here.
          </div>
        ) : mixed ? (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-line px-3 text-center text-[11px] leading-relaxed text-faint">
            A group is tiles already on the screen, or previews
            dropped here — not both at once. Take one kind out.
          </div>
        ) : onScreen.length > 0 ? (
          /*
            Tiles on the screen are wired where they stand: nothing lands, so
            nothing is dragged. The box keeps the widget's shape — the same
            list, the accent border — with the act at the top where the
            handle would be.
          */
          <div className="dr-scroll flex min-h-0 flex-col overflow-y-auto rounded-md border border-accent bg-accent-dim">
            <button
              onClick={() => void wireDraft()}
              disabled={!wireable || busy}
              title={
                wireable
                  ? "Wire these tiles together on the screen"
                  : "The group needs a map or a Node search to drive it"
              }
              className="sticky top-0 flex items-center gap-1.5 border-b border-accent-line bg-accent-dim px-2 py-1 text-left font-mono text-[9.5px] tracking-[0.08em] text-accent uppercase transition-colors hover:bg-accent/20 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-accent-dim"
            >
              <span aria-hidden="true">⌁</span>
              {busy
                ? "wiring…"
                : `wire these ${open.parts.length} on the screen`}
            </button>
            <span className="flex flex-col gap-1 p-2">
              {open.parts.map((p, i) => (
                <WidgetRow key={p.key} part={p} to={wiring[i]} />
              ))}
            </span>
          </div>
        ) : (
          <div
            draggable
            onDragStart={grabGroup}
            onDragEnd={() => onDragStateChange(null)}
            title="Drag onto the screen to place the whole group"
            className="dr-scroll flex min-h-0 cursor-grab flex-col overflow-y-auto rounded-md border border-accent bg-accent-dim select-none active:cursor-grabbing"
          >
            <span className="sticky top-0 flex items-center gap-1.5 border-b border-accent-line bg-accent-dim px-2 py-1 font-mono text-[9.5px] tracking-[0.08em] text-accent uppercase">
              <span aria-hidden="true">⠿</span>
              drag onto the screen
            </span>
            <span className="flex flex-col gap-1 p-2">
              {open.parts.map((p, i) => (
                <WidgetRow key={p.key} part={p} to={wiring[i]} />
              ))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** One line of the widget: the part's shape, its data, and who it follows. */
function WidgetRow({ part, to }: { part: Part; to: number | undefined }) {
  const n = itemName(part);
  return (
    <span className="flex items-center gap-1.5 rounded border border-line bg-surface px-1.5 py-1">
      <span
        aria-hidden="true"
        className="shrink-0 font-mono text-[10px] text-faint"
      >
        {GLYPH[part.kind] ?? "◆"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] text-ink">{n.kind}</span>
        {/*
          The data under the name: two rows both reading "Chart" say nothing
          about which chart is stacked where, which is the one question a list
          of names is read to answer.
        */}
        <span className="block truncate text-[10px] text-muted">{n.data}</span>
      </span>
      {to !== undefined && (
        <span
          aria-label={`follows ${to + 1}`}
          className="shrink-0 font-mono text-[10px] text-accent"
        >
          ⌁{to + 1}
        </span>
      )}
    </span>
  );
}

/**
 * One of the pane's three columns: a heading that counts what is in it, and a
 * list that scrolls inside its own column rather than pushing the pane.
 */
function Column({
  title,
  count,
  hint,
  rule,
  children,
}: {
  title: string;
  count: number;
  /** Replaces the count while something is happening to this column. */
  hint?: string;
  /** A rule on the left edge, separating it from the column before it. */
  rule?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "flex min-h-0 min-w-0 flex-1 flex-col gap-1.5",
        rule && "border-l border-line pl-2.5",
      )}
    >
      <span className="flex items-baseline gap-1.5 font-mono text-[10px] tracking-[0.08em] uppercase">
        <span className="text-faint">{title}</span>
        <span
          className={hint ? "text-accent" : "text-faint/70"}
        >
          {hint ?? count}
        </span>
      </span>
      <div className="dr-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
