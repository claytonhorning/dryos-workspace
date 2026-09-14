import { Reveal, RevealGroup } from "@/components/hero/Reveal";
import { ButtonLink, cx } from "@/components/ui";
import { Eyebrow, Heading, Lead, Section } from "./Section";

const CONTACT = "mailto:hello@dryos.dev";

/**
 * Three plans, one per kind of buyer: somebody building for themselves or a
 * small team, somebody building for clients, and an organization running
 * its own application on the data. Each card is a sentence of who it is for
 * before it is a price, because that is the question a visitor is answering.
 *
 * Priced in streams, not queries (the `Pricing is streams` note in
 * CLAUDE.md): a stream costs the same whether one screen watches it or
 * fifty. The numbers are proposals, not a billing system.
 */
type Plan = {
  name: string;
  who: string;
  price: string;
  per: string;
  points: string[];
  cta: { label: string; href: string; primary?: boolean };
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Hobbyists & small teams",
    who: "Build for yourself or your team",
    price: "$0",
    per: "to start · $150 a month for a team",
    points: [
      "Free for one person: a workspace on 3 streams",
      "Team: 5 seats and 5 streams, $15 a month per extra stream",
      "Energy, weather and property data",
      "The AI builder, the API and the MCP server",
      "Bring your own model key, never marked up",
    ],
    cta: { label: "Start free", href: "/workspace", primary: true },
    highlight: true,
  },
  {
    name: "Consultants",
    who: "Build for your clients",
    price: "$150",
    per: "a month per client, plus your margin",
    points: [
      "A workspace for each client, billed through Dryos",
      "Add a percentage or a flat fee for your work",
      "Save components and pages, reuse them across clients",
      "White-labelled with your brand",
    ],
    cta: { label: "Talk to us", href: `${CONTACT}?subject=Dryos%20for%20consultants` },
  },
  {
    name: "Organizations",
    who: "Run your own application",
    price: "$500",
    per: "a month, plus $25 a stream",
    points: [
      "Run it on your own infrastructure, or build your app on the API",
      "Unlimited queries: you pay for the data, not the calls",
      "The MCP server for your team's agents",
      "SSO, and delivery into Snowflake or Databricks",
      "Updates, support and an account manager",
    ],
    cta: { label: "Talk to us", href: `${CONTACT}?subject=Dryos%20for%20organizations` },
  },
];

export function Tiers() {
  return (
    <Section id="pricing" band>
      <Reveal when="view">
        <Eyebrow>Pricing</Eyebrow>
        <Heading>Pay for the data you use. Not per query.</Heading>
        <Lead>
          A flat monthly price for the streams you subscribe to. It costs the same whether one
          screen watches a stream or fifty, and 70% of it goes to the person who keeps that
          stream correct.
        </Lead>
      </Reveal>

      <RevealGroup className="mt-10 grid gap-3 lg:grid-cols-3">
        {PLANS.map((t) => (
          <PlanCard key={t.name} plan={t} />
        ))}
      </RevealGroup>
    </Section>
  );
}

function PlanCard({ plan: t }: { plan: Plan }) {
  return (
    <div
      className={cx(
        "flex flex-col rounded-lg border p-6",
        t.highlight ? "border-accent-line bg-accent-dim/30" : "border-line bg-surface",
      )}
    >
      <div className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">{t.who}</div>
      <h3 className="mt-2 text-[21px] font-semibold tracking-[-0.02em] text-ink">{t.name}</h3>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={cx(
            "font-mono text-[30px] leading-none tracking-tight tabular-nums",
            t.highlight ? "text-accent" : "text-ink",
          )}
        >
          {t.price}
        </span>
        <span className="text-[12.5px] text-faint">{t.per}</span>
      </div>
      <ul className="mt-5 space-y-2.5">
        {t.points.map((p) => (
          <li key={p} className="flex gap-2.5 text-[13.5px] leading-relaxed text-muted">
            <span
              className={cx(
                "mt-[8px] h-[3px] w-[3px] shrink-0 rounded-full",
                t.highlight ? "bg-accent" : "bg-line-strong",
              )}
            />
            {p}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-1 flex-col justify-end">
        <ButtonLink href={t.cta.href} tone={t.cta.primary ? "primary" : "secondary"} className="w-full">
          {t.cta.label}
        </ButtonLink>
      </div>
    </div>
  );
}
