import { CodeBlock } from "@/components/CodeBlock";
import { ButtonLink, Panel, PanelHeader } from "@/components/ui";

export const metadata = {
  title: "For maintainers",
  alternates: { canonical: "/maintainers" },
};

export default function MaintainersPage() {
  return (
    <div className="mx-auto max-w-[900px] px-6 py-12">
      <div className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">
        For maintainers
      </div>
      <h1 className="mt-3 text-[32px] leading-tight font-semibold tracking-[-0.025em] text-ink">
        You already maintain this collector. Get paid for it.
      </h1>
      <p className="mt-4 max-w-2xl text-[15.5px] leading-[1.7] text-muted">
        If you have built a scraper for a source you understand better than almost anyone
        — an ISO feed, a tariff book, a queue report — you have probably rebuilt it three
        times as the source changed, and probably only ever been paid for it once.
      </p>

      <div className="mt-6 rounded-lg border border-dashed border-line-strong bg-surface/60 px-5 py-4">
        <p className="text-[13.5px] leading-relaxed text-muted">
          <span className="text-ink">Being straight about where this is:</span> there is
          no self-serve publishing yet, and no maintainers besides us. We are writing the
          first two collectors ourselves to prove the pipeline works before asking anyone
          else to depend on it. If the model appeals, talk to us now and you will shape
          the terms rather than inherit them.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-2.5">
        <ButtonLink href="mailto:hello@dryos.dev?subject=Maintainer%20interest" tone="primary">
          Talk to us
        </ButtonLink>
      </div>

      <div className="mt-12 space-y-6">
        <Panel padded={false}>
          <PanelHeader
            title="What a collector is"
            subtitle="Where the data comes from, why you may redistribute it, how fresh it has to be, what shape it emits, and what counts as correct. Then one method."
          />
          <div className="px-5 py-5">
            <CodeBlock
              title="collectors/ercot_spp.py"
              code={`class ErcotDayAheadSpp(Collector):
    spec = CollectorSpec(
        slug="ercot-day-ahead-spp",
        source_url=ERCOT_API,
        basis=SourceBasis.ISO_PUBLIC,

        schedule="30 20 * * *",
        freshness_sla=timedelta(hours=30),

        schema=LMP_SCHEMA,
        thresholds=Thresholds(
            null_rate={"lmp_energy": 1.0},
            row_count_tolerance=0.15,
            value_bands={"lmp_total": (-2_000.0, 6_000.0)},
        ),
    )

    async def run(self, ctx: RunContext) -> pd.DataFrame:
        resp = await ctx.fetch(ERCOT_API, params=..., retries=3)
        return normalise(resp.json()["data"])`}
            />
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              Note what <span className="font-mono text-ink">run</span> does not do: it
              returns a frame rather than writing anywhere. Batches are staged, validated
              and only then promoted, so a collector cannot put bad data in front of a
              buyer even by accident.
            </p>
          </div>
        </Panel>

        <Panel padded={false}>
          <PanelHeader
            title="What we ask of you"
            subtitle="Short list, but we hold you to it — the governance claim is the whole product."
          />
          <ol className="divide-y divide-line">
            <Rule
              n="1"
              title="Declare a freshness SLA you can actually hit"
              body="Looser than your cadence, so one missed run is a retry. Two consecutive misses flag the listing publicly and start a grace period."
            />
            <Rule
              n="2"
              title="Declare thresholds that mean something"
              body="Null budgets, row-count tolerance, value bands. Set them where a real break trips them — thresholds so loose nothing ever fails are worse than none, because the badge stays green while the data rots."
            />
            <Rule
              n="3"
              title="Say why you may redistribute it"
              body="You state the legal basis, we review it before the listing goes live, and we will pull a dataset over this."
            />
            <Rule
              n="4"
              title="Answer when it breaks"
              body="You will know first — validation fails the batch before any buyer sees it. What buyers are actually paying for is that you respond."
            />
          </ol>
        </Panel>
      </div>

      <p className="mt-8 text-[13.5px] leading-relaxed text-muted">
        Revenue share, payout cadence and minimums are not settled. We would rather agree
        them with the first maintainers than announce terms and defend them.
      </p>
    </div>
  );
}

function Rule({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="flex gap-4 px-5 py-4">
      <span className="mt-[1px] grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-2 font-mono text-[11px] text-muted">
        {n}
      </span>
      <div>
        <div className="text-[14px] font-medium text-ink">{title}</div>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{body}</p>
      </div>
    </li>
  );
}
