"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cx } from "@/components/ui";
import { VERTICALS } from "@/lib/verticals";
import { AccountButton } from "./AccountButton";
import { Caret, MobileStrip, NavLink, Shell } from "./shared";

/**
 * The nav inside the product.
 *
 * No pitch and no call to action: someone here has already decided. What
 * replaces the CTA is the account. Spending used to live here; it moved to where
 * the spending happens, because a running total is something you consult rather
 * than something you watch.
 *
 * The wordmark still goes home, so the argument is reachable, just not in the
 * way.
 */
const LINKS = [
  { href: "/workspace", label: "Workspace" },
  { href: "/docs", label: "Docs" },
];

export function AppNav({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);
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

  const onData = pathname.startsWith("/marketplace") || pathname.startsWith("/datasets");

  return (
    <Shell
      strip={
        <MobileStrip
          links={[
            { href: "/workspace", label: "Workspace" },
            { href: "/marketplace/energy", label: "Data" },
            { href: "/docs", label: "Docs" },
            { href: "/usage", label: "Usage" },
          ]}
        />
      }
    >
      <Link href="/" className="mr-5 flex items-center gap-2.5">
        <Wordmark />
      </Link>

      <NavLink
        href="/workspace"
        label="Workspace"
        active={pathname.startsWith("/workspace")}
      />

      <div ref={wrap} className="relative hidden md:block">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={cx(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors",
            onData || open
              ? "bg-surface-2 text-ink"
              : "text-muted hover:bg-surface-2 hover:text-ink",
          )}
        >
          Data
          <Caret open={open} />
        </button>

        {open && (
          <div className="dr-rise absolute top-full left-0 mt-1.5 w-[420px] overflow-hidden rounded-lg border border-line-strong bg-surface shadow-2xl shadow-black/60">
            {VERTICALS.map((v) => {
              const live = v.status === "live";
              const inner = (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className={cx("text-[14px] font-medium", live ? "text-ink" : "text-muted")}
                    >
                      {v.name}
                    </span>
                    <span
                      className={cx(
                        "rounded-full border px-1.5 py-[1px] font-mono text-[9.5px] tracking-[0.1em] uppercase",
                        live
                          ? "border-accent-line bg-accent-dim text-accent"
                          : "border-line bg-surface-2 text-faint",
                      )}
                    >
                      {live ? "Live" : "Later"}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{v.blurb}</p>
                </>
              );
              return live ? (
                <Link
                  key={v.id}
                  href={`/marketplace/${v.id}`}
                  className="block border-b border-line px-4 py-3.5 transition-colors last:border-0 hover:bg-surface-2"
                >
                  {inner}
                </Link>
              ) : (
                <div
                  key={v.id}
                  className="block cursor-default border-b border-line px-4 py-3.5 opacity-70 last:border-0"
                >
                  {inner}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {LINKS.filter((l) => l.href !== "/workspace").map((l) => (
        <NavLink key={l.href} {...l} active={pathname.startsWith(l.href)} />
      ))}

      <div className="ml-auto flex items-center gap-2.5">
        <ThemeToggle />
        <AccountButton />
      </div>
    </Shell>
  );
}
