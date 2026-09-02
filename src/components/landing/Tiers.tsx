import { Reveal, RevealGroup } from "@/components/hero/Reveal";
import { ButtonLink, cx } from "@/components/ui";
import { Eyebrow, Heading, Lead, Section } from "./Section";

const CONTACT = "mailto:hello@dryos.dev";

type Tier = {
  name: string;
  who: string;
  pitch: string;
  points: string[];
  billing: string;
  cta: { label: string; href: string; primary?: boolean };
  highlight?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Community edition",
    who: "Small companies and hobbyists",
    pitch:
      "Dryos hosts the platform. You use it to build workspaces: hyper-specific dashboards for your industry and your use case.",
    points: [
      "You are charged for the data you use. Nothing else has a price.",
      "Ingest it through the dashboards or through the API. Charged the same either way.",
      "Every stream we collect, live, the moment you open a workspace.",
      "Bring your own Claude or OpenAI key for AI mode. No markup; that bill stays between you and them.",
    ],
    billing: "Per query",
    cta: { label: "Get started", href: "/workspace", primary: true },
    highlight: true,
  },
  {
    name: "Self-hosted",
    who: "Mid to large companies",
    pitch:
      "Fork the repository and host the platform yourself. Your team creates workspaces and collaborates using our wired components.",
    points: [
      "All the public data we collect is still accessible by API.",
      "An MCP server, so you and your AI code companion can build anything you can imagine on top of what we have.",
      "Bring your own data and combine it with ours into powerful dashboards and custom applications.",
      "Your own model keys, no markup. Build with AI at full strength on typed components your team can still run in a year.",
      "Generous throttles. No vendor lock-in. Only pay us for maintaining the data you need.",
      "A lot less expensive than data engineers on your payroll. Our people know their stuff.",
    ],
    billing: "Per series, monthly",
    cta: { label: "Talk to us", href: `${CONTACT}?subject=Self-hosted%20Dryos` },
  },
  {
    name: "Consultant",
    who: "Consultants and agencies",
    pitch:
      "Build workspaces on behalf of your clients. We provide the data, the hosting and the dashboarding. You bring your industry expertise and someone who wants to use the data.",
    points: [
      "Create visualizations for your clients, save your own components and pages, and reuse them across engagements.",
      "Billing is managed in the app. You see their usage and add a percentage or a flat fee on top for your services.",
      "Completely white labelled for your brand and your expertise.",
    ],
    billing: "Their usage, plus your margin",
    cta: { label: "Talk to us", href: `${CONTACT}?subject=Dryos%20for%20consultants` },
  },
];

export function Tiers() {
  return (
    <Section id="pricing" band>
      <Reveal when="view">
        <Eyebrow>Pricing</Eyebrow>
        <Heading>Three ways to use it.</Heading>
        <Lead>
          Whichever one you pick, the thing you pay for is the data, and the person behind
          it is the one who gets paid.
        </Lead>
      </Reveal>

      <RevealGroup className="mt-10 grid gap-3 lg:grid-cols-3">
        {TIERS.map((t) => (
          <div
            key={t.name}
            className={cx(
              "flex flex-col rounded-lg border p-6",
              t.highlight ? "border-accent-line bg-accent-dim/30" : "border-line bg-surface",
            )}
          >
            <div className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
              {t.who}
            </div>
            <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-ink">{t.name}</h3>
            <p className="mt-3 text-[14px] leading-relaxed text-muted">{t.pitch}</p>

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
              <div className="border-t border-line pt-4">
                <div className="font-mono text-[10.5px] tracking-[0.14em] text-faint uppercase">
                  Billing
                </div>
                <div
                  className={cx(
                    "mt-1 font-mono text-[15px] tabular-nums",
                    t.highlight ? "text-accent" : "text-ink",
                  )}
                >
                  {t.billing}
                </div>
              </div>
              <ButtonLink
                href={t.cta.href}
                tone={t.cta.primary ? "primary" : "secondary"}
                className="mt-5 w-full"
              >
                {t.cta.label}
              </ButtonLink>
            </div>
          </div>
        ))}
      </RevealGroup>
    </Section>
  );
}
