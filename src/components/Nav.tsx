"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { VERTICALS } from "@/lib/verticals";
import { Wordmark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { ButtonLink, cx } from "./ui";

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onMarketplace =
    pathname.startsWith("/marketplace") || pathname.startsWith("/datasets");

  return (
    <header
      ref={navRef}
      className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md"
    >
      <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-1 px-6">
        <Link href="/" className="mr-5 flex items-center gap-2.5">
          <Wordmark />
        </Link>

        <div className="relative hidden md:block">
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className={cx(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors",
              onMarketplace || open
                ? "bg-surface-2 text-ink"
                : "text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            Marketplace
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
                        className={cx(
                          "text-[14px] font-medium",
                          live ? "text-ink" : "text-muted",
                        )}
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
                        {live ? "First" : "Later"}
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

        <NavLink href="/docs" label="Docs" active={pathname.startsWith("/docs")} />
        <NavLink
          href="/maintainers"
          label="For maintainers"
          active={pathname.startsWith("/maintainers")}
        />

        <div className="ml-auto flex items-center gap-2.5">
          <ThemeToggle />
          <ButtonLink href="/marketplace/energy" tone="primary" size="sm">
            Get early access
          </ButtonLink>
        </div>
      </div>

      <div className="dr-scroll flex gap-1 overflow-x-auto border-t border-line px-4 py-2 md:hidden">
        <Link href="/marketplace/energy" className="rounded-md px-2.5 py-1 text-[13px] whitespace-nowrap text-muted">
          Energy
        </Link>
        <Link href="/docs" className="rounded-md px-2.5 py-1 text-[13px] whitespace-nowrap text-muted">
          Docs
        </Link>
        <Link href="/maintainers" className="rounded-md px-2.5 py-1 text-[13px] whitespace-nowrap text-muted">
          For maintainers
        </Link>
      </div>
    </header>
  );
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cx(
        "hidden rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors md:block",
        active ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className={cx("transition-transform", open && "rotate-180")}
    >
      <path
        d="M2 3.5 L5 6.5 L8 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
