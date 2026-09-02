import type { ReactNode } from "react";
import { cx } from "@/components/ui";

/**
 * One band of the landing page.
 *
 * Every section is a nav destination, so each carries its id and a scroll
 * margin the height of the sticky bar: without it an anchor jump lands the
 * heading underneath the nav, which reads as the link missing by a line.
 * `band` alternates the ground so the page reads as sections rather than one
 * long column.
 */
export function Section({
  id,
  band = false,
  children,
  className,
}: {
  id: string;
  band?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cx("scroll-mt-(--nav-h)", band && "border-y border-line bg-surface/40", className)}
    >
      <div className="mx-auto max-w-[1240px] px-6 py-16 lg:py-20">{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">{children}</div>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-3 max-w-[24ch] text-[clamp(1.7rem,3.2vw,2.4rem)] leading-[1.08] font-semibold tracking-[-0.03em] text-balance text-ink">
      {children}
    </h2>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-[58ch] text-[16px] leading-[1.7] text-muted">{children}</p>;
}
