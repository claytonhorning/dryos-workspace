"use client";

import { useMemo, useState } from "react";
import { CodeBlock, CopyButton } from "@/components/CodeBlock";
import { cx } from "@/components/ui";
import {
  PUBLIC_API,
  QUICKSTART,
  QUICKSTART_RESPONSE,
  ROUTES,
  agentInstructions,
  apiStreams,
  type Route,
} from "@/lib/apiDocs";
import { domainWord, useDomain } from "@/lib/domain";

/**
 * The API, for the people and agents who would rather not open a workspace.
 *
 * Public, like the catalogue routes it documents: a price you must sign in
 * to read about is not a published price. The stream list follows the
 * sidebar's domain, the same frame the shelf reads, because an Energy buyer
 * looking for a slug does not want to scroll past every weather station.
 * Slugs appear here and nowhere else in the product — this page is for
 * programs, where a slug is the address.
 */
export default function DocsPage() {
  const { domain } = useDomain();
  const streams = useMemo(() => apiStreams(domain), [domain]);
  const agent = useMemo(() => agentInstructions(), []);
  const word = domainWord(domain);

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-12">
      <header className="max-w-2xl">
        <p className="font-mono text-[11px] tracking-[0.16em] text-faint uppercase">API</p>
        <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.02em] text-ink">
          Every stream, one GET away
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          The same data the workspace draws, served as read-only JSON: what exists, who is in
          it, and the rows themselves — raw or bucketed. Timestamps are UTC, names are the
          source&apos;s own, and nulls mean the source did not say.
        </p>
        <div className="mt-5 flex items-center gap-2">
          <span className="font-mono text-[11px] tracking-[0.12em] text-faint uppercase">Base URL</span>
          <code className="rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[12.5px] text-ink">
            {PUBLIC_API}
          </code>
          <CopyButton value={PUBLIC_API} />
        </div>
      </header>

      <nav className="mt-8 flex flex-wrap gap-x-5 gap-y-1 border-b border-line pb-3 text-[13px]">
        {[
          ["#quickstart", "Quick start"],
          ["#auth", "Authentication"],
          ["#routes", "Routes"],
          ["#streams", "Streams"],
          ["#agents", "For AI agents"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="text-muted hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      <Section id="quickstart" title="Quick start">
        <p>The last two real-time prices at ERCOT&apos;s North hub:</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <CodeBlock code={QUICKSTART} title="request" wrap />
          <CodeBlock code={QUICKSTART_RESPONSE} title="response" />
        </div>
        <p className="mt-4">
          The shape is the same everywhere: find a stream in <Mono>/v1/datasets</Mono>, find an
          entity in <Mono>/nodes</Mono>, read rows from <Mono>/query</Mono>. Past a day of
          five-minute data, ask for buckets — <Mono>interval=1h&amp;agg=max</Mono> — rather than
          raw rows.
        </p>
      </Section>

      <Section id="auth" title="Authentication">
        <p>
          No key is needed today, and every route is <Mono>GET</Mono>. A request may carry{" "}
          <Mono>Authorization: Bearer &lt;token&gt;</Mono> with a Dryos access token, and then it
          is attributed to that account. A token that fails is refused with 401 rather than
          served anonymously — an expiry must never turn into silent misattribution.
        </p>
      </Section>

      <Section id="routes" title="Routes">
        <div className="space-y-3">
          {ROUTES.map((r) => (
            <RouteCard key={r.path} route={r} />
          ))}
        </div>
      </Section>

      <Section
        id="streams"
        title={word ? `${word} streams` : "Streams"}
        aside={
          <span className="text-[12px] text-faint">
            {streams.length} {word ? `in ${word} · change the domain beside the logo` : "in every domain"}
          </span>
        }
      >
        <div className="dr-scroll overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
                <th className="px-4 py-2.5 font-normal">Stream</th>
                <th className="px-4 py-2.5 font-normal">Slug</th>
                <th className="px-4 py-2.5 font-normal">Cadence</th>
                <th className="px-4 py-2.5 text-right font-normal">Entities</th>
              </tr>
            </thead>
            <tbody>
              {streams.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-2.5">
                    <div className="text-ink">{s.name}</div>
                    <div className="text-[11.5px] text-faint">{s.path.join(" › ")}</div>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <code className="font-mono text-[12px] text-muted">{s.dataset}</code>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">{s.cadence.label}</td>
                  <td className="px-4 py-2.5 text-right text-muted tabular-nums">
                    {s.entities.count ? s.entities.count.toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="agents" title="For AI agents">
        <p>
          Paste this into an agent&apos;s system prompt or project instructions, or point it at{" "}
          <a href="/llms.txt" className="text-accent hover:underline">
            dryos.ai/llms.txt
          </a>
          , which serves the same text. It covers how to find a stream and an entity, and the
          rules that keep an agent from reporting a plausible wrong number: every time is UTC,
          forecasts keep their vintages, names are never guessed.
        </p>
        {/* Capped: the stream list at its foot is seventy lines, and the copy
            button is what carries it, not the scroll. */}
        <CodeBlock
          code={agent}
          title="agent instructions"
          className="mt-4 [&_pre]:max-h-[440px] [&_pre]:overflow-y-auto"
          wrap
        />
      </Section>
    </div>
  );
}

function Section({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-12 scroll-mt-20">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {aside}
      </div>
      <div className="max-w-none text-[14px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12.5px] text-ink">{children}</code>
  );
}

function RouteCard({ route }: { route: Route }) {
  const [open, setOpen] = useState(route.path.endsWith("/query"));
  const url = `${PUBLIC_API}${route.example}`;
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/50"
      >
        <span className="rounded border border-ok-line bg-ok-dim px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-ok">
          GET
        </span>
        <code className="font-mono text-[13px] text-ink">{route.path}</code>
        <span className="hidden min-w-0 flex-1 truncate text-[13px] text-muted sm:block">
          {route.summary}
        </span>
        <svg
          width="10"
          height="6"
          viewBox="0 0 8 5"
          aria-hidden
          className={cx("ml-auto shrink-0 text-faint transition-transform", open && "rotate-180")}
        >
          <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-4 text-[13px] text-muted">
          <p className="sm:hidden">{route.summary}</p>
          {route.detail && <p className="max-w-3xl">{route.detail}</p>}
          {route.params && (
            <table className="mt-3 w-full text-left">
              <tbody>
                {route.params.map((p) => (
                  <tr key={p.name} className="border-t border-line first:border-0">
                    <td className="py-2 pr-4 align-top whitespace-nowrap">
                      <code className="font-mono text-[12.5px] text-ink">{p.name}</code>
                    </td>
                    <td className="py-2 pr-4 align-top font-mono text-[11.5px] whitespace-nowrap text-faint">
                      {p.type}
                    </td>
                    <td className="py-2 align-top">{p.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-3 flex items-center gap-2">
            <code className="dr-scroll min-w-0 flex-1 overflow-x-auto rounded-md border border-line bg-code px-2.5 py-1.5 font-mono text-[12px] whitespace-nowrap text-muted">
              curl &quot;{url}&quot;
            </code>
            <CopyButton value={`curl "${url}"`} />
            {!route.path.includes("events") && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-line-strong bg-surface-2 px-2 py-1 font-mono text-[10.5px] tracking-[0.08em] text-muted uppercase hover:text-ink"
              >
                Try
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
