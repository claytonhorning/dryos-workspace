"use client";

import Link from "next/link";
import { cx } from "@/components/ui";

/** One top-level destination. Hidden on small screens; the strip below carries them there. */
export function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
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

/** The same destinations again, scrollable, for widths that cannot hold a row. */
export function MobileStrip({ links }: { links: { href: string; label: string }[] }) {
  return (
    <div className="dr-scroll flex gap-1 overflow-x-auto border-t border-line px-4 py-2 md:hidden">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="rounded-md px-2.5 py-1 text-[13px] whitespace-nowrap text-muted"
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}

export function Caret({ open }: { open: boolean }) {
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

export function Shell({ children, strip }: { children: React.ReactNode; strip: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-1 px-6">{children}</div>
      {strip}
    </>
  );
}
