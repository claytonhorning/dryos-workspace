"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/Logo";
import { Select } from "@/components/Select";
import { cx } from "@/components/ui";
import { CHOOSABLE, SUBJECTS, useDomain } from "@/lib/domain";

/**
 * The product's left edge: the mark, the domain, the way to the workspaces.
 *
 * The domain is a picker up here rather than a question on the shelf
 * because it is the frame everything else sits in — the shelf says "your
 * Energy workspaces", the community panel names Energy's maintainer, a new
 * workspace is an Energy one — and a frame belongs where it is always in
 * view and always in the same place. It sits small beside the mark rather
 * than as a labelled block under it: it is a setting chosen once and left
 * alone, and a block of its own spent the sidebar's best height on it.
 * Only a domain with streams is offered — one with none would open onto an
 * empty shelf — and the shelf's own chooser shows a declared-but-uncollected
 * domain as coming.
 *
 * Hidden below `md`; the top bar carries a compact copy of the picker there.
 */
export function AppSidebar({ pathname }: { pathname: string }) {
  const { domain, setDomain, ready } = useDomain();
  const subject = SUBJECTS.find((s) => s.id === domain);

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-[var(--sidebar-w)] flex-col border-r border-line bg-bg/90 backdrop-blur-md md:flex">
      {/*
        `--nav-h`, border included, so this divider is the header's bottom
        border continued: the header is 56px plus its 1px line, and a 56px
        block with the line inside it met it one pixel high, as a broken T.
      */}
      <div className="flex h-[var(--nav-h)] shrink-0 items-center justify-between gap-2 border-b border-line pr-3 pl-5">
        <Link href="/workspace" className="flex items-center">
          <Wordmark />
        </Link>
        {ready && domain ? (
          <div title={subject?.blurb}>
            <Select
              value={domain}
              onChange={setDomain}
              options={CHOOSABLE.map((s) => ({ value: s.id, label: s.label }))}
              size="sm"
              align="right"
              aria-label="Domain"
            />
          </div>
        ) : (
          <Link
            href="/workspace"
            className="rounded-md border border-dashed border-line-strong px-1.5 py-0.5 text-[11px] text-muted hover:text-ink"
          >
            {ready ? "Domain" : " "}
          </Link>
        )}
      </div>

      {/* Spending is read from the usage chip in the bar, not from a page
          of its own. */}
      <nav className="flex flex-col gap-0.5 px-2.5 py-3">
        <SideLink
          href="/workspace"
          label="Workspaces"
          icon={<SpacesGlyph />}
          active={pathname.startsWith("/workspace")}
        />
        <SideLink
          href="/docs"
          label="API"
          icon={<ApiGlyph />}
          active={pathname.startsWith("/docs")}
        />
      </nav>
    </aside>
  );
}

function SideLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors",
        active ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2/60 hover:text-ink",
      )}
    >
      {/* The accent tick says "you are here" without a second fill. */}
      <span
        aria-hidden
        className={cx(
          "absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-accent transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <span
        className={cx(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center transition-colors",
          active ? "text-accent" : "text-faint group-hover:text-muted",
        )}
      >
        {icon}
      </span>
      {label}
    </Link>
  );
}

/** A workspace is pages you flip between: tiles on a board. */
function SpacesGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="2" width="5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="2" width="5" height="3.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2" y="10.5" width="5" height="3.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="7.5" width="5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** Angle brackets: the door for programs. */
function ApiGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4M9 3 7 13"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
