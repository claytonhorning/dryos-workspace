import { Reveal } from "@/components/hero/Reveal";
import { Wordmark } from "@/components/Logo";
import { ButtonLink } from "@/components/ui";
import { Eyebrow, Section } from "./Section";

export function WhoWeAre() {
  return (
    <Section id="about">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <Reveal when="view">
          <Eyebrow>Who we are</Eyebrow>
          <div className="mt-4">
            <Wordmark size={72} />
          </div>
          <p className="mt-3 font-mono text-[12px] tracking-[0.12em] text-faint uppercase">
            Do not repeat yourself operating system
          </p>
        </Reveal>

        <Reveal when="view">
          <p className="text-[18px] leading-[1.65] text-ink">
            We are Dryos. Built on the belief that in the new AI landscape, data vendors
            should meet their customers where they are.
          </p>
          <p className="mt-4 text-[15.5px] leading-[1.7] text-muted">
            We believe in providing a great service, not in locking any company into an
            agreement. Data maintainers should earn based on the value they provide. Your
            organization deserves a different kind of data company.
          </p>
          <p className="mt-4 text-[15.5px] leading-[1.7] text-muted">
            Only build what you need, and do not repeat yourself.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <ButtonLink href="/workspace" tone="primary">
              Get started
            </ButtonLink>
            <ButtonLink href="/maintainers" tone="secondary">
              For maintainers
            </ButtonLink>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
