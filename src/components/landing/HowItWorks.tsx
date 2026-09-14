import { Reveal, RevealGroup } from "@/components/hero/Reveal";
import { Eyebrow, Heading, Lead, Section } from "./Section";

/**
 * Three steps a first-time visitor can repeat back, and then the one thing
 * that makes Dryos different — who the money goes to — as a strip under
 * them rather than as the headline.
 */
const STEPS = [
  {
    n: "01",
    title: "Pick your data",
    body: "Browse energy, weather and property streams, or just ask for what you want in plain English.",
  },
  {
    n: "02",
    title: "See it on a workspace",
    body: "Charts, maps, tickers and tables land on a page in seconds, on live data. Drag them where you want them, or ask the AI to change one.",
  },
  {
    n: "03",
    title: "Share it, or build on it",
    body: "Share the workspace with your team, call the same data from the API, or give your AI agent the MCP server.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <Reveal when="view">
        <Eyebrow>How it works</Eyebrow>
        <Heading>From question to live dashboard in a minute.</Heading>
        <Lead>
          No scrapers to keep alive and no data team to hire. Ask for the data, see it, and use it
          wherever you work.
        </Lead>
      </Reveal>

      <RevealGroup className="mt-10 grid gap-3 md:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-lg border border-line bg-surface p-5">
            <span className="font-mono text-[11px] tracking-[0.14em] text-accent">{s.n}</span>
            <h3 className="mt-3 text-[16px] font-semibold text-ink">{s.title}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </RevealGroup>

      <Reveal when="view" className="mt-3">
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-accent-line bg-accent-dim/40 px-5 py-3.5">
          <span aria-hidden className="mt-[1px] font-mono text-[13px] text-accent">
            ←
          </span>
          <p className="text-[13.5px] leading-relaxed text-muted">
            <span className="font-semibold text-ink">Every stream has a maintainer,</span> an expert
            who keeps it correct when the source changes. When you use their data, they get paid.
          </p>
        </div>
      </Reveal>
    </Section>
  );
}
