import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock, CopyButton } from "@/components/CodeBlock";
import { GitHubClone } from "@/components/GitHubClone";
import { JsonLd } from "@/components/JsonLd";
import {
  MCP_CLIENTS,
  MCP_DEEPLINKS,
  MCP_PROMPTS,
  MCP_TOOLS,
  MCP_URL,
  OPERATORS,
  SITE,
  WORKSPACE_MCP_ADD,
  WORKSPACE_MCP_TOOLS,
  WORKSPACE_MCP_URL,
  apiStreams,
} from "@/lib/apiDocs";

/**
 * The MCP server's own page — the address a search for "power market MCP"
 * or "ERCOT MCP server" should land on, and the one the registry and the
 * directories link to. A server component on purpose: every word of it is in
 * the first HTML a crawler receives, with nothing behind a script.
 *
 * Everything it says is read from `lib/apiDocs.ts`, the same module `/docs`
 * and `/llms.txt` draw, so the three never describe different servers.
 */

const TITLE = "Dryos MCP server — live US power market data for AI agents";
const DESCRIPTION =
  `A free remote MCP server with real-time and day-ahead electricity prices, load, generation and forecasts ` +
  `from ${OPERATORS.join(", ")}, plus weather and building permits. Connect Claude, ChatGPT, Cursor or VS Code in one line.`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "MCP server",
    "Model Context Protocol",
    "energy data MCP",
    "power market data",
    "electricity price API",
    "LMP data",
    ...OPERATORS.map((o) => `${o} MCP`),
    "grid data for AI agents",
  ],
  alternates: { canonical: "/mcp" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/mcp", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const COVERS = [
  { title: "Prices", body: "Real-time and day-ahead LMPs at every hub, zone and node — energy, congestion and loss where the operator publishes them." },
  { title: "Grid", body: "Load, generation by fuel, wind and solar output, interchange, constraints, reserves and ancillary prices." },
  { title: "Forecasts", body: "Load, wind and solar forecasts with every vintage kept, so a forecast is never silently overwritten." },
  { title: "Weather", body: "NWS station observations and gridpoint forecasts, and a wind field across Texas." },
  { title: "Property", body: "Building permits from Austin, San Antonio, Fort Worth and Collin County, labelled by trade." },
];

const FAQ = [
  {
    q: "What is the Dryos MCP server?",
    a: `A remote Model Context Protocol server at ${MCP_URL}. It gives an AI agent five read-only tools over the same data the Dryos API serves: US power markets (${OPERATORS.join(", ")}), weather and building permits, collected live from each source and checked against it.`,
  },
  {
    q: "Does it need an API key or an account?",
    a: "No. It is public, read-only and speaks Streamable HTTP, so any MCP client that can add a server by URL can use it. Calls are limited per address, and a refusal says so in words an agent can act on.",
  },
  {
    q: "Which clients work with it?",
    a: "Claude Code, Claude.ai and Claude Desktop (as a custom connector), ChatGPT in developer mode, Cursor, VS Code, Windsurf, Gemini CLI and Codex — any client that supports remote MCP servers.",
  },
  {
    q: "How fresh is the data?",
    a: "Each stream is collected on its source's own cadence. Five-minute real-time prices land within minutes of the operator publishing them, and every stream reports its collection history, so an agent can say how fresh a number is.",
  },
  {
    q: "Can I use it to build an app?",
    a: "Yes. Every query_stream result carries restUrl — the same request as a plain GET on the public REST API at api.dryos.ai. The agent answers the question and hands you the endpoint to put in your code.",
  },
  {
    q: "How does it stop an agent reporting a wrong number?",
    a: "The server's instructions ride along with the connection: every timestamp is UTC, names are looked up rather than guessed, forecasts keep their vintages, null means the source did not report it, and every answer cites the stream and the intervals behind it.",
  },
];

export default function McpPage() {
  const streams = apiStreams(null).length;

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-12 lg:py-16">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "SoftwareApplication",
              name: "Dryos MCP server",
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Any",
              description: DESCRIPTION,
              url: `${SITE}/mcp`,
              installUrl: MCP_URL,
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              publisher: { "@type": "Organization", name: "Dryos", url: SITE },
              featureList: MCP_TOOLS.map((t) => `${t.name}: ${t.summary}`),
            },
            {
              "@type": "FAQPage",
              mainEntity: FAQ.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            },
          ],
        }}
      />

      <header className="max-w-3xl">
        <p className="font-mono text-[11px] tracking-[0.16em] text-accent uppercase">MCP server</p>
        <h1 className="mt-3 text-[clamp(1.9rem,4vw,2.8rem)] leading-[1.06] font-semibold tracking-[-0.03em] text-balance text-ink">
          Live US power market data, as tools for your agent
        </h1>
        <p className="mt-4 text-[16px] leading-[1.7] text-muted">
          A free, public MCP server with {streams} streams across {OPERATORS.join(", ")} —
          real-time and day-ahead prices, load, generation and forecasts — plus weather and
          building permits, collected live from the source and checked against it. Connect once and ask for &ldquo;ERCOT&apos;s Houston price over
          the last day&rdquo; instead of building URLs.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <code className="rounded-md border border-accent-line bg-accent-dim/40 px-3 py-1.5 font-mono text-[14px] text-ink">
            {MCP_URL}
          </code>
          <CopyButton value={MCP_URL} label="Copy URL" />
          {MCP_DEEPLINKS.map((d) => (
            <a
              key={d.label}
              href={d.href}
              className="rounded border border-line-strong bg-surface-2 px-2 py-1 font-mono text-[10.5px] tracking-[0.08em] text-muted uppercase hover:text-ink"
            >
              {d.label}
            </a>
          ))}
        </div>
        <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.1em] text-faint uppercase">
          {["no key", "no sign-up", "read-only", "streamable http"].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="h-[3px] w-[3px] rounded-full bg-line-strong" />
              {f}
            </li>
          ))}
        </ul>
      </header>

      <Band id="connect" title="Connect your client">
        <div className="grid gap-3 md:grid-cols-2">
          {MCP_CLIENTS.map((c) => (
            <CodeBlock key={c.label} code={c.code} title={c.label} wrap />
          ))}
        </div>
      </Band>

      <Band id="ask" title="Then ask">
        <ul className="grid gap-2 md:grid-cols-2">
          {MCP_PROMPTS.map((p) => (
            <li key={p} className="rounded-lg border border-line bg-surface px-4 py-3 text-[14px] text-ink">
              &ldquo;{p}&rdquo;
            </li>
          ))}
        </ul>
        <p className="mt-4">
          Building something? Every <Mono>query_stream</Mono> result carries <Mono>restUrl</Mono>,
          the same request as a plain GET on the{" "}
          <Link href="/docs" className="text-accent hover:underline">
            public REST API
          </Link>
          , so the agent that answered the question also hands you the endpoint for your app.
        </p>
        <GitHubClone className="mt-6 rounded-lg border border-line bg-surface p-5" />
      </Band>

      <Band id="workspace" title="Build in your account">
        <p className="max-w-3xl">
          A second server lets your agent build live dashboards in your own Dryos workspace:
          &ldquo;chart ERCOT&apos;s Houston price against the Austin temperature forecast and put
          it in a new workspace called Houston desk.&rdquo; It asks you to sign in with your Dryos
          account the first time, and it can only add — never delete. Use it alongside the data
          server above: the agent finds the data there and builds with it here.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="rounded-md border border-line bg-surface-2 px-3 py-1.5 font-mono text-[13.5px] text-ink">
            {WORKSPACE_MCP_URL}
          </code>
          <CopyButton value={WORKSPACE_MCP_URL} label="Copy URL" />
        </div>
        <CodeBlock code={WORKSPACE_MCP_ADD} title="Claude Code" className="mt-4" wrap />
        <p className="mt-3">
          In Claude.ai, Claude Desktop or ChatGPT, add a custom connector with this URL; the sign-in
          opens on its own.
        </p>
        <table className="mt-4 w-full text-left text-[13.5px]">
          <tbody>
            {WORKSPACE_MCP_TOOLS.map((t) => (
              <tr key={t.name} className="border-t border-line first:border-0">
                <td className="py-2.5 pr-4 align-top whitespace-nowrap">
                  <code className="font-mono text-[12.5px] text-ink">{t.name}</code>
                </td>
                <td className="py-2.5 align-top">{t.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Band>

      <Band id="tools" title="Data tools">
        <table className="w-full text-left text-[13.5px]">
          <tbody>
            {MCP_TOOLS.map((t) => (
              <tr key={t.name} className="border-t border-line first:border-0">
                <td className="py-2.5 pr-4 align-top whitespace-nowrap">
                  <code className="font-mono text-[12.5px] text-ink">{t.name}</code>
                </td>
                <td className="py-2.5 align-top">{t.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Band>

      <Band id="data" title="What is in it">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {COVERS.map((c) => (
            <div key={c.title} className="rounded-lg border border-line bg-surface p-4">
              <h3 className="text-[14.5px] font-semibold text-ink">{c.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{c.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-4">
          Every stream, with its columns and cadence, is listed in the{" "}
          <Link href="/docs#streams" className="text-accent hover:underline">
            API reference
          </Link>{" "}
          and in{" "}
          <a href="/llms.txt" className="text-accent hover:underline">
            llms.txt
          </a>
          .
        </p>
      </Band>

      <Band id="faq" title="Questions">
        <dl className="divide-y divide-line rounded-lg border border-line bg-surface">
          {FAQ.map((f) => (
            <div key={f.q} className="px-5 py-4">
              <dt className="text-[14.5px] font-semibold text-ink">{f.q}</dt>
              <dd className="mt-1.5 text-[14px] leading-relaxed text-muted">{f.a}</dd>
            </div>
          ))}
        </dl>
      </Band>
    </div>
  );
}

function Band({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-14 scroll-mt-20">
      <h2 className="mb-4 text-[20px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      <div className="text-[14px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12.5px] text-ink">{children}</code>
  );
}
