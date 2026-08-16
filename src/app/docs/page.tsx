import { CodeBlock } from "@/components/CodeBlock";
import { TierBadge } from "@/components/TierBadge";
import { Panel, PanelHeader } from "@/components/ui";
import { TIERS } from "@/lib/tiers";

export const metadata = { title: "Docs — Dryos" };

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-[900px] px-6 py-12">
      <div className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">
        Documentation
      </div>
      <h1 className="mt-3 text-[32px] leading-tight font-semibold tracking-[-0.025em] text-ink">
        Building and consuming on Dryos
      </h1>
      <p className="mt-4 max-w-2xl text-[15.5px] leading-[1.7] text-muted">
        Two contracts matter: what a maintainer promises when they publish a collector,
        and what a buyer can rely on when they read from one. Everything else is
        implementation detail.
      </p>

      <div className="mt-6 rounded-lg border border-dashed border-line-strong bg-surface/60 px-5 py-4">
        <p className="text-[13.5px] leading-relaxed text-muted">
          <span className="text-ink">Pre-launch.</span> The API below is implemented but
          not deployed, and neither collector is serving data yet. There are no API keys
          to issue because there is no metering — and unmetered delivery is the one thing
          that will not ship.
        </p>
      </div>

      <div className="mt-10 space-y-6">
        <Panel padded={false}>
          <PanelHeader
            title="Reading data"
            subtitle="Plain HTTP. There is no client library and there does not need to be one."
          />
          <div className="space-y-4 px-5 py-5">
            <CodeBlock
              title="catalogue"
              code={`curl https://api.dryos.dev/v1/datasets

# every listing's schema, source, legal basis, cadence and SLA —
# plus its real telemetry, or nulls when it has not run yet`}
            />
            <CodeBlock
              title="query"
              code={`curl "https://api.dryos.dev/v1/datasets/ercot-realtime-lmp/query\\
?start=2026-08-15T00:00:00Z\\
&node=HB_HOUSTON\\
&limit=1000"`}
            />
            <p className="text-[13px] leading-relaxed text-muted">
              Every ISO returns the same column names, so the next one parses with the
              code you already wrote. That is the point of the shared schema — ERCOT
              publishes no component breakdown, so its component columns come back null
              rather than absent, and a feed that does have them is additive rather than
              a break.
            </p>
          </div>
        </Panel>

        <Panel padded={false}>
          <PanelHeader
            title="Writing a collector"
            subtitle="Declare the source, the legal basis, the schedule, the SLA, the schema and the thresholds. Then implement one method."
          />
          <div className="px-5 py-5">
            <CodeBlock
              title="collectors/ercot_rt_lmp.py"
              code={`class ErcotRealtimeLmp(Collector):
    spec = CollectorSpec(
        slug="ercot-realtime-lmp",
        source_url="https://www.ercot.com/mp/data-products/...",
        basis=SourceBasis.ISO_PUBLIC,

        schedule="*/5 * * * *",
        freshness_sla=timedelta(minutes=20),
        verified=True,

        schema=LMP_SCHEMA,
        thresholds=Thresholds(
            # ERCOT publishes no component breakdown, so these are
            # all-null by design rather than a defect.
            null_rate={"lmp_energy": 1.0, "lmp_congestion": 1.0},
            row_count_tolerance=0.05,
            row_count_per="interval_start_utc",
            value_bands={"lmp_total": (-2_000.0, 6_000.0)},
        ),
        # The source publishes a few seconds past the interval, so a
        # cron on the boundary always just misses. Chase it instead.
        poll=PollPolicy(enabled=True, every=timedelta(seconds=8)),
    )

    async def run(self, ctx: RunContext) -> pd.DataFrame:
        docs = await self._list_csv_docs(ctx)
        ...
        return _normalise(pd.concat(frames, ignore_index=True))`}
            />
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              <span className="text-ink">run returns; it does not write.</span> A batch is
              staged, validated against the declared schema and thresholds, and only then
              promoted. A collector has no handle to the live table, so it cannot put bad
              data in front of a buyer even by accident — and a failed batch keeps its
              staged file, which is the evidence needed to see what the source actually
              returned.
            </p>
          </div>
        </Panel>

        <Panel padded={false}>
          <PanelHeader
            title="What validation enforces"
            subtitle="Every check runs on every batch, before promotion. Schema conformance runs first — a missing column should report as one schema break, not five confusing downstream failures."
          />
          <ul className="divide-y divide-line">
            <Check
              name="Schema conformance"
              detail="Columns match the declaration exactly — no missing, no undeclared, no changed types."
            />
            <Check
              name="Null rate"
              detail="Non-nullable columns permit no nulls at all. Nullable ones spend against a declared per-column budget, and a nullable field must state when and why it will be null."
            />
            <Check
              name="Row-count anomaly"
              detail="Within a tolerance of the trailing median. Skipped until there is enough history to have a baseline, rather than guessing one."
            />
            <Check
              name="Value bands"
              detail="Prices outside a plausible range fail the batch. Set wide enough to admit a genuine scarcity event, narrow enough that a decimal-point error trips it."
            />
            <Check
              name="Primary key"
              detail="No duplicates on the declared key. This is also what makes a retried run idempotent instead of doubling the data."
            />
            <Check
              name="Freshness"
              detail="The newest row is inside the declared SLA window."
            />
          </ul>
        </Panel>

        <Panel padded={false}>
          <PanelHeader
            title="Serving tiers"
            subtitle="Two decisions, not one. A maintainer declares which tiers a listing offers, constrained by what the data can honestly support. You pick which of those you subscribe on. Neither is guessed at query time."
          />
          <div className="dr-scroll overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Tier", "Engine", "Latency SLO", "Surfaces"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-2.5 font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIERS.map((t) => (
                  <tr key={t.id} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-3 align-top">
                      <TierBadge tier={t.id} size="sm" />
                    </td>
                    <td className="px-5 py-3 align-top font-mono text-[12px] text-muted">
                      {t.engine}
                    </td>
                    <td className="px-5 py-3 align-top font-mono text-[12px] text-ink">
                      {t.latencySlo}
                    </td>
                    <td className="px-5 py-3 align-top text-[12.5px] text-muted">
                      {t.surfaces.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-5 py-4 text-[13px] leading-relaxed text-muted">
            A maintainer cannot offer a tier the data cannot back. Realtime is unavailable
            on collectors slower than hourly — a p50-under-100ms guarantee on a daily
            report is selling latency that means nothing. Both launch datasets are
            day-ahead, so they offer Archive and Standard only.
          </p>
        </Panel>

        <Panel padded={false}>
          <PanelHeader
            title="When a collector breaks"
            subtitle="Intended policy. The ladder is designed; the alerting that would make step 2 true is not built yet."
          />
          <ol className="divide-y divide-line">
            <Step
              n="1"
              title="One failed run"
              body="Retried with backoff. Nothing changes on the listing — a blip is not news."
            />
            <Step
              n="2"
              title="A check fails"
              body="The batch is not published. The listing shows Degraded with the specific failing check named publicly, and the maintainer is alerted immediately."
            />
            <Step
              n="3"
              title="Freshness SLA breached"
              body="The listing shows Stale, responses carry a freshness header so your pipeline can decide, and affected usage is credited automatically. Stale data is served, not withheld — the API does not start erroring."
            />
            <Step
              n="4"
              title="Grace period expires"
              body="Delisted from search and no new access issued. Existing buyers keep read access to what they already paid for, and are notified with an export."
            />
          </ol>
        </Panel>
      </div>
    </div>
  );
}

function Check({ name, detail }: { name: string; detail: string }) {
  return (
    <li className="px-5 py-3.5">
      <div className="text-[13.5px] font-medium text-ink">{name}</div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{detail}</p>
    </li>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
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
