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
 * position inward, where the grid opens a real gap at the size of the tile that
 * is coming. Nothing is labelled and nothing is drawn out here: what you see is
 * the layout you are about to get.
 */
export function Runner({
  appId,
  version,
  onError,
  dropping,
  dropSize,
  onDropAt,
  onResize,
  onReorder,
  flush,
}: {
  appId: string;
  version: number;
  onError?: (message: string) => void;
  /** Something draggable is in flight, so the canvas should offer targets. */
  dropping?: boolean;
  /** Footprint of the incoming tile, so the frame previews it at the right size. */
  dropSize?: { w: number; h: number };
  onDropAt?: (index: number) => void;
  /** A tile's corner was dragged inside the frame. */
  onResize?: (index: number, w: number, h: number) => void;
  /** A tile was dragged onto another one inside the frame. */
  onReorder?: (from: number, to: number) => void;
  /** Edge to edge: no radius, no border. The screen is the whole view. */
  flush?: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(0);
  /** The gap the frame says the pointer is currently over. */
  const slot = useRef<number | null>(null);
  const theme = useTheme();

  // The frame cannot read this document, so the theme has to be handed to it —
  // on load and again whenever it changes under someone's feet.
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ __dryos: "theme", value: theme }, "*");
  }, [theme, version]);

  const answer = useCallback(
    async (id: number, op: string, payload: unknown) => {
      const win = frame.current?.contentWindow;
      if (!win) return;
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

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Only listen to our own frame; anything else on the page is not ours.
      if (e.source !== frame.current?.contentWindow) return;
      const m = e.data as
        | { __dryos: "call"; id: number; op: string; payload: unknown }
        | { __dryos: "error"; message: string }
        | { __dryos: "slot"; index: number }
        | { __dryos: "resize"; index: number; w: number; h: number }
        | { __dryos: "reorder"; from: number; to: number };
      if (!m || typeof m !== "object") return;
      if (m.__dryos === "call") void answer(m.id, m.op, m.payload);
      else if (m.__dryos === "error") onError?.(m.message);
      else if (m.__dryos === "slot") {
        slot.current = m.index;
      } else if (m.__dryos === "resize") {
        // The frame has already applied it; this is only the save. Nothing here
        // touches `version`, so the tile is not remounted under the cursor.
        onResize?.(m.index, m.w, m.h);
      } else if (m.__dryos === "reorder") {
        onReorder?.(m.from, m.to);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [answer, onError, onResize, onReorder]);

  return (
    <div
      ref={shell}
      className={cx(
        "relative h-full w-full overflow-hidden bg-code",
        flush ? "" : "rounded-lg border border-line",
      )}
    >
      <iframe
        // Remount on every revision rather than mutating `src` in place.
        // Reassigning the attribute is supposed to navigate, but a frame that
        // has already loaded does not always act on it — and a preview that
        // silently keeps showing the previous version is worse than no preview.
        key={version}
        ref={frame}
        // The revision is in the path, so a saved change gives the frame a new
        // address and it reloads on its own — no cache busting, no imperative
        // reload call the sandbox would not allow anyway.
        // Also on the URL, so the very first paint is already the right colour
        // rather than a dark flash that corrects itself a beat later.
        src={`/api/workspace/apps/${appId}/bundle/${version}?theme=${theme}`}
        onLoad={() =>
          frame.current?.contentWindow?.postMessage(
            { __dryos: "theme", value: theme },
            "*",
          )
        }
        sandbox="allow-scripts"
        className="h-full w-full border-0"
        title="App preview"
      />
      {busy > 0 && !dropping && (
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
            frame.current?.contentWindow?.postMessage(
              { __dryos: "dragend" },
              "*",
            );
            // The frame decided where; it told us on the last dragover.
            onDropAt?.(slot.current ?? 0);
            slot.current = null;
          }}
        />
      )}
    </div>
  );
}
