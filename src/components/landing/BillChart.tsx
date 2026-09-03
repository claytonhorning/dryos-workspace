"use client";

import { useGSAP } from "@gsap/react";
import { useCallback, useRef, useState } from "react";
import {
  DUR,
  EASE,
  gsap,
  useAnimSetup,
  useReducedMotion,
  whenVisible,
} from "@/components/hero/anim";
import { cx } from "@/components/ui";

/**
 * Two invoices for the same dollar.
 *
 * The chart makes one distinction only: grey is the company that grew around
 * the data, color is the data. Every org-chart line item wears the same grey
 * on purpose, so eight segments read as one block rather than eight causes, and
 * the accent sliver at the end of the first bar is the argument. Identity of an
 * individual segment comes from the legend (same order, left to right) and from
 * hover, never from telling greys apart.
 *
 * The Porsche is two percent — small enough to be a plausible line, too small
 * to be seen in a bar of greys — so it gets confetti instead of size: a small,
 * quiet burst off the legend line when it is hovered, and nowhere else. Not on
 * the bar, and not on scroll — the chart is an argument about money, and the
 * joke gets one line of it.
 *
 * The shares are illustrative. They are not anyone's audited books, and the
 * footnote says so.
 */
type Kind = "org" | "source" | "dryos";

type Line = {
  label: string;
  share: number;
  kind: Kind;
  note?: string;
  /** The line that celebrates itself. */
  confetti?: boolean;
};

const VENDOR: Line[] = [
  { label: "Sales team", share: 26, kind: "org", note: "Whose quarter depends on you renewing." },
  { label: "Customer success", share: 16, kind: "org", note: "Onboarding decks and quarterly check-ins." },
  { label: "Marketing and conferences", share: 15, kind: "org", note: "The booth, the lanyards, the steak dinner." },
  { label: "Executive compensation", share: 18, kind: "org" },
  {
    label: "The CEO's daughter's 16th-birthday Porsche",
    share: 2,
    kind: "org",
    note: "Happy birthday. You paid for it.",
    confetti: true,
  },
  { label: "Office lease", share: 9, kind: "org" },
  { label: "Legal and procurement", share: 6, kind: "org", note: "Six weeks of contract for a two-day integration." },
  { label: "The person who actually understands the source", share: 8, kind: "source" },
];

const DRYOS: Line[] = [
  {
    label: "Dryos fee",
    share: 30,
    kind: "dryos",
    note: "Infrastructure, databases, hosting, validation and metering.",
  },
  {
    label: "The maintainer's time and expertise",
    share: 70,
    kind: "source",
    note: "Paid every time you query. The feed being right is their whole job.",
  },
];

const FILL: Record<Kind, string> = {
  org: "bg-line-strong",
  source: "bg-accent",
  dryos: "bg-info",
};

/* Host tokens only — the series slots live inside the frame and would resolve
   to nothing out here. Five statuses is plenty of colors for a small party. */
const CONFETTI = ["bg-accent", "bg-info", "bg-warn", "bg-stale", "bg-fail"];
const PIECES = 12;

export function BillChart() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Invoice
        title="A data vendor's invoice"
        lines={VENDOR}
        headline="reaches the person who understands the source"
      />
      <Invoice title="Your Dryos invoice" lines={DRYOS} headline="goes to the maintainer" accent />
    </div>
  );
}

function Invoice({
  title,
  lines,
  headline,
  accent,
}: {
  title: string;
  lines: Line[];
  headline: string;
  accent?: boolean;
}) {
  useAnimSetup();
  const reduced = useReducedMotion();
  const bar = useRef<HTMLDivElement>(null);
  const confetti = useRef<HTMLDivElement>(null);
  const lastBurst = useRef(0);
  const [hot, setHot] = useState<string | null>(null);

  const toSource = lines.filter((l) => l.kind === "source").reduce((n, l) => n + l.share, 0);

  const burst = useCallback(() => {
    const layer = confetti.current;
    if (!layer || reduced) return;
    const now = performance.now();
    if (now - lastBurst.current < 1200) return;
    lastBurst.current = now;

    const pieces = Array.from(layer.children) as HTMLElement[];
    gsap.killTweensOf(pieces);
    gsap.set(pieces, { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 });
    pieces.forEach((p, i) => {
      const dx = gsap.utils.random(-26, 26);
      const up = gsap.utils.random(-16, -34);
      gsap
        .timeline({ delay: i * 0.015 })
        .to(p, {
          x: dx * 0.6,
          y: up,
          rotation: gsap.utils.random(-120, 120),
          duration: 0.32,
          ease: "power2.out",
        })
        .to(p, {
          x: dx,
          y: 14,
          rotation: `+=${gsap.utils.random(60, 180)}`,
          opacity: 0,
          duration: 0.7,
          ease: "power1.in",
        });
    });
  }, [reduced]);

  useGSAP(
    () => {
      if (reduced || !bar.current) return;
      const el = bar.current;
      return whenVisible(() => {
        gsap.from(Array.from(el.children), {
          scaleX: 0,
          transformOrigin: "0% 50%",
          duration: DUR.base,
          ease: EASE,
          stagger: 0.05,
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
        });
      });
    },
    { scope: bar, dependencies: [reduced] },
  );

  return (
    <div
      className={cx(
        "rounded-lg border p-5",
        accent ? "border-accent-line bg-accent-dim/30" : "border-line bg-surface",
      )}
    >
      <div className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">{title}</div>
      <div className="mt-2 flex items-baseline gap-2.5">
        <span
          className={cx(
            "font-mono text-[34px] leading-none tabular-nums tracking-tight",
            accent ? "text-accent" : "text-ink",
          )}
        >
          {toSource}%
        </span>
        <span className="text-[13.5px] text-muted">{headline}</span>
      </div>

      <div
        ref={bar}
        role="img"
        aria-label={`${title}: ${lines.map((l) => `${l.label} ${l.share}%`).join(", ")}`}
        className="mt-5 flex h-8 w-full gap-[2px] overflow-hidden rounded-md"
      >
        {lines.map((l) => (
          <div
            key={l.label}
            style={{ flexGrow: l.share, flexBasis: 0 }}
            title={`${l.label} · ${l.share}%`}
            onMouseEnter={() => setHot(l.label)}
            onMouseLeave={() => setHot(null)}
            className={cx(
              "h-full min-w-[2px] transition-opacity duration-200",
              FILL[l.kind],
              hot && hot !== l.label && "opacity-30",
            )}
          />
        ))}
      </div>

      <ul className="mt-5 space-y-2">
        {lines.map((l) => {
          const dim = hot !== null && hot !== l.label;
          return (
            <li
              key={l.label}
              onMouseEnter={() => {
                setHot(l.label);
                if (l.confetti) burst();
              }}
              onMouseLeave={() => setHot(null)}
              className={cx(
                "relative flex items-start gap-3 rounded-md transition-opacity duration-200",
                dim && "opacity-45",
              )}
            >
              <span
                aria-hidden
                className={cx("mt-[6px] h-2.5 w-2.5 shrink-0 rounded-[3px]", FILL[l.kind])}
              />
              {l.confetti && (
                // Off the swatch, the one mark on the line that is not text.
                <div
                  ref={confetti}
                  aria-hidden
                  className="pointer-events-none absolute top-[11px] left-[5px] h-0 w-0"
                >
                  {Array.from({ length: PIECES }, (_, i) => (
                    <span
                      key={i}
                      className={cx(
                        "absolute -top-[3px] -left-[1.5px] block h-[6px] w-[3px] rounded-[1px] opacity-0",
                        CONFETTI[i % CONFETTI.length],
                      )}
                    />
                  ))}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className={cx(
                      "text-[13.5px]",
                      l.kind === "org" ? "text-muted" : "font-semibold text-ink",
                    )}
                  >
                    {l.label}
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-faint">{l.share}%</span>
                </div>
                {l.note && <div className="text-[12px] leading-snug text-faint">{l.note}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
