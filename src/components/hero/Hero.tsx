"use client";

import Link from "next/link";
import { TryIt } from "@/components/landing/TryIt";
import { GITHUB_REPO } from "@/lib/apiDocs";
import { ButtonLink } from "@/components/ui";
import { Atmosphere } from "./Atmosphere";
import { HeadlineReveal, Reveal } from "./Reveal";

/**
 * Landing hero: the argument, and a place to try it.
 *
 * The left half makes the case in the order it actually persuades. Collecting
 * data is the part that looks hard and is not — an agent writes a scraper in
 * an afternoon. Maintaining it is the part that never finishes, and no model
 * makes it finish. What a model does dissolve is the reason to pay a vendor
 * five figures for their data *and* their application. So the pitch is the
 * marketplace: pay whoever keeps a stream correct, and use it wherever you
 * like — here, in your own code, or in a copy of this workspace running on
 * your own infrastructure beside data we never see.
 *
 * The right half is the proof: the assistant asks a question, the visitor
 * picks one, and a chart of live rows lands with a button that opens it as a
 * real workspace. Showing the product answer a question does more than any
 * headline about it.
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
              Collecting data is easy.{" "}
              <span className="text-accent">Maintaining it never ends.</span>
            </HeadlineReveal>

            <Reveal delay={0.45}>
              <p className="mt-6 max-w-[52ch] text-[16px] leading-[1.7] text-muted">
                An agent can write a scraper this afternoon. Keeping it right through a renamed
                column, a daylight-saving fold and a source that goes quiet for four intervals
                is the part that does not go away — however good the models get. Paying a
                vendor five figures for their data <em>and</em> their application probably
                does.
              </p>
            </Reveal>

            <Reveal delay={0.52}>
              <p className="mt-4 max-w-[52ch] text-[16px] leading-[1.7] text-muted">
                So Dryos is the marketplace in between. Whoever maintains a stream is paid for
                it; you read it from{" "}
                <Link href="/data" className="text-accent underline-offset-2 hover:underline">
                  134 live streams
                </Link>{" "}
                of energy, weather and property data, and put it wherever you want.
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
                {["no credit card", "134 live streams", "API and MCP included"].map((f) => (
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
              {/*
                What the visitor has just watched is one of three ways to use
                the same streams, and the other two are the reason this is a
                marketplace rather than an application: nothing here obliges
                anyone to look at our screens. The last one is the strongest
                and the least obvious — the workspace is MIT, so it can run
                inside a company beside data we are never shown.
              */}
              <ul className="mt-4 grid gap-2 sm:grid-cols-3">
                {[
                  {
                    title: "Build it here",
                    body: "Charts, maps and tables on live streams. No code.",
                    href: "/workspace",
                  },
                  {
                    title: "Or in your own code",
                    body: "The same rows over a REST API, or through the MCP server.",
                    href: "/docs",
                  },
                  {
                    title: "Or host it yourself",
                    body: "The workspace is open source. Run it on your data too.",
                    href: `https://github.com/${GITHUB_REPO}`,
                  },
                ].map((c) => (
                  <li key={c.title}>
                    <Link
                      href={c.href}
                      className="group block h-full rounded-lg border border-line bg-surface/60 px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-surface"
                    >
                      <span className="block text-[13px] font-medium text-ink group-hover:text-accent">
                        {c.title}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                        {c.body}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
