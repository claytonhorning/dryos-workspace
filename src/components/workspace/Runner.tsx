"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { useTheme } from "@/lib/useTheme";
import { useTimeZone } from "@/lib/useTimeZone";

/**
 * Hosts a running app, answers its data calls, and takes drops.
 *
 * The frame is sandboxed without `allow-same-origin`, so the app inside has an
 * opaque origin: it can run, it can post messages here, and it has no network,
 * no storage and no access to this page. Every request it makes arrives as a
 * message and is served by this component — which is why the app never needs a
 * credential and never meets CORS.
 *
 * That same isolation is why dropping something onto the canvas takes two
 * halves. An iframe swallows the pointer events a drag needs, so the host keeps
 * a transparent sheet over the frame purely to catch them — and forwards each
 * position inward, where the canvas draws the rectangle the tile would take.
 * Nothing is labelled and nothing is drawn out here: what you see is the layout
 * you are about to get.
 *
 * A saved revision arrives as a new `version`, and the new bundle takes a
 * moment to compile and boot. Swapping frames immediately painted that moment
 * as a blank screen — the working dashboard vanished every time something was
 * added to it. So revisions double-buffer: the outgoing frame stays exactly
 * where it is, the incoming one loads invisibly on top, and only when its
 * script has executed (the bundle's script tag is parser-blocking, so `load`
 * means "running", not "requested") do the two trade places. An `updating`
 * chip says why the numbers are a beat old.
 */
export function Runner({
  appId,
  version,
  onError,
  dropping,
  dropSize,
  dropPreview,
  onDropAt,
  placing,
  onResize,
  onMove,
  onRemove,
  onConfigure,
  flush,
  fit,
  editing,
  selected,
  cursor,
  onCursor,
}: {
  appId: string;
  /** The instant this screen is about, ISO, or null for live. */
  cursor?: string | null;
  /** A tile asked to move it. The page owns the answer and sends it back. */
  onCursor?: (at: string | null) => void;
  version: number;
  onError?: (message: string) => void;
  /** Something draggable is in flight, so the canvas should offer targets. */
  dropping?: boolean;
  /** Footprint of the incoming tile, so the frame previews it at the right size. */
  dropSize?: { w: number; h: number };
  /**
   * The live preview of what is being carried, as a bare preview URL. When
   * the frame answers a dragover with a landing, this renders at that exact
   * rectangle — the incoming component itself, where the drop will put it,
   * instead of a dashed box standing in for it.
   */
  dropPreview?: string;
  /**
   * The place on the canvas the frame says the drop would take — null when it
   * never found one, which is a release over ground the tile does not fit on.
   * Guessing a corner there would drop it on top of something.
   */
  onDropAt?: (at: { x: number; y: number } | null) => void;
  /**
   * A drop is being composed and saved. While true the frame keeps the gap
   * open where the tile will land; when it falls without a new revision
   * arriving, the placement failed and the gap is released.
   */
  placing?: boolean;
  /** A tile's corner was dragged inside the frame. */
  onResize?: (index: number, w: number, h: number) => void;
  /**
   * A tile was dragged somewhere else on the canvas inside the frame. At most
   * one other tile comes with it, and only by trading places — a move never
   * pushes anything.
   */
  onMove?: (
    index: number,
    at: { x: number; y: number },
    swap: { index: number; x: number; y: number } | null,
  ) => void;
  /**
   * A tile's ✕ was clicked inside the frame. The frame has already hidden the
   * tile optimistically; resolve false and it is restored.
   */
  onRemove?: (index: number) => Promise<boolean> | boolean | void;
  /** A tile's ⚙ was clicked inside the frame. */
  onConfigure?: (index: number) => void;
  /** Edge to edge: no radius, no border. The screen is the whole view. */
  flush?: boolean;
  /**
   * Render the app at `w × h` and scale it to whatever room there is.
   *
   * Editing next to a panel leaves a narrower canvas than the screen will be
   * launched at, and a narrower canvas is not the same dashboard: tiles are
   * columns wide and pixels tall, so squeezing the width alone changes every
   * proportion on the page. The frame is laid out at the launched size instead
   * and shrunk on the way to the eye — same aspect ratio, same wrap, same
   * everything, smaller. Absent, the frame simply fills its shell.
   */
  fit?: { w: number; h: number; scale: number } | null;
  /**
   * Whether the page is being edited, and which tile the panel currently has
   * open. Both belong to the host — the panel is out here — and the frame needs
   * them to know that a tile is clickable and which one is spoken for. Sent the
   * way the theme is: a message, not a URL, so switching modes does not give the
   * frame a new address and reload the dashboard underneath the cursor.
   */
  editing?: boolean;
  selected?: number | null;
}) {
  /** The visible frame — drops, theme pushes and drag messages address it. */
  const frame = useRef<HTMLIFrameElement | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(0);

  // Queries in flight are reported in the workspace bar, beside what they
  // cost, rather than floated over the canvas's corner — a screen's whole
  // point is that it carries nothing but the dashboard. An event for the same
  // reason the saved mark is one: the nav and the canvas share no parent
  // below the layout.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("dryos:querying", { detail: busy > 0 }),
    );
  }, [busy]);
  // A Runner that unmounts mid-query would otherwise leave the mark stuck on.
  useEffect(
    () => () => {
      window.dispatchEvent(new CustomEvent("dryos:querying", { detail: false }));
    },
    [],
  );
  /** The place on the canvas the frame says the pointer is currently over. */
  const spot = useRef<{ x: number; y: number } | null>(null);
  /**
   * The ghost's rectangle in the frame's own pixels, for floating the live
   * preview of the incoming tile at exactly the place the drop would take.
   * State rather than a ref because it positions an element per answer.
   */
  const [spotRect, setSpotRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  // The carried thing changes or the drag ends — either way the floated
  // preview no longer describes anything.
  useEffect(() => {
    if (!dropping) setSpotRect(null);
  }, [dropping]);
  /**
   * Where the last drop landed, kept until the revision that fills it swaps
   * in. Composing and compiling take a second or two, and a screen that shows
   * nothing at the drop point for that second reads as frozen — so a skeleton
   * stands in the tile's place immediately.
   *
   * It is the ghost's own rectangle, verbatim — the same frame-pixel answer
   * the floated preview tracked all drag long. It used to anchor vertically
   * to the pointer instead, on the theory that the frame might be scrolled;
   * but the rect is viewport-relative (the frame builds it from
   * getBoundingClientRect), and the pointer is exactly what the ghost does
   * NOT follow when it snaps, stops at a neighbour, or holds on unlandable
   * ground — which put the skeleton somewhere the tile was never going to be.
   */
  const [landing, setLanding] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const theme = useTheme();

  /** The revision on screen, and the one loading invisibly behind it. */
  const [live, setLive] = useState(version);
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => {
    setPending(version === live ? null : version);
  }, [version, live]);

  // The stand-in leaves with the swap that makes it redundant — or, when the
  // placement failed, the moment everything has settled back to what it was.
  useEffect(() => {
    if (landing && !placing && pending == null && version === live)
      setLanding(null);
  }, [landing, placing, pending, version, live]);

  // A revision loading behind the live one is reported in the workspace bar,
  // beside the querying mark — same reasoning, same channel: the canvas
  // carries nothing but the dashboard.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("dryos:updating", { detail: pending != null }),
    );
  }, [pending]);
  useEffect(
    () => () => {
      window.dispatchEvent(new CustomEvent("dryos:updating", { detail: false }));
    },
    [],
  );

  // The frame cannot read this document, so the theme has to be handed to it —
  // on load and again whenever it changes under someone's feet.
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ __dryos: "theme", value: theme }, "*");
  }, [theme, live]);

  // The display timezone rides the same channel, for the same reason.
  const tz = useTimeZone();
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ __dryos: "tz", value: tz }, "*");
  }, [tz, live]);

  // Same story for the mode: the frame cannot see the panel, so it is told
  // whether one is open and which tile it is showing. `live` is in the deps
  // because a new revision is a new document that has heard none of this.
  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { __dryos: "mode", edit: Boolean(editing), selected },
      "*",
    );
  }, [editing, selected, live]);

  // And the time cursor, which is the same story a third time: the frame cannot
  // see the bar the scrubber lives in, so it is told which instant the screen is
  // about. Null is live. `live` in the deps for the usual reason — a frame that
  // has just booted heard none of the earlier ones, and a reloaded screen
  // silently snapping back to now would be the worst version of this.
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ __dryos: "cursor", at: cursor ?? null }, "*");
  }, [cursor, live]);

  const answer = useCallback(
    async (win: Window, id: number, op: string, payload: unknown) => {
      setBusy((n) => n + 1);
      try {
        if (op !== "query") throw new Error(`Unknown operation "${op}"`);
        const res = await fetch("/api/workspace/data", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // Stamped here rather than in the frame: the app inside is untrusted
          // and must not be able to bill another screen.
          body: JSON.stringify({ ...(payload as object), appId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Query failed");
        win.postMessage({ __dryos: "result", id, data: json }, "*");
      } catch (err) {
        win.postMessage(
          {
            __dryos: "result",
            id,
            error: err instanceof Error ? err.message : "Query failed",
          },
          "*",
        );
      } finally {
        setBusy((n) => n - 1);
      }
    },
    [appId],
  );

  /** Both frames during a handover; answers go back to whichever one asked. */
  const windows = useRef(new Set<Window>());
  const adopt = useCallback((el: HTMLIFrameElement | null, visible: boolean) => {
    if (el?.contentWindow) windows.current.add(el.contentWindow);
    if (visible) frame.current = el;
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Only listen to our own frames; anything else on the page is not ours.
      if (!e.source || !windows.current.has(e.source as Window)) return;
      const m = e.data as
        | { __dryos: "call"; id: number; op: string; payload: unknown }
        | { __dryos: "error"; message: string }
        | {
            __dryos: "spot";
            x: number;
            y: number;
            rect?: { left: number; top: number; width: number; height: number };
          }
        | { __dryos: "resize"; index: number; w: number; h: number }
        | {
            __dryos: "move";
            index: number;
            x: number;
            y: number;
            swap: { index: number; x: number; y: number } | null;
          }
        | { __dryos: "remove"; index: number }
        | { __dryos: "configure"; index: number }
        | { __dryos: "cursor-set"; at: string | null };
      if (!m || typeof m !== "object") return;
      // Data calls are answered for either frame — the incoming one starts
      // querying while it is still invisible. Layout gestures only mean
      // anything from the one being looked at.
      if (m.__dryos === "call") void answer(e.source as Window, m.id, m.op, m.payload);
      else if (e.source !== frame.current?.contentWindow) return;
      else if (m.__dryos === "error") onError?.(m.message);
      else if (m.__dryos === "spot") {
        spot.current = { x: m.x, y: m.y };
        setSpotRect(m.rect ?? null);
      } else if (m.__dryos === "resize") {
        // The frame has already applied it; this is only the save. Nothing here
        // touches `version`, so the tile is not remounted under the cursor.
        onResize?.(m.index, m.w, m.h);
      } else if (m.__dryos === "move") {
        onMove?.(m.index, { x: m.x, y: m.y }, m.swap);
      } else if (m.__dryos === "remove") {
        // The frame hid the tile before asking; only a failed save puts it
        // back, so the gesture reads as instant on the path that matters.
        const src = e.source as Window;
        void Promise.resolve(onRemove?.(m.index)).then((ok) => {
          if (ok === false) src.postMessage({ __dryos: "restore" }, "*");
        });
      } else if (m.__dryos === "configure") {
        onConfigure?.(m.index);
      } else if (m.__dryos === "cursor-set") {
        // A tile asking the page to move its instant. The frame does not get to
        // decide — it is told the answer on the way back, like every other
        // gesture that crosses this boundary.
        onCursor?.(m.at ?? null);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [answer, onError, onResize, onMove, onRemove, onConfigure, onCursor]);

  // Never let the two slots carry the same revision — between the swap and
  // the effect that clears `pending` there is a render where they could.
  const versions = pending != null && pending !== live ? [live, pending] : [live];

  // A placement that ends without a new revision failed; release the gap the
  // frame has been holding. A successful one ends with the swap replacing the
  // frame, gap and all, with the tile already in place.
  const wasPlacing = useRef(false);
  useEffect(() => {
    const was = wasPlacing.current;
    wasPlacing.current = Boolean(placing);
    if (was && !placing && pending == null && version === live) {
      frame.current?.contentWindow?.postMessage({ __dryos: "dragend" }, "*");
    }
  }, [placing, pending, version, live]);

  return (
    <div
      ref={shell}
      className={cx(
        "relative h-full w-full overflow-hidden bg-code",
        flush ? "" : "rounded-lg border border-line",
      )}
    >
      {versions.map((v) => {
        const visible = v === live;
        return (
          <iframe
            // Keyed by revision: on swap the incoming frame keeps its key and
            // only changes class, so the app that just booted is the app shown
            // — never a third mount.
            key={v}
            ref={(el) => adopt(el, visible)}
            // The revision is in the path, so a saved change gives the frame a
            // new address — no cache busting, and no imperative reload the
            // sandbox would not allow anyway. Theme on the URL so the very
            // first paint is already the right colour.
            src={`/api/workspace/apps/${appId}/bundle/${v}?theme=${theme}`}
            onLoad={(e) => {
              e.currentTarget.contentWindow?.postMessage(
                { __dryos: "theme", value: theme },
                "*",
              );
              // A frame that has just booted knows none of these, and the
              // effects above fired before it existed. The timezone rides the
              // message only, never this frame's URL — on the URL a zone
              // change would change the address and reload the dashboard
              // under the person who picked it, and unlike the theme a clock
              // paints nothing before data arrives, so the message is early
              // enough.
              e.currentTarget.contentWindow?.postMessage(
                { __dryos: "tz", value: tz },
                "*",
              );
              e.currentTarget.contentWindow?.postMessage(
                { __dryos: "mode", edit: Boolean(editing), selected },
                "*",
              );
              e.currentTarget.contentWindow?.postMessage(
                { __dryos: "cursor", at: cursor ?? null },
                "*",
              );
              // The parser-blocking script has run: the new revision is
              // rendering. Now — and only now — it takes the screen. Both
              // states move together, or one render sees two frames wearing
              // the same key.
              if (!visible) {
                setLive(v);
                setPending(null);
              }
            }}
            sandbox="allow-scripts"
            className={cx(
              "absolute top-0 left-0 border-0",
              fit ? "origin-top-left" : "inset-0 h-full w-full",
              visible ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            // Laid out at the launched size, drawn at the size there is room
            // for. Pointer events inside a transformed frame are mapped back by
            // the browser, so dragging and resizing tiles in there is untouched
            // — only positions this component forwards in need the scale taken
            // out of them again.
            style={
              fit
                ? {
                    width: fit.w,
                    height: fit.h,
                    transform: `scale(${fit.scale})`,
                  }
                : undefined
            }
            title="App preview"
          />
        );
      })}
      {/*
        The incoming component itself, floated at the exact rectangle the
        frame's ghost holds — the live preview the panel was already running,
        not a picture of it. Scaled the way the main frame is, and offset by
        the preview document's own 16px root padding so the tile inside lands
        pixel-on-pixel over the ghost. Below the sheet and with pointer events
        off, so the drag it is following never notices it. Mounted once per
        drag (the src is stable) and moved by style, because remounting is a
        recompile.
      */}
      {dropping &&
        dropPreview &&
        spotRect &&
        (() => {
          const s = fit?.scale ?? 1;
          return (
            <iframe
              ref={(el) => {
                if (el?.contentWindow) windows.current.add(el.contentWindow);
              }}
              src={dropPreview}
              sandbox="allow-scripts"
              title="The component being placed"
              className="pointer-events-none absolute z-[5] origin-top-left border-0"
              style={{
                left: (spotRect.left - 16) * s,
                top: (spotRect.top - 16) * s,
                width: spotRect.width + 32,
                height: spotRect.height + 32,
                transform: `scale(${s})`,
              }}
            />
          );
        })()}

      {/*
        A transparent sheet, purely to catch the pointer events the iframe would
        otherwise swallow. Every position is forwarded inward, where the grid
        opens a real gap at the size of the tile that is coming — so there is
        nothing to draw out here, and drawing anything would sit on top of the
        preview that matters.
      */}
      {dropping && (
        <div
          className={cx(
            "absolute inset-0 z-10 ring-1 ring-accent/40 ring-inset",
            flush ? "" : "rounded-lg",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            const r = shell.current?.getBoundingClientRect();
            // The frame answers in its own coordinates, and a scaled frame's
            // are larger than the ones out here — so the scale comes back out
            // before the position is sent in.
            const s = fit?.scale ?? 1;
            frame.current?.contentWindow?.postMessage(
              {
                __dryos: "dragover",
                x: (e.clientX - (r?.left ?? 0)) / s,
                y: (e.clientY - (r?.top ?? 0)) / s,
                w: dropSize?.w ?? 6,
                h: dropSize?.h ?? 240,
              },
              "*",
            );
          }}
          onDragLeave={() => {
            setSpotRect(null);
            frame.current?.contentWindow?.postMessage(
              { __dryos: "dragend" },
              "*",
            );
          }}
          onDrop={(e) => {
            e.preventDefault();
            // Not "dragend": the gap stays open, pulsing, until the revision
            // that fills it swaps in. Closing it here reflowed the whole page
            // twice — once to take the gap out, once to put the tile in.
            frame.current?.contentWindow?.postMessage(
              { __dryos: "placed" },
              "*",
            );
            // Something has to occupy the drop point *now* — the save takes a
            // second or two, and an empty spot for that second reads as a
            // screen that ignored the gesture. It stands exactly where the
            // ghost was, because that is where the tile is going to be.
            if (spot.current && spotRect) setLanding(spotRect);
            setSpotRect(null);
            // The frame decided where; it told us on the last dragover.
            onDropAt?.(spot.current);
            spot.current = null;
          }}
        />
      )}

      {/*
        The dropped tile, as a skeleton, the instant the hand lets go. The real
        one arrives with the next revision; until then this pulses in its place
        so the gesture visibly took. The rectangle is the ghost's own — the
        frame's last answer, in frame pixels, scaled back out the same way the
        floated preview was — so the skeleton stands exactly where the drop is
        going to put the tile, not merely near the pointer.
      */}
      {landing &&
        (() => {
          const s = fit?.scale ?? 1;
          return (
            <div
              className="pointer-events-none absolute z-10 animate-pulse rounded-md border border-line bg-surface-2/90"
              style={{
                left: landing.left * s,
                top: landing.top * s,
                width: landing.width * s,
                height: landing.height * s,
              }}
            >
              <div className="m-2 h-3 w-24 max-w-[60%] rounded bg-surface-3" />
            </div>
          );
        })()}
    </div>
  );
}
