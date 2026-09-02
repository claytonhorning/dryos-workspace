import { Reveal } from "@/components/hero/Reveal";
import { BillChart } from "./BillChart";
import { Eyebrow, Heading, Lead, Section } from "./Section";

export function TheBill() {
  return (
    <Section id="the-bill" band>
      <Reveal when="view">
        <Eyebrow>The bill</Eyebrow>
        <Heading>Nobody should be paying for an org chart.</Heading>
        <Lead>
          A data vendor&rsquo;s invoice pays for the whole company that grew around the data. The
          sales quota, the conference booth, the lease, the executives, and yes, the birthday
          present. All of it lands on your bill. A Dryos invoice has two
          lines: our fee, which covers infrastructure, databases and hosting, and the
          maintainer&rsquo;s time and expertise, which they are rewarded for fairly.
        </Lead>
      </Reveal>

      <Reveal when="view" className="mt-10">
        <BillChart />
      </Reveal>

      <Reveal when="view">
        <p className="mt-4 font-mono text-[11px] tracking-[0.06em] text-faint">
          Illustrative shares, not anyone&rsquo;s audited books. The Porsche is a guess. The
          proportions are not.
        </p>
      </Reveal>
    </Section>
  );
}
