"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DataExplorer } from "@/components/workspace/DataExplorer";
import {
  AvailabilityBadge,
  SelectionStrip,
} from "@/components/workspace/DataChip";
import { Runner } from "@/components/workspace/Runner";
import { Button, cx } from "@/components/ui";
import { ScreenSkeleton } from "@/components/Skeleton";
import { type DataRef } from "@/lib/workspace/catalog";
import {
  BuildPanel,
  DRAG_TYPE,
  type EditorStart,
  type TrayPayload,
} from "@/components/workspace/BuildPanel";
import { ComponentEditor } from "@/components/workspace/ComponentEditor";
import { ChatDock } from "@/components/workspace/ChatDock";
import { TileChat } from "@/components/workspace/TileChat";
import type { TileAsk } from "@/lib/workspace/ask";
import { WiresStrip } from "@/components/workspace/WiresStrip";
import { FeedsPanel } from "@/components/workspace/FeedsPanel";
import {
  componentDef,
  DEFAULT_LAYOUT,
  GRID,
  type ComponentSpec,
} from "@/lib/workspace/components";
import { readNdjson } from "@/lib/workspace/ndjson";
import { usePreviewHost } from "@/lib/workspace/usePreviewHost";
import { useTheme } from "@/lib/useTheme";
import { useTimeZone } from "@/lib/useTimeZone";
import type { App, AppSummary } from "@/lib/workspace/types";

/**
 * What the right column is showing.
 *
 * One column, four jobs, and they are not used together: you build by hand,
 * you build by conversation, you read what happened, or you check what the
 * screen is reading. Stacked, none had room. The chat lives here rather than
 * under the screen because a conversation reads top-down — a wide two-line
 * strip was the worst shape for one. Cost used to be a turn here too; spending
 * lives in the navbar's usage dock now, so the panel no longer repeats it.
 */
type PanelMode = "build" | "chat" | "changes" | "feeds";

const PANELS: { id: PanelMode; label: string }[] = [
  { id: "build", label: "Build" },
  { id: "chat", label: "Chat" },
  { id: "feeds", label: "Feeds" },
  { id: "changes", label: "History" },
];

/**
 * The page's column split: the screen, and the panel beside it.
 *
 * One definition, one row. There used to be a second row above it holding the
 * page's controls, and keeping the two in step was a standing bug — aligned to
 * the page instead of the canvas, those controls floated over the panel rather
 * than over the thing they act on. They live in the panel column now, so there
 * is nothing left to keep in step. Closed, there is no panel to leave room for
 * and the screen takes the whole width.
 */
const COLUMNS = (open: boolean) =>
  open ? "lg:grid-cols-[1fr_var(--panel-w,420px)]" : "lg:grid-cols-1";

/**
 * Whether the page-level actions — pull, fork, copy link, the identifier —
 * are shown. Off while sharing is unfinished: they are all about moving a page
 * between people, and there is nobody to move it to yet.
 */
const PAGE_ACTIONS = false;

/** How wide the panel column may be dragged, px. */
const PANEL_MIN = 320;
const PANEL_MAX = 840;

/**
 * The screen, drawn at the width it will be launched at, filling its room.
 *
 * Editing puts a panel beside the canvas, and a narrower canvas is a different
 * dashboard: a tile is columns wide and pixels tall, so taking width away
 * changes every proportion on the page — you arrange one thing and launch
 * another. So the frame is laid out at the launched *width* (the viewport) and
 * scaled down by exactly that ratio: every tile has the size, wrap and relative
 * weight it will have on the wall, and dragging the panel zooms the screen
 * rather than reflowing it.
 *
 * Height is the launched height for the same reason, so the canvas is the
 * whole launched screen and nothing but it — letterboxed, and the room that
 * frees below is not dead space: the chat fills all of it. Showing a strip
 * more canvas below the fold was the better use of that room when nothing
 * else wanted it; a conversation does, and it wants every pixel it can get.
 *
 * It returns the box to measure, the fit to apply, and the box's own height
 * (`boxH`, the launched height scaled). Measured rather than declared:
 * `aspect-ratio` takes a ratio of numbers, and this one is a ratio of two
 * lengths that both change under a window resize or a panel drag.
 */
function useScreenFit(active: boolean, ready: boolean) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{
    w: number;
    h: number;
    scale: number;
    boxH: number;
  } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!active || !ready || !el) {
      setFit(null);
      return;
    }
    const measure = () => {
      const w = window.innerWidth;
      // The launched screen is the viewport under the nav. The nav is measured
      // rather than read from the CSS variable so a unit change cannot lie here.
      const nav =
        document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      const h = window.innerHeight - nav;
      const room = el.getBoundingClientRect();
      // A pane with no size yet says nothing about how big the screen is;
      // measuring it would only produce a scale to correct a moment later.
      if (w <= 0 || h <= 0 || room.width <= 0) return;
      const scale = Math.min(1, room.width / w);
      setFit({ w, h, scale, boxH: Math.round(h * scale) });
    };
    measure();
    // The panel is draggable and the window is resizable, and only one of those
    // changes the box without changing the launched size.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [active, ready]);

  return { box, fit };
}

/**
 * A write landed. Arranging a screen saves constantly and silently, and
 * silence about your own data is not reassuring — the saved mark lives in the
 * workspace bar beside the name, so the page announces each save by event
 * rather than lifting state through a layout that renders the nav.
 */
function markSaved() {
  window.dispatchEvent(new Event("dryos:saved"));
}

/** One screen, running, with the tools that shaped it beside it. */
export default function AppPage() {
  // `id` throughout is the page's id; the workspace only matters for links.
  const { space, page: id } = useParams<{ space: string; page: string }>();

  // The workspace's subject, for the explorer to open on. One small fetch;
  // the nav loads the workspace too, but a panel should not depend on the
  // chrome above it having finished.
  const [spaceDomain, setSpaceDomain] = useState<string | undefined>();
  useEffect(() => {
    let live = true;
    fetch(`/api/workspace/spaces/${space}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setSpaceDomain(d?.space?.domain ?? undefined))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [space]);
  const router = useRouter();
  const search = useSearchParams();

  /*
    The time cursor, read from the URL the way edit mode is — one answer, it
    survives a reload, and it can be sent to someone.

    Nothing in the product sets it any more — the map's scrubber went
    tile-local, holding its own instant and rewriting only its own queries —
    so ?t= is the shared-link form of an instant: pasted in, every frame is
    told the same value and the whole screen answers for that moment together.
  */
  const urlCursor = search.get("t");
  const [scrubbing, setScrubbing] = useState<string | null>(null);
  useEffect(() => setScrubbing(null), [urlCursor]);
  const cursor = scrubbing ?? urlCursor;

  /*
    A tile asked to move the page's cursor.

    Nothing generated posts this today — the map's scrubber is tile-local now,
    deliberately, because moving every other tile on the screen to answer a
    question about one map read as breakage rather than coherence. The intent
    path stays because the runtime still exposes setCursor: the frame posts,
    this sets the value, and every frame is told the answer on the way back.

    Live locally, debounced to the URL. A scrubber fires continuously and a
    `router.replace` per pixel would re-render the route across the gesture; the
    only position worth putting in an address bar is the one it settles on.
  */
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveCursor = useCallback(
    (at: string | null) => {
      setScrubbing(at);
      if (urlTimer.current) clearTimeout(urlTimer.current);
      urlTimer.current = setTimeout(() => {
        const next = new URLSearchParams(search.toString());
        if (at === null) next.delete("t");
        else next.set("t", at);
        const qs = next.toString();
        router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
      }, 350);
    },
    [router, search],
  );
  useEffect(() => () => { if (urlTimer.current) clearTimeout(urlTimer.current); }, []);

  const [app, setApp] = useState<App | null>(null);
  const [attached, setAttached] = useState<DataRef[]>([]);
  const [dragging, setDragging] = useState<TrayPayload | null>(null);
  const [editing, setEditing] = useState<EditorStart | null>(null);
  /**
   * Bumped when a staged group lands on the screen. The wires pane clears the
   * draft on it: once the group is a wired record in the list, the draft that
   * made it standing beside its own result is the same thing listed twice.
   */
  const [placedTick, setPlacedTick] = useState(0);
  /*
    Edit mode is the URL, not a copy of it.

    Held in state it desynchronised the moment the navbar's Edit link changed the
    query without remounting this component — the button flipped and nothing else
    did. Derived, there is one answer, it survives a reload, and it can be sent
    to someone.
  */
  const asideOpen = search.get("edit") === "1";
  const [panel, setPanel] = useState<PanelMode>("build");
  /**
   * Data and Build are one panel taken in two steps: choose what, then choose
   * how. Each step gets the whole column — split in half, neither had room —
   * and each ends in the way on: the explorer's own footer, then the shelf.
   */
  const [stage, setStage] = useState<"data" | "build">("data");
  /**
   * The two ways into the build panel. **From data** is the explorer and
   * then the shapes — choose what, then choose how. **Community** is what
   * other people published, and it comes first in the reading order because
   * a published component or group already carries its data: asking someone
   * to pick a stream before they can see a shelf that ignores the pick is a
   * question with no bearing on the answer.
   */
  const [shelf, setShelf] = useState<"data" | "community">("data");
  const [pending, setPending] = useState(false);
  /**
   * The panel's width, draggable at its left edge. Judging a preview in a
   * fixed 420px was the whole reason screens felt cramped; someone comparing
   * eight series needs the room, someone arranging tiles wants it thin. Saved
   * per machine — a preference, not a revision.
   */
  const [panelW, setPanelW] = useState(420);
  useEffect(() => {
    const saved = Number(localStorage.getItem("dryos:panelW"));
    if (saved >= PANEL_MIN && saved <= PANEL_MAX) setPanelW(saved);
  }, []);
  const resizePanel = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const from = panelWRef.current;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const w = Math.min(PANEL_MAX, Math.max(PANEL_MIN, from + (startX - ev.clientX)));
      setPanelW(w);
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      localStorage.setItem("dryos:panelW", String(panelWRef.current));
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }, []);
  const panelWRef = useRef(420);
  useEffect(() => {
    panelWRef.current = panelW;
  }, [panelW]);
  /** Which tile the editor should put its result back into, from a ⚙ click. */
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  /**
   * Tiles shift-clicked on the screen, by slot, in the order they were
   * clicked. They are the wires strip's draft as far as the canvas is
   * concerned: the frame rings each one, and the strip lists them as the
   * group being built. Two of them start a group on their own.
   */
  const [marked, setMarked] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  /**
   * The chat a double click on a launched tile opened: what the frame
   * packed, and where. One at a time — another double click replaces it, a
   * press anywhere (in the frame or out here) closes it, and entering edit
   * mode closes it too, since a click means "configure" there.
   */
  const [ask, setAsk] = useState<{
    ask: TileAsk;
    at: { x: number; y: number };
    box: { w: number; h: number };
  } | null>(null);
  const openAsk = useCallback(
    (a: TileAsk, at: { x: number; y: number }, box: { w: number; h: number }) =>
      setAsk({ ask: a, at, box }),
    [],
  );
  const closeAsk = useCallback(() => setAsk(null), []);
  useEffect(() => {
    if (asideOpen) setAsk(null);
    // A selection for the strip has no strip to land in once editing ends.
    else setMarked([]);
  }, [asideOpen]);
  const [pullOpen, setPullOpen] = useState(false);
  /** The canvas keeps the launched screen's proportions while being edited. */
  const { box: canvasBox, fit } = useScreenFit(asideOpen, Boolean(app));

  /**
   * A drag begins: size the incoming tile to the preview it was taken from.
   *
   * The payload carries the preview box's on-screen pixels, and the canvas is
   * the launched screen scaled down — so dividing by the fit's scale and
   * snapping to the grid gives the tile that *looks* exactly as big as the
   * thing being dragged. What lands is what you saw, size included; the
   * shape's default layout is only the fallback for when there is nothing to
   * measure against.
   */
  const beginDrag = useCallback(
    (payload: TrayPayload | null) => {
      if (payload?.px && fit) {
        // The frame's #root keeps 16px of padding on each side, so the grid is
        // that much narrower than the launched width.
        const canvasW = fit.w - 32;
        const col = (canvasW - (GRID.cols - 1) * GRID.gap) / GRID.cols;
        const stride = col + GRID.gap;
        const w = Math.min(
          GRID.cols,
          Math.max(2, Math.round((payload.px.w / fit.scale + GRID.gap) / stride)),
        );
        const h = Math.max(120, Math.round(payload.px.h / fit.scale));
        setDragging({ ...payload, layout: { w, h } });
      } else {
        setDragging(payload);
      }
    },
    [fit],
  );

  useEffect(() => {
    fetch(`/api/workspace/apps/${id}`)
      .then((r) => r.json())
      .then((d) => setApp(d.app ?? null));
  }, [id]);

  /*
    An empty page is only ever a page being built, so the panel it is built
    from is always open: the canvas says "pick data, then drag a component
    here", and closed, there is nowhere to pick data from. Steered through the
    URL rather than a state override — edit mode stays derived from one place,
    and the navbar's pencil, the skeleton and the frame all keep agreeing.

    This pairs with the `dryos:blank` event below: while the page is empty the
    nav shows no Done button, so the mode being unleavable is invisible rather
    than a button that snaps straight back. Both halves are needed — the force
    alone made Done a lie, and hiding Done alone left a blank page opening
    onto a canvas with no panel to build it from.
  */
  useEffect(() => {
    if (!asideOpen && app?.manifest?.length === 0) {
      const qs = new URLSearchParams(search);
      qs.set("edit", "1");
      router.replace(`?${qs}`, { scroll: false });
    }
  }, [asideOpen, app, router, search]);

  /*
    Whether the page has anything on it yet, for the nav — "Done" on a page
    with nothing done is a claim, so the nav hides it until the first tile
    lands. An event, like the saved and busy marks: the nav and the page share
    no parent below the layout.
  */
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("dryos:blank", {
        detail: app ? app.manifest?.length === 0 : false,
      }),
    );
  }, [app]);

  const onRuntimeError = useCallback((m: string) => setRuntimeError(m), []);

  /**
   * Select or drop a reference from the explorer.
   *
   * It lands as a chip, not as query text pasted into the sentence. The request
   * someone types stays theirs to read and edit; the data it touches is an
   * object beside it, with its badge and its price attached, that they can drop
   * again without hunting for a call expression inside their own prose.
   *
   * Selecting anything also writes the request, because after picking three
   * series the next sentence was going to be this one. It is written into the
   * real box rather than sent, so it is a draft you can edit or replace — and it
   * only ever overwrites itself, never something the user typed.
   */
  const toggle = useCallback(
    (ref: DataRef) => {
      const same = (r: DataRef) =>
        r.snippet === ref.snippet && r.label === ref.label;
      const next = attached.some(same)
        ? attached.filter((r) => !same(r))
        : [...attached, ref];

      setAttached(next);
    },
    [attached],
  );

  /**
   * Place a dragged component at the seam it was dropped on.
   *
   * Goes down the same route a written change does, and is gated the same way —
   * generated, compiled, and only then saved. The difference is that no model is
   * involved, so this returns in about a second.
   */
  const place = useCallback(
    async (at: { x: number; y: number } | null) => {
      const payload = dragging;
      setDragging(null);
      if (!payload || pending) return;

      setPending(true);
      setError(null);
      try {
        const res = await fetch(`/api/workspace/apps/${id}/edit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            payload.group
              ? {
                  // A staged group lands whole: the members are the tiles,
                  // and the anchor is where the ghost's top-left was.
                  group: payload.group.map((m) => ({
                    component: m.kind,
                    options: m.options,
                    custom: m.custom,
                    refs: m.refs,
                    layout: m.layout,
                    wireTo: m.wireTo,
                  })),
                  layout: at ? { ...payload.layout, x: at.x, y: at.y } : undefined,
                }
              : {
                  component: payload.kind,
                  options: payload.options,
                  custom: payload.custom,
                  // The place comes with the size: the ghost the frame drew is
                  // what the tile becomes, so there is nothing left for the
                  // server to decide about where it goes. Released where it
                  // does not fit there was no ghost, and no place is the
                  // honest thing to send — the server puts it under everything
                  // instead of on top of something.
                  layout: at ? { ...payload.layout, x: at.x, y: at.y } : payload.layout,
                  refs: payload.refs ?? attached,
                },
          ),
        });
        if (!res.ok && !res.headers.get("content-type")?.includes("ndjson")) {
          const d = await res.json().catch(() => ({}));
          setError(d.error ?? `The server returned ${res.status}.`);
          return;
        }
        await readNdjson(res, (e) => {
          switch (e.type) {
            case "done":
              setApp(e.app as App);
              markSaved();
              if (payload.group) setPlacedTick((n) => n + 1);
              // A placement reports nothing, either path. The tile is on the
              // page — that is the report — and the save mark in the bar
              // says it was written. A banner announcing what you can already
              // see is one more thing to read and then dismiss.
              //
              // The panel goes back to the beginning: a landed drop ends the
              // build it was part of, and the next thing starts from data.
              setStage("data");
              break;
            case "failed":
            case "error":
              setError(String(e.message));
              break;
          }
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "That did not place.");
      } finally {
        setPending(false);
      }
    },
    [dragging, pending, id, attached],
  );

  /** POST one spec at the page — into a slot, or appended under everything. */
  const placeSpec = useCallback(
    async (spec: ComponentSpec, at?: number) => {
      setPending(true);
      setError(null);
      try {
        const res = await fetch(`/api/workspace/apps/${id}/edit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            component: spec.kind,
            options: spec.options,
            custom: spec.custom,
            layout: spec.layout,
            refs: spec.refs,
            replaceAt: at,
          }),
        });
        const ct = res.headers.get("content-type");
        if (!res.ok && !ct?.includes("ndjson")) {
          const d = await res.json().catch(() => ({}));
          setError(d.error ?? `The server returned ${res.status}.`);
          return;
        }
        await readNdjson(res, (e) => {
          if (e.type === "done") {
            setApp(e.app as App);
            markSaved();
          } else if (e.type === "failed" || e.type === "error") {
            setError(String(e.message));
          }
        });
      } finally {
        setPending(false);
      }
    },
    [id],
  );

  /** Add a component built in the editor, at the end of the dashboard. */
  const addSpec = useCallback(
    async (spec: ComponentSpec) => {
      setEditing(null);
      try {
        await placeSpec(spec, replaceIndex ?? undefined);
      } finally {
        setReplaceIndex(null);
      }
    },
    [placeSpec, replaceIndex],
  );

  /**
   * A copy of the tile being edited, staged over the canvas.
   *
   * Clicking Duplicate creates nothing yet. The copy hovers over a dimmed
   * canvas as the thing to pick up — appending it sight-unseen landed it
   * below the fold, which read as the button doing nothing — and grabbing it
   * enters the same drag-ghost-drop that places everything else, so the drop
   * says where and the compile gate runs then. Letting go anywhere it does
   * not land, Escape, or a click on the scrim all cost nothing, because
   * nothing was made. What floats is the spec as the editor currently shows
   * it, unsaved edits included, at the original tile's size.
   */
  const [dupe, setDupe] = useState<TrayPayload | null>(null);
  const dupeFrame = usePreviewHost();
  const theme = useTheme();
  const tzPref = useTimeZone();

  const duplicateSpec = useCallback(
    (spec: ComponentSpec) => {
      const orig =
        replaceIndex != null ? app?.manifest?.[replaceIndex]?.layout : undefined;
      const size = orig ?? spec.layout ?? DEFAULT_LAYOUT[spec.kind];
      setDupe({
        kind: spec.kind,
        options: spec.options,
        custom: spec.custom,
        refs: spec.refs,
        layout: { w: size.w, h: size.h },
      });
    },
    [replaceIndex, app],
  );

  /*
    The live preview of whatever is in flight, for the canvas to float at the
    ghost's own rectangle — the incoming component where the drop will put
    it, not a dashed box standing in for it. Stable for the length of a drag,
    so the frame mounts once and only moves. Not for a staged group: the
    preview route composes one tile, and a wrong preview at the right place is
    worse than the dashed footprint.
  */
  const dropPreviewUrl = dragging && !dragging.group
    ? `/api/workspace/preview?bare=1&theme=${theme}&tz=${encodeURIComponent(tzPref)}&spec=${encodeURIComponent(
        JSON.stringify({
          kind: dragging.kind,
          options: dragging.options,
          custom: dragging.custom,
          refs: dragging.refs ?? attached,
          layout: { w: 12, h: dragging.layout.h },
        }),
      )}`
    : undefined;

  /*
    Done ends the selection with the mode.

    A selected tile is a sentence about the panel — the accent ring says "this
    is the one the panel is talking about" — and pressing Done takes the panel
    away while leaving the ring painted on a screen that is meant to carry no
    chrome at all. Edit mode is the URL, so this follows it rather than being
    cleared at the Done control, which lives in the navbar and cannot reach
    here. Everything editing-only goes together: the selection, the editor
    open on it, and any copy staged over the canvas waiting to be picked up.
  */
  useEffect(() => {
    if (asideOpen) return;
    setReplaceIndex(null);
    setEditing(null);
    setDupe(null);
  }, [asideOpen]);

  // Escape puts the staged copy away — but not mid-drag: the browser's own
  // Escape cancels the drag, and unmounting the source there would kill the
  // dragend that cleans up. The card's own handler covers that exit.
  useEffect(() => {
    if (!dupe || dragging) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDupe(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dupe, dragging]);

  /** Keep a component so it shows up on the shelf for the next dashboard too. */
  const saveSpec = useCallback(async (spec: ComponentSpec) => {
    await fetch("/api/workspace/components", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec, name: spec.custom?.name ?? spec.kind }),
    });
    markSaved();
  }, []);

  /**
   * A tile was rearranged in the frame. Persisted, but not as a revision.
   *
   * The frame has already applied it, so this is only the save — and it must not
   * update `app`, because that would change the version the frame is keyed on
   * and remount it mid-gesture.
   */
  const arrange = useCallback(
    async (body: Record<string, unknown>) => {
      // A page without a manifest has nothing to write a layout into — the
      // frame has already applied the gesture live, and posting the save
      // would only surface a 409 for a change that cannot persist.
      if (!app?.manifest) return;
      await fetch(`/api/workspace/apps/${id}/layout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      markSaved();
    },
    [id, app?.manifest],
  );

  const resize = useCallback(
    (index: number, w: number, h: number) => void arrange({ index, w, h }),
    [arrange],
  );

  const move = useCallback(
    (
      index: number,
      at: { x: number; y: number },
      swap: { index: number; x: number; y: number } | null,
    ) => void arrange({ index, x: at.x, y: at.y, swap }),
    [arrange],
  );

  // Confirmed on the tile itself, inside the frame — by the time this fires
  // the person has clicked "remove?" on the thing being removed. The revision
  // it writes is the undo path.
  const remove = useCallback(
    async (index: number) => {
      const res = await fetch(`/api/workspace/apps/${id}/remove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ index }),
      });
      const data = await res.json();
      if (res.ok) setApp(data.app);
      else setError(data.error ?? "That tile did not remove.");
      // The frame already hid the tile; false puts it back.
      return res.ok;
    },
    [id],
  );

  /**
   * A tile's ⚙: reopen the editor on what the tile actually is — its shape,
   * its references, its settings, the source a refinement left behind — and
   * remember which slot to put the result back into.
   */
  const configure = useCallback(
    (index: number, shift: boolean) => {
      const spec = app?.manifest?.[index];
      const def = spec ? componentDef(spec.kind) : undefined;
      if (!spec || !def) {
        setError(
          shift
            ? "This page was edited by the model, so its tiles cannot be wired in place."
            : "This page was edited by the model, so tiles cannot be reconfigured in place — describe the change instead.",
        );
        return;
      }
      // Shift-click is "this one too": the tile joins (or leaves) the group
      // the strip is building, and the editor stays out of it. A plain click
      // leaves the marks alone — opening one tile's settings to check them
      // should not throw away a selection made two clicks ago.
      if (shift) {
        setMarked((prev) =>
          prev.includes(index)
            ? prev.filter((i) => i !== index)
            : [...prev, index],
        );
        return;
      }
      setReplaceIndex(index);
      setEditing({
        def,
        refs: spec.refs ?? [],
        options: spec.options,
        custom: spec.custom,
        name: spec.custom?.name,
      });
    },
    [app],
  );

  async function revert(revisionId: string) {
    const res = await fetch(`/api/workspace/apps/${id}/revert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revisionId }),
    });
    const data = await res.json();
    if (res.ok) {
      setApp(data.app);
      setRuntimeError(null);
    }
  }

  async function fork() {
    const res = await fetch("/api/workspace/apps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ forkOf: id, space }),
    });
    const { app: created } = await res.json();
    router.push(`/workspace/${space}/${created.id}`);
  }

  // Laid out for whichever mode the URL asked for, so nothing shifts on arrival.
  if (!app) return <ScreenSkeleton withPanel={search.get("edit") === "1"} />;

  /*
    Reading a page and editing one want opposite layouts. Editing wants a
    measured page with margins; reading wants the screen, edge to edge, with
    none of the site showing around it. So the shell itself changes rather than
    the screen shrinking to fit a page that was designed for a document.
  */
  return (
    <div
      className={cx(
        "flex flex-col",
        // Same side gutter as the navbar in edit mode, none at all when the
        // screen is the only thing on the page. Vertically it is tighter at the
        // top than the bottom: the navbar is already a horizontal rule, so the
        // space under it is doing nothing the nav is not, and every pixel of it
        // is a pixel the screen does not get.
        asideOpen
          ? "h-[calc(100vh-var(--nav-h))] px-4 pt-2 pb-4"
          : "h-[calc(100vh-var(--nav-h))]",
      )}
    >
      <div
        className={cx("grid min-h-0 flex-1 gap-4", COLUMNS(asideOpen))}
        style={{ ["--panel-w" as string]: `${panelW}px` } as React.CSSProperties}
      >
        <div className="relative flex min-h-0 flex-col gap-2">
          {/*
            Editing, the canvas is the launched screen scaled — exactly it,
            letterboxed to its height — and everything under it belongs to the
            chat. Until the fit is measured (and whenever the panel is closed)
            it fills the column the way it always did.
          */}
          <div
            ref={canvasBox}
            className={cx(
              "relative",
              asideOpen && fit ? "shrink-0" : "min-h-0 flex-1",
            )}
            style={asideOpen && fit ? { height: fit.boxH } : undefined}
          >
            <Runner
              appId={app.id}
              version={app.updatedAt}
              onError={onRuntimeError}
              dropping={Boolean(dragging)}
              dropSize={dragging?.layout}
              dropPreview={dropPreviewUrl}
              dropCard={dragging?.group?.map((m) => ({
                kind: componentDef(m.kind)?.name ?? m.kind,
                data:
                  (m.refs ?? []).map((r) => r.label).join(" · ") ||
                  (m.custom?.name ?? ""),
              }))}
              onDropAt={place}
              placing={pending}
              onResize={resize}
              onMove={move}
              onRemove={remove}
              onConfigure={configure}
              onAsk={openAsk}
              onPress={closeAsk}
              flush={!asideOpen}
              fit={fit}
              // A tile is clicked to configure it, so the frame has to know
              // there is a panel to configure it in — and which tile that
              // panel is currently about.
              editing={asideOpen}
              // Derived rather than read straight off the state the effect
              // above clears: that clear lands after paint, so the frame
              // would keep the ring for a frame and a message round trip
              // after Done — which is exactly the moment it has to go.
              selected={asideOpen ? replaceIndex : null}
              marked={marked}
              cursor={cursor}
              onCursor={moveCursor}
            />

            {/*
              The chat a double click opened, at the click. Inside the canvas box so
              its coordinates are the frame's, scaled back out by the Runner.
            */}
            {ask && (
              <TileChat
                key={`${ask.ask.index}:${ask.at.x}:${ask.at.y}`}
                ask={ask.ask}
                at={ask.at}
                box={ask.box}
                page={app.name}
                tz={tzPref}
                onClose={closeAsk}
              />
            )}

            {/*
              The staged duplicate: the copy hovering over a dimmed canvas,
              waiting to be picked up. Hidden rather than unmounted once
              grabbed — removing a drag's source element mid-drag cancels the
              drag — and with pointer events off so the positions fall through
              to the sheet that forwards them into the frame. The scrim is the
              cancel: clicking it, or Escape, puts the copy away unmade.
            */}
            {dupe && (
              <div
                className={cx(
                  "absolute inset-0 z-20",
                  dragging && "pointer-events-none",
                )}
                onClick={() => !dragging && setDupe(null)}
              >
                <div
                  className={cx(
                    "absolute inset-0 rounded bg-bg/60 backdrop-blur-[2px] transition-opacity",
                    dragging ? "opacity-0" : "opacity-100",
                  )}
                />
                <div className="relative flex h-full items-center justify-center">
                  <div
                    draggable
                    onClick={(e) => e.stopPropagation()}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_TYPE, "1");
                      e.dataTransfer.effectAllowed = "copy";
                      /*
                        Deferred a tick on purpose. Setting `dragging` here
                        restyles this very element (the card hides once
                        grabbed), and Chrome cancels a drag whose source is
                        restyled in the dragstart tick — the grab died in the
                        hand and the overlay just snapped back. After the
                        browser has taken its drag snapshot, hiding is safe.
                      */
                      const payload = dupe;
                      setTimeout(() => beginDrag(payload), 0);
                    }}
                    onDragEnd={() => {
                      setDupe(null);
                      beginDrag(null);
                    }}
                    title="Drag onto the screen to place the copy"
                    className={cx(
                      "relative w-[340px] cursor-grab overflow-hidden rounded-md border border-accent bg-code shadow-2xl shadow-black/50 active:cursor-grabbing",
                      dragging && "opacity-0",
                    )}
                  >
                    <iframe
                      ref={dupeFrame}
                      src={`/api/workspace/preview?bare=1&theme=${theme}&tz=${encodeURIComponent(tzPref)}&spec=${encodeURIComponent(
                        JSON.stringify({
                          kind: dupe.kind,
                          options: dupe.options,
                          custom: dupe.custom,
                          refs: dupe.refs ?? [],
                          layout: { w: 12, h: 168 },
                        }),
                      )}`}
                      sandbox="allow-scripts"
                      title="The copy being placed"
                      className="pointer-events-none h-44 w-full border-0"
                    />
                    <div className="absolute inset-0 flex items-start justify-start p-1.5">
                      <span className="pointer-events-none rounded border border-accent-line bg-surface/85 px-1.5 py-[2px] font-mono text-[9.5px] tracking-[0.08em] text-accent uppercase backdrop-blur">
                        ⠿ grab to place the copy
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {runtimeError && (
            <p className="rounded border border-fail-line bg-fail-dim px-3 py-2 font-mono text-[11.5px] text-fail">
              {runtimeError}
            </p>
          )}

          {/*
            The strip under the canvas: the groups of tiles wired together on
            this page. Connecting goes down the same replace-in-slot path the
            tile editor's Save uses, so a wire is composed, compiled and
            recorded like any other change.
          */}
          {asideOpen && (
            <div className="min-h-0 flex-1">
              <WiresStrip
                onDragStateChange={beginDrag}
                placedTick={placedTick}
                manifest={app.manifest}
                carrying={dragging}
                onStaged={() => setStage("data")}
                marked={marked}
                onMarkedChange={setMarked}
                onConnect={async (t, from, color) => {
                  const spec = app.manifest?.[t];
                  if (!spec) return;
                  const options = { ...(spec.options ?? {}) };
                  if (from === null) {
                    delete options.follow;
                    delete options.wireColor;
                  } else {
                    options.follow = String(from);
                    if (color) options.wireColor = color;
                  }
                  await placeSpec({ ...spec, options }, t);
                }}
              />
            </div>
          )}
        </div>

        {/*
          One column, three panes: find the data, build with it, read what
          happened. Sized by the grid rather than by content, so a long list
          scrolls inside its own pane instead of pushing the next one off the
          bottom.

          Building a component takes the whole column instead. The preview is the
          reason that screen exists, and a preview squeezed into a third of a
          sidebar answers nothing — so everything else steps aside while it is
          open.
        */}
        {asideOpen && (
          <aside className="relative flex min-h-0 flex-col gap-3">
            {/*
              The grab edge lives in the gap between the canvas and the panel.
              Pointer capture keeps the drag alive over the iframe, which would
              otherwise swallow it mid-gesture.
            */}
            <div
              onPointerDown={resizePanel}
              title="Drag to resize the panel"
              className="group absolute top-0 -left-4 hidden h-full w-4 cursor-col-resize items-center justify-center lg:flex"
            >
              <div className="h-10 w-[3px] rounded-full bg-line transition-colors group-hover:bg-accent" />
            </div>
            {/*
              Everything that acts on the whole page — pull, fork, share, the
              identifier — is off for now (`PAGE_ACTIONS`). Sharing is still
              unfinished, and a row of controls for it was answering questions
              nobody is asking yet. The machinery behind them is untouched, so
              turning the flag back on is the whole of putting them back.
            */}
            {PAGE_ACTIONS && (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <Button size="sm" onClick={() => setPullOpen(true)}>
                  Pull changes…
                </Button>
                <Button size="sm" onClick={fork}>
                  Fork
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    navigator.clipboard?.writeText(window.location.href)
                  }
                >
                  Copy link
                </Button>
                <span className="ml-1 font-mono text-[10.5px] text-faint">
                  {app.id}
                </span>
              </div>
            )}

            {editing ? (
              <div className="min-h-0 flex-1">
                <ComponentEditor
                  // Its own data, not the explorer's — a saved component brings
                  // the references it was built against.
                  //
                  // Keyed by the tile as well as the component: clicking one
                  // chart and then another is two different tiles wearing the
                  // same name, and without the index the editor kept the first
                  // one's settings and refined source on screen for the second.
                  key={`${replaceIndex ?? "new"}:${editing.name ?? editing.def.kind}`}
                  def={editing.def}
                  refs={editing.refs}
                  initialDomain={spaceDomain}
                  initialName={editing.name}
                  initialOptions={editing.options}
                  initialCode={editing.custom?.code}
                  onClose={() => {
                    setEditing(null);
                    setReplaceIndex(null);
                  }}
                  onAdd={addSpec}
                  onSave={saveSpec}
                  // Only a tile has a size and settings worth copying; the
                  // create path's copy is "Add to dashboard" itself.
                  onDuplicate={replaceIndex === null ? undefined : duplicateSpec}
                  // Only a tile can be deleted, and only a tile has a slot to
                  // put a change back into — so the same fact decides both.
                  onDelete={
                    replaceIndex === null
                      ? undefined
                      : () => {
                          const at = replaceIndex;
                          setEditing(null);
                          setReplaceIndex(null);
                          void remove(at);
                        }
                  }
                />
              </div>
            ) : (
              <>
                {/*
                  One column, two jobs, taken in turns. Building and reading
                  what happened are not done together, and stacking them made
                  both too short to use.
                */}
                <div className="flex shrink-0 gap-1 rounded-lg border border-line bg-surface p-1">
                  {PANELS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPanel(p.id)}
                      className={cx(
                        "flex-1 rounded-md px-2 py-1 text-[12px] transition-colors",
                        panel === p.id
                          ? "bg-surface-3 text-ink"
                          : "text-muted hover:text-ink",
                      )}
                    >
                      {p.label}
                      {p.id === "changes" && (
                        <span className="ml-1.5 font-mono text-[9.5px] text-faint">
                          {app.history.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {panel === "changes" && (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface">
                    <div className="border-b border-line px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
                      Changelog
                    </div>
                    <ol className="dr-scroll min-h-0 flex-1 overflow-y-auto">
                      {app.history.map((r, i) => (
                        <li
                          key={r.id}
                          className="border-b border-line px-3 py-2.5 last:border-0"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[13px] leading-snug text-ink">
                              {r.intent}
                            </p>
                            {i > 0 && (
                              <button
                                onClick={() => revert(r.id)}
                                className="shrink-0 font-mono text-[10px] text-faint hover:text-accent"
                              >
                                revert
                              </button>
                            )}
                          </div>
                          {r.note && (
                            <p className="mt-1 text-[12px] text-muted">
                              {r.note}
                            </p>
                          )}
                          {r.refs && r.refs.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {r.refs.map((d, n) => (
                                <span
                                  key={`${d.snippet}-${n}`}
                                  className={cx(
                                    "inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[9.5px] text-muted",
                                    d.availability === "live"
                                      ? "border-line bg-surface-2"
                                      : "border-dashed border-info-line bg-surface-2",
                                  )}
                                >
                                  {d.label}
                                  <AvailabilityBadge
                                    availability={d.availability}
                                  />
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="mt-1 font-mono text-[10px] text-faint">
                            {r.author} · {new Date(r.at).toLocaleTimeString()}
                            {r.pulledFrom && (
                              <span className="text-accent">
                                {" "}
                                · from {r.pulledFrom.appName}
                              </span>
                            )}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/*
                  Mounted only while open, unlike the chat below it: it polls
                  the delivery API every 20 seconds, and a pane nobody is
                  reading should not keep asking.
                */}
                {panel === "feeds" && (
                  <FeedsPanel manifest={app.manifest} history={app.history} />
                )}

                {/*
                  Kept mounted, like the build pane below: a transcript that
                  vanished every time somebody glanced at History would not be
                  a conversation.
                */}
                <div
                  hidden={panel !== "chat"}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <ChatDock
                    appId={app.id}
                    refs={attached}
                    onApp={(a) => {
                      setApp(a);
                      markSaved();
                    }}
                    onPick={toggle}
                  />
                </div>

                <div
                  hidden={panel !== "build"}
                  className="flex min-h-0 flex-1 flex-col gap-2"
                >
                  {/*
                    Only failures report here. Placing a component is
                    deterministic and lands in about a second — the tile
                    appearing on the screen is the report, and a banner
                    narrating the compile was a box covering the panel to say
                    nothing anyone was waiting to read.
                  */}
                  {error && (
                    <div className="flex shrink-0 items-center gap-2 rounded-lg border border-warn-line bg-warn-dim px-3 py-2 text-[12.5px] text-warn">
                      <span className="min-w-0 truncate">{error}</span>
                    </div>
                  )}

                  {/*
                    The panel's own tabs, above whichever stage is showing.
                    An underline at the bottom of the row, the idiom the
                    workspace nav uses for its pages.
                  */}
                  <div className="flex shrink-0 items-stretch gap-3 border-b border-line px-1">
                    {(
                      [
                        { id: "data", label: "From data" },
                        { id: "community", label: "Community" },
                      ] as const
                    ).map((t) => {
                      const on = shelf === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setShelf(t.id)}
                          aria-pressed={on}
                          className={cx(
                            "-mb-px border-b-2 px-1 pt-1 pb-1.5 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors",
                            on
                              ? "border-accent text-ink"
                              : "border-transparent text-faint hover:text-ink",
                          )}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>

                  {shelf === "community" ? (
                    /*
                      Published components and wired groups, each with its
                      own data. No explorer and no selection strip: the pick
                      would change nothing here.
                    */
                    <div className="min-h-0 flex-1">
                      <BuildPanel
                        shelf="community"
                        refs={attached}
                        onDragStateChange={beginDrag}
                        manifest={app.manifest}
                      />
                    </div>
                  ) : stage === "data" ? (
                    /*
                      The explorer is the whole stage now. The bar that used to
                      sit under it held the selection, the count and the way on
                      — all three of which the panel was already showing one
                      line further up, so it was furniture repeating what it
                      framed. The chips moved to the top beside the heading and
                      the button to the line that counts them.
                    */
                    <div className="min-h-0 flex-1">
                      <DataExplorer
                        initialDomain={spaceDomain}
                        selected={attached}
                        onToggle={toggle}
                        onClear={() => setAttached([])}
                        onNext={() => setStage("build")}
                      />
                    </div>
                  ) : (
                    <>
                      {/*
                        Going forward used to take the selection off the screen:
                        the chips lived in the explorer, and the step where you
                        choose what to draw with them showed a count. The shapes
                        on the shelf are offered or refused on the strength of
                        this exact list, so it stays visible — one line, the same
                        chips, removable, one step back at the left.
                      */}
                      <div className="flex shrink-0 flex-col gap-1.5 rounded-lg border border-line bg-surface px-3 py-2">
                        <button
                          onClick={() => setStage("data")}
                          className="flex items-center gap-2 text-left text-[12px] text-muted transition-colors hover:text-ink"
                        >
                          ‹ Data
                          <span className="font-mono text-[10px] text-faint">
                            {attached.length} selected
                          </span>
                        </button>
                        <SelectionStrip
                          selected={attached}
                          onRemove={toggle}
                          onClear={() => setAttached([])}
                        />
                      </div>
                      <div className="min-h-0 flex-1">
                        <BuildPanel
                          shelf="shapes"
                          refs={attached}
                          onDragStateChange={beginDrag}
                          manifest={app.manifest}
                        />
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      {pullOpen && (
        <PullDialog
          appId={app.id}
          onClose={() => setPullOpen(false)}
          onPulled={setApp}
        />
      )}
    </div>
  );
}

/**
 * Take selected changes from another screen.
 *
 * What you choose from is a list of sentences, not a diff — each revision
 * carries the instruction that produced it, and that is what gets replayed
 * against your copy.
 */
function PullDialog({
  appId,
  onClose,
  onPulled,
}: {
  appId: string;
  onClose: () => void;
  onPulled: (app: App) => void;
}) {
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [source, setSource] = useState<App | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{
    applied: string[];
    skipped: { intent: string; reason: string }[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/workspace/apps")
      .then((r) => r.json())
      .then((d) =>
        setApps((d.apps as AppSummary[]).filter((a) => a.id !== appId)),
      );
  }, [appId]);

  async function choose(pickedId: string) {
    const res = await fetch(`/api/workspace/apps/${pickedId}`);
    const { app } = await res.json();
    setSource(app);
    setPicked([]);
  }

  async function pull() {
    if (!source || !picked.length) return;
    setPending(true);
    setProgress("Starting…");
    try {
      const res = await fetch(`/api/workspace/apps/${appId}/pull`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromAppId: source.id, revisionIds: picked }),
      });
      await readNdjson(res, (e) => {
        switch (e.type) {
          case "revision":
            setProgress(
              `Replaying ${e.index} of ${e.total}: ${String(e.intent).slice(0, 60)}`,
            );
            break;
          case "phase":
            setProgress(
              (p) => (p ? p.split(" — ")[0] : p) + " — " + String(e.phase),
            );
            break;
          case "done":
            onPulled(e.app as App);
            setResult({
              applied: e.applied as string[],
              skipped: e.skipped as { intent: string; reason: string }[],
            });
            break;
        }
      });
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm">
      <div className="dr-scroll max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-xl border border-line-strong bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink">Pull changes</h2>
          <button
            onClick={onClose}
            className="font-mono text-[11px] text-faint hover:text-ink"
          >
            close
          </button>
        </div>

        <div className="p-5">
          {result ? (
            <div className="flex flex-col gap-3">
              {result.applied.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] tracking-[0.14em] text-accent uppercase">
                    Applied
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {result.applied.map((a) => (
                      <li key={a} className="text-[13px] text-ink">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.skipped.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] tracking-[0.14em] text-warn uppercase">
                    Skipped
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {result.skipped.map((s) => (
                      <li key={s.intent} className="text-[13px] text-muted">
                        {s.intent} —{" "}
                        <span className="text-warn">{s.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button
                tone="primary"
                size="sm"
                className="self-start"
                onClick={onClose}
              >
                Done
              </Button>
            </div>
          ) : !source ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13.5px] text-muted">
                Which screen do you want changes from?
              </p>
              {apps.length === 0 && (
                <p className="text-[13px] text-faint">
                  Nothing else here yet — fork this screen, change the copy,
                  then pull from it.
                </p>
              )}
              {apps.map((a) => (
                <button
                  key={a.id}
                  onClick={() => choose(a.id)}
                  className="rounded-lg border border-line px-4 py-3 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
                >
                  <span className="text-[14px] font-medium text-ink">
                    {a.name}
                  </span>
                  <span className="ml-2 font-mono text-[10.5px] text-faint">
                    {a.revisions} changes
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[13.5px] text-muted">
                Pick what you want from{" "}
                <strong className="text-ink">{source.name}</strong>. Each one is
                replayed against your copy.
              </p>
              <ul className="flex flex-col gap-1">
                {source.history.slice(0, -1).map((r) => (
                  <li key={r.id}>
                    <label
                      className={cx(
                        "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
                        picked.includes(r.id)
                          ? "border-accent-line bg-accent-dim"
                          : "border-line hover:bg-surface-2",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={picked.includes(r.id)}
                        onChange={(e) =>
                          setPicked((p) =>
                            e.target.checked
                              ? [...p, r.id]
                              : p.filter((x) => x !== r.id),
                          )
                        }
                        className="mt-1 accent-accent"
                      />
                      <span>
                        <span className="block text-[13px] text-ink">
                          {r.intent}
                        </span>
                        <span className="block font-mono text-[10px] text-faint">
                          {new Date(r.at).toLocaleString()}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {pending && progress && (
                <p className="truncate rounded border border-accent-line bg-accent-dim px-3 py-2 font-mono text-[11px] text-accent">
                  {progress}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  tone="primary"
                  size="sm"
                  disabled={!picked.length || pending}
                  onClick={pull}
                >
                  {pending
                    ? "Replaying…"
                    : picked.length
                      ? `Pull ${picked.length}`
                      : "Pull"}
                </Button>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => setSource(null)}
                >
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

