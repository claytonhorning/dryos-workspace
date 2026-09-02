"use client";

import Link from "next/link";
import { Atmosphere } from "./Atmosphere";
import { HeadlineReveal, Reveal } from "./Reveal";
import { MaintainerRing } from "./MaintainerRing";
import { ButtonLink } from "@/components/ui";

/**
 * Landing hero.
 *
 * Two halves of one argument. The copy says who the invoice pays; the panel
 * beside it is those people, revolving. It has been a code snippet (right when
 * the offer was an integration) and a running dashboard (right when the offer
 * was the workspace). The offer is the marketplace, and a marketplace is
 * people, so the panel is the people.
 *
 * The headline, the subcopy and the actions are readable at first paint and
 * never move: a hero that withholds its pitch until the visitor scrolls costs
 * more than the animation earns.
 *
 * Entrance order is deliberate — eyebrow, headline, prose, actions, then the panel
 * resolving beside them. The page assembles itself roughly in the order you
 * would read it.
 */
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-bg">
      {/*
        GSAP sets the "from" state on the client, so the server HTML is the
        finished page. A visitor whose JavaScript never arrives reads everything
        — which is the opposite of what happens when a library serialises its
        initial hidden state into the markup.
      */}
      <Atmosphere />

      <div className="relative mx-auto max-w-[1240px] px-6 pt-16 pb-20 lg:pt-24 lg:pb-28">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)] lg:gap-12">
          {/* ── Argument ────────────────────────────────────────────── */}
          <div>
            <Reveal delay={0.05} y={10}>
              <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
                You&rsquo;ve heard of data vendor lock-in,
                but
              </p>
            </Reveal>

            <HeadlineReveal
              delay={0.12}
              className="mt-7 max-w-[22ch] text-[clamp(2.1rem,4.6vw,3.4rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-balance text-ink"
            >
              Have You Heard of Data&nbsp;Vendor{" "}
              <span className="text-accent">
                C*ck Blockin&rsquo;
              </span>
              ?
            </HeadlineReveal>

            <Reveal delay={0.55}>
              <p className="mt-7 max-w-[50ch] text-[16px] leading-[1.7] text-muted">
                Every data vendor started as one person who
                understood a source, then grew an org chart
                around them. Now that an agent builds the
                dashboard in an afternoon, the only thing
                worth paying for is the person who keeps the
                feed correct. Dryos pays them, per query,
                and nobody else.
              </p>
            </Reveal>

            <Reveal delay={0.68}>
              <div className="mt-9 flex flex-wrap items-center gap-2.5">
                <ShimmerLink href="/workspace">
                  Get started
                </ShimmerLink>
                <ButtonLink
                  href="#how-it-works"
                  tone="secondary"
                >
                  How it works
                </ButtonLink>
              </div>
            </Reveal>

            <Reveal delay={0.8}>
              <ul className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.1em] text-faint uppercase">
                {[
                  "no credit card required",
                  "clean, validated data",
                  "beautiful visualizations",
                ].map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2"
                  >
                    <span className="h-[3px] w-[3px] rounded-full bg-line-strong" />
                    {f}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          {/* ── Evidence ────────────────────────────────────────────── */}
          <Reveal delay={0.3} y={18}>
            <MaintainerRing />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/**
 * Primary action. The sheen is a single skewed highlight swept on hover — it
 * gives the button a surface without adding a color the palette doesn't have.
 */
function ShimmerLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group relative inline-flex h-10 items-center overflow-hidden rounded-md bg-accent px-4 text-[13.5px] font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
    >
      <span className="relative z-10">{children}</span>
      <span
        aria-hidden
        className="absolute inset-y-0 -left-full w-1/2 -skew-x-12 bg-white/35 transition-[left] duration-700 ease-out group-hover:left-[150%]"
      />
    </Link>
  );
}
