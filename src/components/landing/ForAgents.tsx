import Link from "next/link";
import { CodeBlock, CopyButton } from "@/components/CodeBlock";
import { GitHubClone } from "@/components/GitHubClone";
import { Reveal } from "@/components/hero/Reveal";
import { MCP_CLIENTS, MCP_PROMPTS, MCP_URL, OPERATORS } from "@/lib/apiDocs";
import { Eyebrow, Heading, Lead, Section } from "./Section";

/**
 * The MCP server, straight under the hero. It is the one door that needs no
 * account — a line in someone's agent config — so it goes before the argument
 * about who gets paid rather than after it. The full list of clients lives on
 * `/mcp`; here it is the two most people will paste, and what to ask.
 */
export function ForAgents() {
  return (
    <Section id="mcp" band>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
        <Reveal when="view">
          <Eyebrow>MCP server · no key</Eyebrow>
          <Heading>Give your agent the grid.</Heading>
          <Lead>
            One line puts live prices, load, generation and forecasts from{" "}
            {OPERATORS.join(", ")} — plus weather and building permits — in Claude, ChatGPT,
            Cursor or VS Code. Your agent looks the names up, reads UTC, cites the interval, and
            hands you a REST URL when you want it in an app.
          </Lead>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <code className="rounded-md border border-accent-line bg-accent-dim/40 px-3 py-1.5 font-mono text-[13.5px] text-ink">
              {MCP_URL}
            </code>
            <CopyButton value={MCP_URL} label="Copy URL" />
          </div>
          <Link href="/mcp" className="mt-5 inline-block text-[14px] text-accent hover:underline">
            Every client, the tools, and what to ask →
          </Link>
        </Reveal>

        <Reveal when="view" className="space-y-3">
          {MCP_CLIENTS.slice(0, 2).map((c) => (
            <CodeBlock key={c.label} code={c.code} title={c.label} wrap />
          ))}
          <ul className="space-y-2 pt-1">
            {MCP_PROMPTS.slice(0, 3).map((p) => (
              <li
                key={p}
                className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-[13.5px] text-muted"
              >
                <span className="mr-2 font-mono text-[11px] text-accent">ask</span>
                {p}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>

      <GitHubClone className="mt-10 rounded-lg border border-line bg-surface p-5" />
    </Section>
  );
}
