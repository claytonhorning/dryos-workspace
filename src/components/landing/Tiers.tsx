import { Reveal, RevealGroup } from "@/components/hero/Reveal";
import { ButtonLink, cx } from "@/components/ui";
import { Eyebrow, Heading, Lead, Section } from "./Section";

const CONTACT = "mailto:hello@dryos.dev";

/**
 * Streams, not queries.
 *
 * Per-query billing was unpredictable for both sides, and the buyer's side is
 * the one that matters: a six-tile page polling every five minutes is fifty
 * thousand queries a month whether anyone looks at it or not, so the bill
 * tracked screens left on walls rather than value delivered, and nobody can
 * get a purchase order approved for "whatever the tiles poll".
 *
 * The unit that fits is the stream. A maintainer maintains one, a customer
 * subscribes to one, it costs the same whether one screen watches it or fifty,
 * and 70% of what it earns goes to the person keeping it correct. A flat
 * platform fee covers the plumbing. Usage survives only as an overage past a
 * plan's fair-use quota — opt-in, capped, and the thing a prepaid pack exists
 * to make boring.
 */
type Plan = {
  name: string;
  who: string;
  price: string;
  per: string;
  pitch: string;
  points: string[];
  cta: { label: string; href: string; primary?: boolean };
  highlight?: boolean;
};

const HOSTED: Plan[] = [
  {
    name: "Free",
    who: "Try it",
    price: "$0",
    per: "forever",
    pitch:
      "One workspace on the public feeds, to see whether the data is what you think it is.",
    points: [
      "1 workspace, 3 streams",
      "Standard polling",
      "Every shape, the community shelf",
    ],
    cta: { label: "Open Dryos", href: "/workspace" },
  },
  {
    name: "Team",
    who: "Small teams",
    price: "$150",
    per: "per month",
    pitch:
      "A desk's worth of screens for a team that shares them, on the streams it actually uses.",
    points: [
      "5 seats, 10 streams included",
      "$15 a month per extra stream",
      "API and MCP within a fair-use quota",
      "Overage credits at list, hard cap by default",
      "Bring your own model key, no markup",
    ],
    cta: { label: "Get started", href: "/workspace", primary: true },
    highlight: true,
  },
  {
    name: "Business",
    who: "Mid to large companies",
    price: "$500",
    per: "per month",
    pitch:
      "Shared workspaces across the company, and the streams delivered into the warehouse you already trust.",
    points: [
      "20 seats, 30 streams included",
      "SSO and shared workspaces",
      "Delivery into Snowflake or Databricks",
      "Priority support and an account manager",
      "Annual commit takes 15 to 20% off",
    ],
    cta: { label: "Talk to us", href: `${CONTACT}?subject=Dryos%20Business` },
  },
];

const OTHER: Plan[] = [
  {
    name: "Self-hosted",
    who: "Your hardware",
    price: "$500",
    per: "per month, plus $25 a stream",
    pitch:
      "Fork the repository and run the platform yourself. Queries are yours, so they are unlimited; what you subscribe to is the data.",
    points: [
      "Minimum 10 streams",
      "Updates and support included",
      "Your own model keys, no markup",
      "The MCP server, for you and your AI code companion",
    ],
    cta: {
      label: "Talk to us",
      href: `${CONTACT}?subject=Self-hosted%20Dryos`,
    },
  },
  {
    name: "Consultant",
    who: "Consultants and agencies",
    price: "Team",
    per: "per client, plus your margin",
    pitch:
      "Build workspaces for your clients on a Team plan each. You see their usage and add a percentage or a flat fee for your work.",
    points: [
      "Save components and pages, reuse them across engagements",
      "Billing managed in the app",
      "White labelled for your brand",
    ],
    cta: {
      label: "Talk to us",
      href: `${CONTACT}?subject=Dryos%20for%20consultants`,
    },
  },
];

const RULES = [
  {
    title: "Flat, per month",
    body: "The fee and the streams are the invoice. No line on it moves because a screen was left on over the weekend.",
  },
  {
    title: "Streams, not queries",
    body: "A stream costs the same whether one screen watches it or fifty. Overages exist only past a fair-use quota, opt-in, capped by default, with a budget alert first.",
  },
  {
    title: "Commit or prepay",
    body: "An annual commit takes 15 to 20% off. Prepaid credit packs, valid twelve months, for the procurement team that wants one number.",
  },
  {
    title: "70% to the maintainer",
    body: "Of every stream's subscription. The platform fee covers the plumbing; the data line pays the person.",
  },
];

export function Tiers() {
  return (
    <Section id="pricing" band>
      <Reveal when="view">
        <Eyebrow>Pricing</Eyebrow>
        <Heading>Flat per month. Streams, not queries.</Heading>
        <Lead>
          A stream is a thing somebody maintains, so it is the thing you
          subscribe to. The platform is a flat fee. Nothing on the invoice
          depends on how many times a tile polled, which means you can budget it
          and we can forecast it.
        </Lead>
      </Reveal>

      <RevealGroup className="mt-10 grid gap-3 lg:grid-cols-3">
        {HOSTED.map((t) => (
          <PlanCard key={t.name} plan={t} />
        ))}
      </RevealGroup>

      <RevealGroup className="mt-3 grid gap-3 lg:grid-cols-2">
        {OTHER.map((t) => (
          <PlanCard key={t.name} plan={t} wide />
        ))}
      </RevealGroup>

      <RevealGroup className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {RULES.map((r) => (
          <div
            key={r.title}
            className="rounded-lg border border-line bg-surface p-5"
          >
            <h3 className="text-[14.5px] font-semibold text-ink">{r.title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              {r.body}
            </p>
          </div>
        ))}
      </RevealGroup>
    </Section>
  );
}

function PlanCard({ plan: t, wide }: { plan: Plan; wide?: boolean }) {
  return (
    <div
      className={cx(
        "flex flex-col rounded-lg border p-6",
        t.highlight
          ? "border-accent-line bg-accent-dim/30"
          : "border-line bg-surface",
        wide && "lg:flex-row lg:items-start lg:gap-10",
      )}
    >
      <div className={cx(wide && "lg:w-[44%] lg:shrink-0")}>
        <div className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
          {t.who}
        </div>
        <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-ink">
          {t.name}
        </h3>
        <div className="mt-3 flex items-baseline gap-2">
          <span
            className={cx(
              "font-mono text-[30px] leading-none tabular-nums tracking-tight",
              t.highlight ? "text-accent" : "text-ink",
            )}
          >
            {t.price}
          </span>
          <span className="text-[12.5px] text-faint">{t.per}</span>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">{t.pitch}</p>
      </div>

      <div
        className={cx("flex flex-1 flex-col", wide ? "mt-5 lg:mt-0" : "mt-5")}
      >
        <ul className="space-y-2.5">
          {t.points.map((p) => (
            <li
              key={p}
              className="flex gap-2.5 text-[13.5px] leading-relaxed text-muted"
            >
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
          <ButtonLink
            href={t.cta.href}
            tone={t.cta.primary ? "primary" : "secondary"}
            className="w-full"
          >
            {t.cta.label}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
