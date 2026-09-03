"use client";

import Link from "next/link";
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
 * view and always in the same place. Property is not offered: it is
 * declared, not collected, and a domain with no streams would open onto
 * an empty shelf. The shelf's own chooser shows it as coming.
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
      <div className="flex h-[var(--nav-h)] shrink-0 items-center border-b border-line px-5">
        <Link href="/workspace" className="flex items-center">
          <Wordmark />
        </Link>
      </div>

      <div className="border-b border-line px-4 py-4">
        <div className="mb-1.5 font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
          Domain
        </div>
        {ready && domain ? (
          <Select
            value={domain}
            onChange={setDomain}
            options={CHOOSABLE.map((s) => ({ value: s.id, label: s.label }))}
            aria-label="Domain"
            className="w-full"
          />
        ) : (
          <Link
            href="/workspace"
            className="block rounded-md border border-dashed border-line-strong px-2.5 py-1.5 text-[12.5px] text-muted hover:text-ink"
          >
            {ready ? "Choose a domain" : "\u00a0"}
          </Link>
        )}
        {subject && (
          <p className="mt-2 text-[11px] leading-relaxed text-faint">{subject.blurb}</p>
        )}
      </div>

      {/* Spending is read from the usage chip in the bar, not from a page
          of its own, so the one destination here is the workspaces. */}
      <nav className="flex flex-col gap-0.5 px-3 py-3">
        <SideLink href="/workspace" label="Workspaces" active={pathname.startsWith("/workspace")} />
      </nav>
    </aside>
  );
}

function SideLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cx(
        "rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors",
        active ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
}
