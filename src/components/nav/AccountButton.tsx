"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

/**
 * Who you are, and what that gets you.
 *
 * It replaced the usage meter in the chrome. A running total is something you
 * consult, not something you monitor, and it was taking the one spot in the bar
 * that belongs to the account — so the number moved to where the spending
 * happens and this took its place.
 *
 * There is no sign-in yet and the menu says so rather than offering a control
 * that would do nothing. What it does carry is the two things that were only
 * reachable from the old meter.
 */
export function AccountButton() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account"
        title="Account"
        className={cx(
          "grid h-7 w-7 place-items-center rounded-full border text-[11px] font-semibold transition-colors",
          open
            ? "border-accent-line bg-accent-dim text-accent"
            : "border-line-strong bg-surface-2 text-muted hover:text-ink",
        )}
      >
        Y
      </button>

      {open && (
        <div className="dr-rise absolute top-full right-0 mt-1.5 w-56 overflow-hidden rounded-lg border border-line-strong bg-surface shadow-2xl shadow-black/60">
          <div className="border-b border-line px-3 py-2.5">
            <p className="text-[13px] font-medium text-ink">you</p>
            <p className="mt-0.5 font-mono text-[10px] text-faint">this machine</p>
          </div>

          <Link
            href="/usage"
            className="block border-b border-line px-3 py-2 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Usage &amp; billing
          </Link>
          <Link
            href="/docs"
            className="block border-b border-line px-3 py-2 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Docs
          </Link>

          <p className="px-3 py-2 text-[11.5px] leading-relaxed text-faint">
            Accounts are not wired up yet — everything here is local to this
            machine.
          </p>
        </div>
      )}
    </div>
  );
}
