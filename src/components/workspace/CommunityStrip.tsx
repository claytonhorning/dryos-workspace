"use client";

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { cx } from "@/components/ui";
import {
  COMPONENTS,
  DEFAULT_LAYOUT,
  withDefaults,
} from "@/lib/workspace/components";
import type { PublishedComponent } from "@/lib/workspace/community";
import { usePreviewHost } from "@/lib/workspace/usePreviewHost";
import { DRAG_TYPE, type TrayPayload } from "./BuildPanel";

/**
 * The community shelf, under the screen.
 *
 * A page used to start from bare data: pick chips, pick a shape, arrange. The
 * strip beneath the canvas now leads with what other people already decided —
 * every published component is a whole decision (a stream, its entities, a
 * shape, its settings), and starting from one beats starting from an empty
 * grid. It also keeps the canvas letterboxed at the launched aspect while the
 * panel is open, which is the other half of its job.
 *
 * Same rule as the build panel's shelf: **a card only opens; the running
 * preview is the only drag handle.** Clicking a card runs the real component on
 * live data right there in the strip, and dragging that preview onto the
 * screen places exactly what was being looked at.
 */
export function CommunityStrip({
  onDragStateChange,
  reloadKey,
}: {
  onDragStateChange: (payload: TrayPayload | null) => void;
  reloadKey: number;
}) {
  const [community, setCommunity] = useState<
    PublishedComponent[]
  >([]);
  const [openId, setOpenId] = useState<string | null>(null);
  /**
   * The preview frame's inner height, measured from the strip when the card is
   * opened. The strip's height is whatever the letterboxed canvas left over,
   * so it cannot be a constant — but it is measured once per open rather than
   * observed, because a frame that reloads under a panel drag is a preview
   * flickering exactly while someone is judging it.
   */
  const [ph, setPh] = useState(240);
  const body = useRef<HTMLDivElement>(null);
  const frame = usePreviewHost();

  useEffect(() => {
    fetch("/api/workspace/components")
      .then((r) => r.json())
      .then((d) => setCommunity(d.community ?? []))
      .catch(() => {});
  }, [reloadKey]);

  const open =
    community.find((c) => c.id === openId) ?? null;
  const def = open
    ? COMPONENTS.find((d) => d.kind === open.kind)
    : null;
  const options =
    open && def ? withDefaults(def, open.options) : {};

  /** Clicking the open card puts the preview away; any other card swaps it. */
  function show(c: PublishedComponent) {
    if (openId === c.id) {
      setOpenId(null);
      return;
    }
    // The generated grid keeps its own gutter, so the tile is composed a
    // little shorter than the box it fills.
    const room =
      body.current?.getBoundingClientRect().height ?? 256;
    setPh(Math.max(140, Math.round(room) - 16));
    setOpenId(c.id);
  }

  const src = open
    ? `/api/workspace/preview?${new URLSearchParams({
        bare: "1",
        community: open.id,
        options: JSON.stringify(options),
        w: "12",
        h: String(ph),
      }).toString()}`
    : null;

  function grab(e: DragEvent) {
    if (!open || !def) return;
    e.dataTransfer.setData(DRAG_TYPE, "1");
    e.dataTransfer.effectAllowed = "copy";
    // What lands is what was being looked at — including its size, so the box
    // is measured as the hand takes it.
    const box = (
      e.currentTarget as HTMLElement
    ).getBoundingClientRect();
    onDragStateChange({
      kind: def.kind,
      options,
      custom: open.custom ?? undefined,
      refs: open.refs,
      layout: open.layout ?? DEFAULT_LAYOUT[def.kind],
      px: { w: box.width, h: box.height },
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
        <span className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
          Community
        </span>
        <span className="min-w-0 truncate font-mono text-[9.5px] text-faint">
          {open
            ? "drag the preview onto the screen to place it"
            : "click to preview"}
        </span>
        {open && (
          <button
            onClick={() => setOpenId(null)}
            className="ml-auto shrink-0 font-mono text-[10px] text-faint transition-colors hover:text-ink"
          >
            close preview
          </button>
        )}
      </div>

      <div
        ref={body}
        className="flex min-h-0 flex-1 gap-3 px-3 py-2"
      >
        {/* The shelf: wraps into as many columns as the strip's width holds. */}
        <div className="dr-scroll grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(200px,1fr))] content-start gap-2 overflow-y-auto">
          {community.length === 0 ? (
            <p className="col-span-full text-[12px] text-faint">
              Nothing published yet. Components published to
              the community appear here, ready to drop onto
              your screen.
            </p>
          ) : (
            community.map((c) => {
              const d = COMPONENTS.find(
                (x) => x.kind === c.kind,
              );
              if (!d) return null;
              const on = openId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => show(c)}
                  className={cx(
                    "flex flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                    on
                      ? "border-accent-line bg-accent-dim"
                      : "border-line hover:border-line-strong hover:bg-surface-2",
                  )}
                >
                  <span className="truncate text-[12.5px] font-medium text-ink">
                    {c.name}
                  </span>
                  <span className="line-clamp-2 text-[11px] leading-snug text-muted">
                    {c.blurb}
                  </span>
                  <span className="mt-auto pt-0.5 font-mono text-[9.5px] text-faint">
                    {d.name} · by {c.author}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/*
          The component itself, running on live data, taking the right of the
          strip. The widget is the handle: what you drag is what lands, so the
          accent border belongs to the thing being carried.
        */}
        {open && def && src && (
          <div
            draggable
            onDragStart={grab}
            onDragEnd={() => onDragStateChange(null)}
            title="Drag onto the page to place exactly what you see"
            className="relative w-[min(460px,45%)] shrink-0 cursor-grab overflow-hidden rounded-md border border-accent bg-code active:cursor-grabbing"
          >
            {/*
              Bled past the box by the frame's own 16px root padding, so the
              component reaches the border on every side. The box is then
              exactly the tile: the drag payload measures it, and what lands is
              the size that was being looked at.
            */}
            <iframe
              ref={frame}
              key={`${open.id}:${ph}`}
              src={src}
              sandbox="allow-scripts"
              className="absolute border-0"
              style={{
                inset: -16,
                width: "calc(100% + 32px)",
                height: "calc(100% + 32px)",
              }}
              title="Community component preview"
            />
            {/*
              Pointer events do not cross into an iframe, so a drag started
              over the frame would never reach the wrapper. A transparent
              sheet catches it, and carries the one label in the strip.
            */}
            <div className="absolute inset-0 flex items-start justify-start p-1.5">
              <span className="pointer-events-none rounded border border-accent-line bg-surface/85 px-1.5 py-[2px] font-mono text-[9.5px] tracking-[0.08em] text-accent uppercase backdrop-blur">
                ⠿ drag onto the screen
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
