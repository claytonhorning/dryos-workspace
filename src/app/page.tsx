import Link from "next/link";
import { DatasetCard } from "@/components/DatasetCard";
import { GateScene } from "@/components/GateScene";
import { ButtonLink, Panel, cx } from "@/components/ui";
import { listDatasets } from "@/lib/repo";
import { VERTICALS } from "@/lib/verticals";

export default async function LandingPage() {
  const datasets = await listDatasets({ vertical: "energy" });

  return (
    <div>
      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-6 pt-16 pb-14">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_1fr] lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
              Pre-launch · first collector live
            </div>

            <h1 className="mt-6 max-w-3xl text-[clamp(2.1rem,4.6vw,3.4rem)] leading-[1.04] font-semibold tracking-[-0.03em] text-ink">
              Buy data from the experts who{" "}
              <span className="text-accent">actually maintain it</span>.
            </h1>

            <p className="mt-6 max-w-xl text-[16px] leading-[1.7] text-muted">
              Every data vendor starts as one person who understood a source. Then it
              hires a sales team, a success team, a compliance team and a second product
              line — and the person who understood the source moves on. You end up paying
              for the org chart and getting data maintained by whoever inherited it.
            </p>
            <p className="mt-4 max-w-xl text-[16px] leading-[1.7] text-muted">
              Dryos has no org chart between you and the data. Every dataset is built and
              operated by one named person whose entire job is that one source, paid per
              use — so they only earn while it keeps working.
            </p>

            <div className="mt-8 flex flex-wrap gap-2.5">
              <ButtonLink href="/marketplace/energy" tone="primary">
                See what we&apos;re building
              </ButtonLink>
              <ButtonLink href="/docs" tone="secondary">
                Read the schema
              </ButtonLink>
            </div>
          </div>

          {/* What is actually true today. No metrics — nothing has run. */}
          <Panel padded={false} className="overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3.5">
              <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                Feed your AI
              </span>
              <span className="font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
                maintainers → dryos → applications
              </span>
            </div>

            <GateScene
              slug="ercot-realtime-lmp"
              apiUrl={process.env.NEXT_PUBLIC_DRYOS_API_URL ?? null}
            />

            <p className="border-t border-line px-5 py-3.5 text-[12.5px] leading-relaxed text-muted">
              Maintainers publish; Dryos validates every batch and handles delivery —
              query API, bulk export or a warehouse share. A batch that fails the check
              stops at the centre rather than reaching your model stale.
            </p>
          </Panel>
        </div>
      </section>

      {/* ── The argument ───────────────────────────────────────────── */}
      <section className="border-y border-line bg-surface/40">
        <div className="mx-auto max-w-[1240px] px-6 py-14">
          <h2 className="text-[13px] font-semibold tracking-[0.14em] text-faint uppercase">
            Three ways to get this data
          </h2>
          <div className="mt-7 grid gap-3 lg:grid-cols-3">
            <CompareCard
              label="Enterprise data vendor"
              cost="Annual seat"
              points={[
                "Six-week procurement for a two-day integration",
                "An account manager sits between you and whoever fixes the scraper",
                "You pay the same whether you make 400 calls or 4 million",
                "Coverage is set by what sold well, not by what you need",
              ]}
            />
            <CompareCard
              label="Build it yourself"
              cost="~2 weeks, then forever"
              points={[
                "OASIS returns a zipped CSV that silently truncates past 31 days",
                "ERCOT's hour-ending plus DST flag corrupts one hour a year if parsed naively",
                "It becomes the thing nobody on the team wants to own",
                "You are now in the data business instead of your business",
              ]}
            />
            <CompareCard
              highlight
              label="Dryos"
              cost="Usage-based"
              points={[
                "One named maintainer whose only job is that source",
                "They are paid per use — a broken collector earns them nothing",
                "Automated validation catches the break before you do",
                "One schema built to take the next ISO without breaking your integration",
              ]}
            />
          </div>
        </div>
      </section>

      {/* ── The dataset ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-6 py-14">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">
              Starting with one, properly
            </h2>
            <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-muted">
              ERCOT real-time locational marginal prices, every settlement point,
              about every five minutes. The listing shows its declared schema, its
              source, its legal basis, its freshness SLA and its actual delivery
              record before you commit to anything.
            </p>
          </div>
          <Link
            href="/marketplace/energy"
            className="text-[13.5px] text-accent underline-offset-4 hover:underline"
          >
            See the listing →
          </Link>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {datasets.map((d) => (
            <DatasetCard key={d.slug} dataset={d} />
          ))}
        </div>
      </section>

      {/* ── Verticals ──────────────────────────────────────────────── */}
      <section className="border-y border-line bg-surface/40">
        <div className="mx-auto max-w-[1240px] px-6 py-14">
          <h2 className="text-[13px] font-semibold tracking-[0.14em] text-faint uppercase">
            Where this goes
          </h2>
          <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-muted">
            One vertical at a time, and one that we open by recruiting maintainers for
            datasets a specific buyer already needs — not by listing whatever shows up.
            Energy first; the rest are intent, not roadmap commitments.
          </p>

          <div className="mt-7 grid gap-3 md:grid-cols-3">
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
                  className="rounded-lg border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-2"
                >
                  {body}
                </Link>
              ) : (
                <div
                  key={v.id}
                  className="rounded-lg border border-dashed border-line bg-surface/50 p-5"
                >
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Maintainers (secondary) ────────────────────────────────── */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-[1240px] px-6 py-10">
          <div className="flex flex-wrap items-center justify-between gap-5 rounded-lg border border-line bg-surface px-6 py-5">
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
          </div>
        </div>
      </section>
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
