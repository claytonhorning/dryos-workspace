import Link from "next/link";
import { DatasetCard } from "@/components/DatasetCard";
import { Hero } from "@/components/hero/Hero";
import { Reveal, RevealGroup } from "@/components/hero/Reveal";
import { ButtonLink, cx } from "@/components/ui";
import { LIVE_SCHEMA, SCHEMAS, pathLabel, tokenLabel } from "@/lib/workspace/catalog";
import { listDatasets } from "@/lib/repo";
import { VERTICALS } from "@/lib/verticals";

const MOCKS = SCHEMAS.filter((s) => s.availability === "mock").length;

export default async function LandingPage() {
  const datasets = await listDatasets({ vertical: "energy" });

  return (
    <div>
      <Hero />

      {/* ── The loop ────────────────────────────────────────────────── */}
      <section className="border-y border-line bg-surface/40">
        <div className="mx-auto max-w-[1240px] px-6 py-14">
          <Reveal when="view">
            <h2 className="text-[13px] font-semibold tracking-[0.14em] text-faint uppercase">
              How it works
            </h2>
          </Reveal>
          <RevealGroup className="mt-7 grid gap-3 lg:grid-cols-3">
            <Step
              n="01"
              title="Start from a dashboard for your industry"
              body="Not a blank editor and not a fixture — a working dashboard wired to a live feed. No connection step, no key to paste, nothing to stand up before you can tell whether the idea is any good."
            />
            <Step
              n="02"
              title="Change it until it is yours"
              body="Say what you want in a sentence. An agent rewrites the app and compiles it before anything is saved — if it does not build, nothing is written and your dashboard keeps running what it had."
            />
            <Step
              n="03"
              title="Share it, and take one change back"
              body="Dashboards are versioned by intent, not by diff. Pulling a colleague's change replays the sentence that produced it against your copy, so two that diverged weeks ago can still trade a single improvement."
            />
          </RevealGroup>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-6 py-14">
        <Reveal when="view" className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">
              You pay for what you used. That is the whole bill.
            </h2>
            <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-muted">
              Counted on the one route every dashboard queries through, so what you owe is
              what was actually served — not a seat, not a tier, not a headcount you never
              met, and not a number anyone has to take on trust.
            </p>
          </div>
          <Link
            href="/usage"
            className="text-[13.5px] text-accent underline-offset-4 hover:underline"
          >
            See your usage →
          </Link>
        </Reveal>

        <RevealGroup className="mt-7 grid gap-3 md:grid-cols-3">
          <Price
            accent
            figure={tokenLabel(LIVE_SCHEMA.tokens)}
            unit="per query"
            label={pathLabel(LIVE_SCHEMA)}
            body={`${LIVE_SCHEMA.entities.count.toLocaleString()} ${LIVE_SCHEMA.entities.label}, repriced ${LIVE_SCHEMA.cadence.label}, validated against the source on every run.`}
          />
          <Price
            figure="Free"
            unit="always"
            label={`${MOCKS} mock schemas`}
            body="Day-ahead, load, generation mix, gas, weather. Real shape, generated numbers, badged everywhere they appear — build against them for as long as you like and owe nothing."
          />
          <Price
            figure="Free"
            unit="always"
            label="The workspace itself"
            body="Every dashboard, both agents, the compile gate, forking, sharing and every revision you keep. We charge for the data, not for the room you use it in."
          />
        </RevealGroup>
      </section>

      {/* ── The dataset ─────────────────────────────────────────────── */}
      <section className="border-y border-line bg-surface/40">
        <div className="mx-auto max-w-[1240px] px-6 py-14">
          <Reveal when="view" className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">
                What &ldquo;production&rdquo; means here
              </h2>
              <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-muted">
                Not a promise in a sales deck. Every listing shows its declared schema, its
                source, its legal basis, its freshness SLA and its real delivery record —
                before you commit to anything, and again later when you want to know why a
                number moved.
              </p>
            </div>
            <Link
              href="/marketplace/energy"
              className="text-[13.5px] text-accent underline-offset-4 hover:underline"
            >
              See the listing →
            </Link>
          </Reveal>

          <RevealGroup className="mt-6 grid gap-3 sm:grid-cols-2">
            {datasets.map((d) => (
              <DatasetCard key={d.slug} dataset={d} />
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── The argument ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-6 py-14">
        <Reveal when="view">
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">
            Nobody should be paying for an org chart
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
            Every data vendor starts as one person who understood a source. Then it hires
            a sales team, a success team and a second product line, and the person who
            understood the source moves on. The org chart was the price of getting data
            you could not build yourself — a fair trade back when building the thing on
            top of it also took a quarter. It does not take a quarter any more.
          </p>
        </Reveal>
        <RevealGroup className="mt-7 grid gap-3 lg:grid-cols-3">
          <CompareCard
            label="Enterprise data vendor"
            cost="Annual seat"
            points={[
              "Six-week procurement for a two-day integration",
              "You pay the same whether you make 400 calls or 4 million",
              "Coverage is set by what sold well, not by what you need",
              "A dashboard request goes into someone's roadmap",
            ]}
          />
          <CompareCard
            label="Build it yourself"
            cost="~2 weeks, then forever"
            points={[
              "OASIS returns a zipped CSV that silently truncates past 31 days",
              "ERCOT's hour-ending plus DST flag corrupts one hour a year if parsed naively",
              "The collector becomes the thing nobody on the team wants to own",
              "You are now in the data business instead of your business",
            ]}
          />
          <CompareCard
            highlight
            label="Dryos"
            cost="Per query"
            points={[
              "One named maintainer whose only job is that source",
              "They are paid per use — a broken collector earns them nothing",
              "A working dashboard on top of it this afternoon, changed by asking",
              "You pay for the queries you made, and for nothing else",
            ]}
          />
        </RevealGroup>
      </section>

      {/* ── Verticals ───────────────────────────────────────────────── */}
      <section className="border-y border-line bg-surface/40">
        <div className="mx-auto max-w-[1240px] px-6 py-14">
          <Reveal when="view">
            <h2 className="text-[13px] font-semibold tracking-[0.14em] text-faint uppercase">
              Where this goes
            </h2>
          </Reveal>
          <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-muted">
            One vertical at a time, and one that we open by recruiting maintainers for
            datasets a specific buyer already needs — not by listing whatever shows up.
            Energy first; the rest are intent, not roadmap commitments.
          </p>

          <RevealGroup className="mt-7 grid gap-3 md:grid-cols-3">
            {VERTICALS.map((v) => {
              const live = v.status === "live";
              const body = (
                <>
                  <div className="flex items-center gap-2.5">
                    <h3
                      className={cx(
                        "text-[16px] font-semibold",
                        live ? "text-ink" : "text-muted",
                      )}
                    >
                      {v.name}
                    </h3>
                    <span
                      className={cx(
                        "rounded-full border px-2 py-[2px] font-mono text-[9.5px] tracking-[0.1em] uppercase",
                        live
                          ? "border-accent-line bg-accent-dim text-accent"
                          : "border-line bg-surface-2 text-faint",
                      )}
                    >
                      {live ? "First" : "Later"}
                    </span>
                  </div>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted">
                    {v.expertise}
                  </p>
                </>
              );
              return live ? (
                <Link
                  key={v.id}
                  href={`/marketplace/${v.id}`}
                  className="block h-full rounded-lg border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-2"
                >
                  {body}
                </Link>
              ) : (
                <div
                  key={v.id}
                  className="h-full rounded-lg border border-dashed border-line bg-surface/50 p-5"
                >
                  {body}
                </div>
              );
            })}
          </RevealGroup>
        </div>
      </section>

      {/* ── Maintainers (secondary) ─────────────────────────────────── */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-[1240px] px-6 py-10">
          <Reveal
            when="view"
            className="flex flex-wrap items-center justify-between gap-5 rounded-lg border border-line bg-surface px-6 py-5"
          >
            <div className="max-w-2xl">
              <h2 className="text-[15px] font-semibold text-ink">
                Know a source better than anyone should?
              </h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                We run the first collectors ourselves. After that, the point is that you
                run yours — we handle hosting, validation, metering and billing, and you
                take a revenue share every time someone uses it.
              </p>
            </div>
            <ButtonLink href="/maintainers" tone="secondary" size="sm">
              For maintainers
            </ButtonLink>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

/** One beat of the loop. Numbered because the order is the argument. */
function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <span className="font-mono text-[11px] tracking-[0.14em] text-accent">{n}</span>
      <h3 className="mt-3 text-[16px] font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

/** One line of the bill. The two free ones are the point, so they get equal weight. */
function Price({
  figure,
  unit,
  label,
  body,
  accent,
}: {
  figure: string;
  unit: string;
  label: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-lg border p-5",
        accent ? "border-accent-line bg-accent-dim/40" : "border-line bg-surface",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={cx(
            "font-mono text-[22px] tabular-nums",
            accent ? "text-accent" : "text-ink",
          )}
        >
          {figure}
        </span>
        <span className="font-mono text-[11px] text-faint">{unit}</span>
      </div>
      <h3 className="mt-3 text-[14.5px] font-semibold text-ink">{label}</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function CompareCard({
  label,
  cost,
  points,
  highlight,
}: {
  label: string;
  cost: string;
  points: string[];
  highlight?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-lg border p-5",
        highlight ? "border-accent-line bg-accent-dim/40" : "border-line bg-surface",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cx("text-[14.5px] font-semibold", highlight ? "text-accent" : "text-ink")}
        >
          {label}
        </span>
        <span
          className={cx(
            "font-mono text-[11.5px] whitespace-nowrap",
            highlight ? "text-accent" : "text-faint",
          )}
        >
          {cost}
        </span>
      </div>
      <ul className="mt-4 space-y-2.5">
        {points.map((p) => (
          <li key={p} className="flex gap-2.5 text-[13.5px] leading-relaxed text-muted">
            <span
              className={cx(
                "mt-[7px] h-[3px] w-[3px] shrink-0 rounded-full",
                highlight ? "bg-accent" : "bg-line-strong",
              )}
            />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
