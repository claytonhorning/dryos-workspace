"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { Caret } from "./shared";

/**
 * The marketing bar's dropdowns.
 *
 * A bar of six flat links said what the pages were called and nothing about
 * what is behind them — which for a catalogue of 134 streams across nine
 * publishers is most of the product. Each menu is a panel: a lead block that
 * makes the case and says where to start, then the destinations grouped the
 * way somebody would ask for them.
 *
 * Opened on hover *and* on click, closed on Escape, on a click outside, and on
 * the pointer or the focus leaving the group. Hover alone is a trap for anyone
 * on a touch screen or a keyboard, and click alone loses the gesture everybody
 * expects from a bar like this — so the button is a real button with
 * `aria-expanded`, and the pointer is a shortcut to the same state.
 *
 * The button only ever *opens*. Toggling on click looks right and is not: a
 * mouse user hovers the button (which opens the panel) and then clicks it,
 * and a toggle reads that as "close" — so the menu shuts on the very gesture
 * meant to open it. Closing belongs to Escape, to a press outside, and to the
 * pointer leaving; each of those is unambiguous about what was intended.
 *
 * The close is delayed a beat: the panel hangs below the bar with a gap the
 * pointer has to cross, and closing on the first `mouseleave` shuts it
 * mid-journey. Nothing here is a `<details>` or a CSS `:hover` panel, because
 * both fail one of the two entry paths.
 */

export interface MenuItem {
  label: string;
  href: string;
  /** One line under the label. Absent for a bare list of names. */
  body?: string;
  /** Right-aligned count or tag, for a list where the size is the point. */
  tag?: string;
  /** Leaves the site. */
  external?: boolean;
}

export interface MenuGroup {
  heading: string;
  items: MenuItem[];
  /** Lay the group's items out in two columns — for a long list of names. */
  dense?: boolean;
}

export interface Menu {
  label: string;
  /** The panel's own opening argument, on the left. */
  lead: { title: string; body: string; href: string; cta: string };
  groups: MenuGroup[];
}

/** How long the pointer may be off both the button and the panel. */
const CLOSE_DELAY_MS = 120;

export function MegaMenu({ menu, active }: { menu: Menu; active: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const panelId = useId();

  const cancelClose = () => window.clearTimeout(timer.current);
  const closeSoon = () => {
    cancelClose();
    timer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // A press anywhere else closes it — including on another menu's button,
    // which then opens its own on the same gesture.
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div
      ref={wrap}
      className="hidden md:block"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={closeSoon}
      // Tabbing out of the group closes it; tabbing between the button and
      // the panel's links does not, because both are inside this element.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
        className={cx(
          "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors",
          open || active ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
        )}
      >
        {menu.label}
        <Caret open={open} />
      </button>

      {open && (
        <div
          id={panelId}
          // Fixed, not absolute: the bar is `sticky` with a backdrop filter,
          // which creates a containing block an absolutely-positioned panel
          // would be trapped and clipped by.
          className="fixed inset-x-0 top-(--nav-h) z-50 px-6"
        >
          <div className="mx-auto max-w-[1240px]">
            <div className="dr-menu-in ml-0 w-fit max-w-full overflow-hidden rounded-xl border border-line bg-bg/95 shadow-2xl backdrop-blur-md">
              <div className="grid gap-x-8 gap-y-6 p-5 lg:grid-cols-[minmax(0,260px)_auto]">
                <Link
                  href={menu.lead.href}
                  className="group flex flex-col justify-between rounded-lg border border-line bg-surface/70 p-4 transition-colors hover:border-accent-line"
                >
                  <div>
                    <p className="text-[15px] font-semibold text-ink">{menu.lead.title}</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{menu.lead.body}</p>
                  </div>
                  <span className="mt-4 text-[13px] font-medium text-accent">
                    {menu.lead.cta} <span aria-hidden>→</span>
                  </span>
                </Link>

                <div className="flex flex-wrap gap-x-10 gap-y-6">
                  {menu.groups.map((g) => (
                    <div key={g.heading} className="min-w-[200px]">
                      <p className="font-mono text-[10.5px] tracking-[0.14em] text-faint uppercase">
                        {g.heading}
                      </p>
                      <ul
                        className={cx(
                          "mt-2.5",
                          g.dense ? "grid grid-cols-2 gap-x-6 gap-y-0.5" : "space-y-0.5",
                        )}
                      >
                        {g.items.map((it) => (
                          <li key={it.href + it.label}>
                            <Item item={it} dense={g.dense} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Item({ item, dense }: { item: MenuItem; dense?: boolean }) {
  const inner = (
    <>
      <span className="flex items-baseline gap-2">
        <span className="text-[13.5px] font-medium text-ink group-hover:text-accent">
          {item.label}
        </span>
        {item.tag && <span className="font-mono text-[10.5px] text-faint">{item.tag}</span>}
        {item.external && (
          <span aria-hidden className="text-[10px] text-faint">
            ↗
          </span>
        )}
      </span>
      {item.body && (
        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{item.body}</span>
      )}
    </>
  );
  const className = cx(
    "group block rounded-md px-2 py-1.5 transition-colors hover:bg-surface-2",
    dense && "py-1",
  );
  return item.external ? (
    <a href={item.href} className={className} rel="noopener">
      {inner}
    </a>
  ) : (
    <Link href={item.href} className={className}>
      {inner}
    </Link>
  );
}
