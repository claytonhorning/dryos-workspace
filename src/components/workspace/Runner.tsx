"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { useTheme } from "@/lib/useTheme";

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
  onDropAt,
  placing,
  onResize,
  onMove,
  onRemove,
  onConfigure,
  flush,
}: {
  appId: string;
  version: number;
  onError?: (message: string) => void;
  /** Something draggable is in flight, so the canvas should offer targets. */
  dropping?: boolean;
  /** Footprint of the incoming tile, so the frame previews it at the right size. */
  dropSize?: { w: number; h: number };
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
}) {
  /** The visible frame — drops, theme pushes and drag messages address it. */
  const frame = useRef<HTMLIFrameElement | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(0);
  /** The place on the canvas the frame says the pointer is currently over. */
  const spot = useRef<{ x: number; y: number } | null>(null);
  const theme = useTheme();

  /** The revision on screen, and the one loading invisibly behind it. */
  const [live, setLive] = useState(version);
  const [pending, setPending] = useState<number | null>(null);
  useEffect(() => {
    setPending(version === live ? null : version);
  }, [version, live]);

  // The frame cannot read this document, so the theme has to be handed to it —
  // on load and again whenever it changes under someone's feet.
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ __dryos: "theme", value: theme }, "*");
  }, [theme, live]);

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
        | { __dryos: "spot"; x: number; y: number }
        | { __dryos: "resize"; index: number; w: number; h: number }
        | {
            __dryos: "move";
            index: number;
            x: number;
            y: number;
            swap: { index: number; x: number; y: number } | null;
          }
        | { __dryos: "remove"; index: number }
        | { __dryos: "configure"; index: number };
      if (!m || typeof m !== "object") return;
      // Data calls are answered for either frame — the incoming one starts
      // querying while it is still invisible. Layout gestures only mean
      // anything from the one being looked at.
      if (m.__dryos === "call") void answer(e.source as Window, m.id, m.op, m.payload);
      else if (e.source !== frame.current?.contentWindow) return;
      else if (m.__dryos === "error") onError?.(m.message);
      else if (m.__dryos === "spot") {
        spot.current = { x: m.x, y: m.y };
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
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [answer, onError, onResize, onMove, onRemove, onConfigure]);

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
              "absolute inset-0 h-full w-full border-0",
              visible ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            title="App preview"
          />
        );
      })}
      {pending != null && (
        <span className="pointer-events-none absolute top-2 right-2 animate-pulse rounded border border-accent-line bg-surface/80 px-1.5 py-[2px] font-mono text-[10px] text-accent backdrop-blur">
          updating…
        </span>
      )}
      {busy > 0 && !dropping && pending == null && (
        <span className="pointer-events-none absolute top-2 right-2 rounded border border-line bg-surface/80 px-1.5 py-[2px] font-mono text-[10px] text-faint backdrop-blur">
          querying…
        </span>
      )}

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
            frame.current?.contentWindow?.postMessage(
              {
                __dryos: "dragover",
                x: e.clientX - (r?.left ?? 0),
                y: e.clientY - (r?.top ?? 0),
                w: dropSize?.w ?? 6,
                h: dropSize?.h ?? 240,
              },
              "*",
            );
          }}
          onDragLeave={() => {
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
            // The frame decided where; it told us on the last dragover.
            onDropAt?.(spot.current);
            spot.current = null;
          }}
        />
      )}
    </div>
  );
}
