"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cx } from "@/components/ui";

/**
 * Which instant the whole screen is about.
 *
 * The first control in the product that acts on a page rather than on a tile,
 * and that is the entire point of it. A map showing 14:00 next to a chart
 * showing now is a screen lying to somebody, so the instant cannot belong to a
 * component — it has to be one answer the page gives to everything on it.
 *
 * **It lives in the URL**, the same argument `?edit=1` makes: derived rather
 * than copied, there is one answer, it survives a reload, and yesterday's
 * scarcity event can be sent to someone as a link. It also solves a plumbing
 * problem for free — this control sits in the nav, which is rendered by the
 * layout and is nowhere near the page rendering the screen. Two components with
 * no common ancestor both read the query string.
 *
 * **Dragging does not write the URL.** A range input fires continuously, and a
 * `router.replace` per pixel would re-render the route a hundred times across
 * one gesture. So the drag broadcasts on a window event that the page listens
 * for — the screen follows the handle live — and the URL is written once on
 * release, which is also the only moment worth putting in someone's address
 * bar. Same split the tile drag already makes: apply locally, persist on drop.
 *
 * Live is the absence of a cursor, not a position on the scale. That matters:
 * a screen left on a wall must keep advancing, and "live" as the right-hand end
 * of a slider would silently become "an hour ago" an hour later.
 */

/** How far either side of now the scrubber reaches, and at what resolution. */
const BACK_H = 24;
const FORWARD_H = 48;
const STEP_MS = 3_600_000;

/** Broadcast so the page can follow a drag without a route change per frame. */
export const CURSOR_EVENT = "dryos:cursor-scrub";

function hourFloor(ms: number) {
  return Math.floor(ms / STEP_MS) * STEP_MS;
}

function label(at: number, now: number) {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const days = Math.round((hourFloor(at) - hourFloor(now)) / 86_400_000);
  if (days === 0) return time;
  if (days === 1) return `${time} tomorrow`;
  if (days === -1) return `${time} yesterday`;
  return `${time} ${d.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

export function TimeDock() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = params.get("t");

  const [open, setOpen] = useState(false);
  // `now` is captured rather than read live so the scale does not slide under
  // the handle while somebody is dragging it.
  const [now, setNow] = useState(() => hourFloor(Date.now()));
  const [draft, setDraft] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const parsed = fromUrl ? Date.parse(fromUrl) : NaN;
  const committed = Number.isNaN(parsed) ? null : parsed;
  const at = draft ?? committed;

  // A screen left open should not keep offering a scale centred on this
  // morning. Only refreshed while live, so it cannot move the ground under a
  // cursor somebody has set.
  useEffect(() => {
    if (at !== null) return;
    const id = setInterval(() => setNow(hourFloor(Date.now())), 60_000);
    return () => clearInterval(id);
  }, [at]);

  const broadcast = useCallback((value: number | null) => {
    window.dispatchEvent(
      new CustomEvent(CURSOR_EVENT, {
        detail: value === null ? null : new Date(value).toISOString(),
      }),
    );
  }, []);

  const commit = useCallback(
    (value: number | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null) next.delete("t");
      else next.set("t", new Date(value).toISOString());
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      setDraft(null);
    },
    [params, pathname, router],
  );

  // Outside click and Escape, the same way the account menu and the usage dock
  // close — one idiom for every panel that grows out of the bar.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const min = now - BACK_H * STEP_MS;
  const max = now + FORWARD_H * STEP_MS;
  const value = at ?? now;
  const past = at !== null && at < now;

  return (
    <div ref={wrap} className="relative flex shrink-0 items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={at === null ? "Live — pick a time" : `Showing ${label(at, now)}`}
        className={cx(
          "flex items-center gap-1.5 rounded border px-2 py-1 text-[12px] transition-colors",
          at === null
            ? "border-line bg-surface-2 text-muted hover:text-ink"
            : "border-accent-line bg-accent-dim text-accent",
        )}
      >
        {at === null ? (
          <>
            {/* The one moving thing in the bar, and only while it is true. */}
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Live
          </>
        ) : (
          <>
            <span className="tabular-nums">{label(at, now)}</span>
            {!past && <span className="text-[10px] uppercase tracking-wider">fcst</span>}
          </>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-[320px] rounded border border-line-strong bg-surface p-3 shadow-[var(--dr-shadow)]"
        >
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-ink tabular-nums">
              {at === null ? "Live" : label(at, now)}
            </span>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                broadcast(null);
                commit(null);
              }}
              disabled={at === null}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:text-accent disabled:opacity-40 disabled:hover:text-muted"
            >
              Back to live
            </button>
          </div>

          <input
            type="range"
            min={min}
            max={max}
            step={STEP_MS}
            value={value}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDraft(v);
              broadcast(v);
            }}
            // Release is the commit. Both events, because a keyboard user never
            // sends a pointer up and would otherwise scrub a screen whose URL
            // never caught up.
            onPointerUp={() => draft !== null && commit(draft)}
            onKeyUp={() => draft !== null && commit(draft)}
            aria-label="Time shown on this screen"
            className="dr-range w-full"
          />

          {/* `now` is placed where it actually falls on the scale, not in the
              middle of the row: the window is asymmetric — a day back, two days
              forward — and a centred label would put the present in the wrong
              place on its own ruler. */}
          <div className="relative mt-1 h-3 text-[10px] text-faint tabular-nums">
            <span className="absolute left-0">−{BACK_H}h</span>
            <span
              className={cx("absolute -translate-x-1/2", at === null && "text-accent")}
              style={{ left: `${(BACK_H / (BACK_H + FORWARD_H)) * 100}%` }}
            >
              now
            </span>
            <span className="absolute right-0">+{FORWARD_H}h</span>
          </div>

          <p className="mt-2 text-[11px] leading-snug text-faint">
            Every tile on this screen answers for the same instant. Past is
            recorded, ahead is forecast — and a stream that has neither simply
            shows nothing there.
          </p>
        </div>
      )}
    </div>
  );
}
