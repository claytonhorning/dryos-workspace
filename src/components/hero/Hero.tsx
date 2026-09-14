"use client";

import Link from "next/link";
import { TryIt } from "@/components/landing/TryIt";
import { ButtonLink } from "@/components/ui";
import { Atmosphere } from "./Atmosphere";
import { HeadlineReveal, Reveal } from "./Reveal";

/**
 * Landing hero: what Dryos is in one sentence, and a place to try it.
 *
 * The left half says it plainly — three kinds of public data, checked, ready
 * for a dashboard, code or an agent. The right half is the proof: the
 * assistant asks a question, the visitor picks one, and a chart of live rows
 * lands in front of them with a button that opens it as a real workspace.
 * Showing the product answer a question does more than any headline about it.
 *
 * The copy is readable at first paint and never moves; GSAP only sets its
 * "from" state on the client, so a visitor without JavaScript reads it all.
 */
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-bg">
      <Atmosphere />

      <div className="relative mx-auto max-w-[1240px] px-6 pt-12 pb-16 lg:pt-20 lg:pb-24">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-12">
          <div>
            {/* The MCP server is the newest door and needs no account. */}
            <Reveal delay={0} y={8}>
              <Link
                href="/mcp"
                className="mb-6 inline-flex max-w-full items-center gap-2 rounded-full border border-accent-line bg-accent-dim/40 py-1 pr-3 pl-1 text-[12.5px] text-muted transition-colors hover:text-ink"
              >
                <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] text-accent-ink uppercase">
                  New
                </span>
                <span className="truncate">MCP server: live data in Claude, ChatGPT and Cursor</span>
                <span aria-hidden className="text-accent">
                  →
                </span>
              </Link>
            </Reveal>

            <Reveal delay={0.05} y={10}>
              <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
                Energy · Weather · Property
              </p>
            </Reveal>

            <HeadlineReveal
              delay={0.12}
              className="mt-5 max-w-[18ch] text-[clamp(2.1rem,4.4vw,3.3rem)] leading-[1.04] font-semibold tracking-[-0.035em] text-balance text-ink"
            >
              Live public data, <span className="text-accent">ready to use.</span>
            </HeadlineReveal>

            <Reveal delay={0.45}>
              <p className="mt-6 max-w-[50ch] text-[16px] leading-[1.7] text-muted">
                Dryos collects data straight from grid operators, the National Weather Service and
                city permit offices, checks it against the source, and serves it to your
                dashboards, your code and your AI agents. Ask for what you want, and it&rsquo;s on
                a workspace in seconds.
              </p>
            </Reveal>

            <Reveal delay={0.58}>
              <div className="mt-8 flex flex-wrap items-center gap-2.5">
                <ButtonLink href="/workspace" tone="primary">
                  Build a workspace, free
                </ButtonLink>
                <ButtonLink href="#mcp" tone="secondary">
                  Connect your AI agent
                </ButtonLink>
              </div>
            </Reveal>

            <Reveal delay={0.7}>
              <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.1em] text-faint uppercase">
                {["no credit card", "checked against the source", "API and MCP included"].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="h-[3px] w-[3px] rounded-full bg-line-strong" />
                    {f}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          <Reveal delay={0.25} y={18}>
            <div id="try" className="scroll-mt-(--nav-h)">
              <TryIt />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
