"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

/**
 * The app's dropdown. A native <select> paints its menu in the OS's own
 * colours — a rounded near-white sheet over an ink-blue panel — and nothing
 * in CSS reaches it. This is the account menu's idiom instead: a trigger
 * styled like every other input, a panel `absolute top-full` inside a
 * `relative` wrapper, closed by an outside click or Escape.
 *
 * Deliberately still a listbox and nothing more: no search, no groups, no
 * multi-select. Every dropdown in the app is a handful of known choices, and
 * the day one needs more it should become its own control rather than grow
 * this one.
 */

export interface SelectOption {
  value: string;
  label: string;
}

const TRIGGER = {
  md: "px-2.5 py-1.5 text-[12.5px]",
  sm: "px-1.5 py-0.5 text-[11px]",
} as const;

export function Select({
  value,
  options,
  onChange,
  size = "md",
  align = "left",
  mono = false,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  size?: keyof typeof TRIGGER;
  /** Which edge of the trigger the panel hangs from — right for controls
      that sit at the right edge of their container. */
  align?: "left" | "right";
  mono?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  /** The option keyboard focus is on while the panel is open. */
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const openAt = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const pick = (v: string) => {
    setOpen(false);
    if (v !== value) onChange(v);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openAt();
      }
      return;
    }
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(options[active]?.value ?? value);
    } else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={root} className={cx("relative", className)} onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openAt())}
        className={cx(
          "flex w-full items-center gap-1.5 rounded-md border border-line bg-surface-2 text-left text-ink transition-colors outline-none hover:border-line-strong focus-visible:border-line-strong",
          TRIGGER[size],
          mono && "font-mono",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{current?.label ?? value}</span>
        {/* Drawn, not the ▾ glyph: fonts disagree about its size and weight. */}
        <svg
          width="8"
          height="5"
          viewBox="0 0 8 5"
          aria-hidden
          className={cx("shrink-0 text-faint transition-transform", open && "rotate-180")}
        >
          <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className={cx(
            "absolute top-full z-40 mt-1 min-w-full overflow-hidden rounded-md border border-line bg-surface py-1 shadow-[0_10px_28px_rgba(0,0,0,.35)]",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o.value)}
              className={cx(
                "flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left whitespace-nowrap transition-colors",
                size === "sm" ? "text-[11px]" : "text-[12.5px]",
                mono && "font-mono",
                i === active ? "bg-surface-2 text-ink" : "text-muted",
              )}
            >
              {/* The tick reserves its column even unticked, so labels align. */}
              <span className={cx("w-3 shrink-0 text-[10px] text-accent", o.value !== value && "opacity-0")}>
                ✓
              </span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
