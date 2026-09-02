import { Reveal, RevealGroup } from "@/components/hero/Reveal";
import { Eyebrow, Heading, Lead, Section } from "./Section";

/**
 * The marketplace, in the order money moves: a source, a person who knows it,
 * Dryos in the middle, and you. The return arrow is the whole model, so it is
 * drawn rather than implied.
 */
const FLOW = [
  {
    n: "01",
    title: "A maintainer claims a source",
    body: "Someone who knows the data source better than anyone else. They collect it, adapt when the source changes, make revisions when something needs cleaning up, and get it to Dryos fast.",
  },
  {
    n: "02",
    title: "Dryos hosts, validates and meters it",
    body: "Every run is checked against the source before it is promoted. Every query passes one place that counts it. That is the whole of what we add.",
  },
  {
    n: "03",
    title: "You use the data",
    body: "In a workspace, through the API, or through the MCP server. Charged the same whichever way it arrives.",
  },
  {
    n: "04",
    title: "They get paid",
    body: "When you use the data, the maintainer earns. That's it. No org chart.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" band>
      <Reveal when="view">
        <Eyebrow>How it works</Eyebrow>
        <Heading>Dryos is a marketplace.</Heading>
        <Lead>
          We work with maintainers who know a data source better than anyone else. They get
          paid for collecting and maintaining it: adapting when the source changes, making
          revisions when something needs cleaning up, and getting it to Dryos fast.
        </Lead>
      </Reveal>

      <RevealGroup className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {FLOW.map((s, i) => (
          <div key={s.n} className="relative rounded-lg border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[0.14em] text-accent">{s.n}</span>
              {i < FLOW.length - 1 && (
                <span aria-hidden className="font-mono text-[13px] text-faint">
                  →
                </span>
              )}
            </div>
            <h3 className="mt-3 text-[15.5px] font-semibold text-ink">{s.title}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </RevealGroup>

      {/* The return leg: money going back the way the data came. */}
      <Reveal when="view" className="mt-3">
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-accent-line bg-accent-dim/40 px-5 py-3">
          <span aria-hidden className="font-mono text-[13px] text-accent">
            ←
          </span>
          <p className="text-[13.5px] text-muted">
            <span className="font-semibold text-ink">Your usage flows back to the maintainer.</span>{" "}
            Not to a sales quota, not to a lease, not to a roadmap.
          </p>
        </div>
      </Reveal>

    </Section>
  );
}

