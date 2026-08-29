"use client";

import Link from "next/link";
import { Atmosphere } from "./Atmosphere";
import { Beacon } from "./Beacon";
import { HeadlineReveal, Reveal } from "./Reveal";
import { WorkspacePane } from "./WorkspacePane";
import { LIVE_SCHEMA, SCHEMAS, tokenLabel } from "@/lib/workspace/catalog";

/**
 * Landing hero.
 *
 * Two halves of one argument. The copy says what the workspace is; the panel
 * beside it is the workspace, running, on today's prices. That is a deliberate
 * swap from the code snippet that used to sit there — a snippet was the right
 * evidence when the offer was an integration, and the offer is now the thing
 * you build in, so showing the thing beats describing it.
 *
 * The headline, the subcopy and the actions are readable at first paint and
 * never move: a hero that withholds its pitch until the visitor scrolls costs
 * more than the animation earns.
 *
 * Entrance order is deliberate — chip, headline, prose, actions, then the panel
 * resolving beside them. The page assembles itself roughly in the order you
 * would read it.
 */
const MOCKS = SCHEMAS.filter((s) => s.availability === "mock").length;

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
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase backdrop-blur">
                <Beacon />
                {LIVE_SCHEMA.entities.count.toLocaleString()} settlement points · live now
              </span>
            </Reveal>

            <HeadlineReveal
              delay={0.12}
              className="mt-7 max-w-[17ch] text-[clamp(2.3rem,5vw,3.7rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-balance text-ink"
            >
              Build what you need, on data from{" "}
              <span className="text-accent">the people who maintain it</span>.
            </HeadlineReveal>

            <Reveal delay={0.55}>
              <p className="mt-7 max-w-[52ch] text-[16px] leading-[1.7] text-muted">
                Start from a dashboard built for your industry, already running on a
                production feed — validated on every run, under a freshness SLA, operated
                by someone whose whole job is that one source. Then tell an agent what to
                change until it is the dashboard you actually wanted.
              </p>
              <p className="mt-4 max-w-[52ch] text-[16px] leading-[1.7] text-muted">
                No seat licence, no procurement cycle, no account manager between you and
                whoever fixes the parser. You pay for the data you query. Nothing else
                here has a price.
              </p>
            </Reveal>

            <Reveal delay={0.68}>
              <div className="mt-9 flex flex-wrap items-center gap-2.5">
                <ShimmerLink href="/workspace">Open my workspace</ShimmerLink>
                <Link
                  href="/marketplace/energy"
                  className="group inline-flex h-10 items-center gap-2 rounded-md border border-line-strong bg-surface-2/70 px-4 text-[13.5px] text-ink backdrop-blur transition-colors hover:bg-surface-3"
                >
                  See the data
                  <span className="text-faint transition-transform duration-200 group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </div>
            </Reveal>

            <Reveal delay={0.8}>
              <ul className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.1em] text-faint uppercase">
                {[
                  `${tokenLabel(LIVE_SCHEMA.tokens)} per query`,
                  "no seats · no minimum",
                  `${MOCKS} mock schemas · free`,
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="h-[3px] w-[3px] rounded-full bg-line-strong" />
                    {f}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          {/* ── Evidence ────────────────────────────────────────────── */}
          <Reveal delay={0.3} y={18}>
            <WorkspacePane />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/**
 * Primary action. The sheen is a single skewed highlight swept on hover — it
 * gives the button a surface without adding a colour the palette doesn't have.
 */
function ShimmerLink({ href, children }: { href: string; children: React.ReactNode }) {
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
