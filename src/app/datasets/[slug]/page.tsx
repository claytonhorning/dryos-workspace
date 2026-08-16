import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessPanel } from "@/components/AccessPanel";
import { DataPreview } from "@/components/DataPreview";
import { MaintainerCard } from "@/components/MaintainerCard";
import { SampleChart } from "@/components/SampleChart";
import { Tabs } from "@/components/Tabs";
import { SchemaTable } from "@/components/DataTables";
import { StatusBadge } from "@/components/HealthBadge";
import { TierBadge } from "@/components/TierBadge";
import { Chip, Panel, PanelHeader } from "@/components/ui";
import { CADENCE_LABEL, SOURCE_BASIS_LABEL, compactNumber, formatWindow } from "@/lib/format";
import { getDataset, getPreview, getSample, listDatasets } from "@/lib/repo";
import { verticalById } from "@/lib/verticals";

export async function generateStaticParams() {
  const all = await listDatasets();
  return all.map((d) => ({ slug: d.slug }));
}

export default async function DatasetPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dataset = await getDataset(slug);
  if (!dataset) notFound();
  const preview = await getPreview(slug, 24);
  const sample = await getSample(slug);
  const apiUrl = process.env.NEXT_PUBLIC_DRYOS_API_URL ?? null;

  const { telemetry } = dataset;

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-8">
      <nav className="flex items-center gap-2 text-[12.5px] text-faint">
        <Link href={`/marketplace/${dataset.vertical}`} className="hover:text-ink">
          {verticalById.get(dataset.vertical)?.name ?? "Marketplace"}
        </Link>
        <span>/</span>
        <span className="text-muted">{dataset.category}</span>
      </nav>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <StatusBadge dataset={dataset} />
          <TierBadge tier={dataset.tier} withLatency />
          <Chip mono>{CADENCE_LABEL[dataset.cadence]}</Chip>
          <Chip>{dataset.region}</Chip>
        </div>
        <h1 className="mt-3.5 text-[clamp(1.65rem,3vw,2.25rem)] leading-tight font-semibold tracking-[-0.02em] text-ink">
          {dataset.name}
        </h1>
        <p className="mt-2.5 max-w-3xl text-[15.5px] leading-relaxed text-muted">
          {dataset.tagline}
        </p>
      </header>

      {dataset.status === "pending" && (
        <div className="mt-6 rounded-lg border border-dashed border-line-strong bg-surface/60 px-5 py-4">
          <p className="text-[13.5px] leading-relaxed text-muted">
            <span className="text-ink">This collector has not run yet.</span> The schema
            below is final and the source is confirmed, but nothing has been collected,
            so there is no row count, no history depth and no health to report. Those
            appear here once the first batch passes validation — measured, not estimated.
          </p>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0">
          <div className="grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-4 md:divide-y-0">
            <Fact
              label="Rows"
              value={telemetry.rowCount === null ? null : compactNumber(telemetry.rowCount)}
            />
            <Fact label="History from" value={telemetry.historyFrom} />
            <Fact label="Schema fields" value={String(dataset.schema.length)} />
            <Fact label="SLA window" value={formatWindow(dataset.slaMinutes)} />
          </div>

          <div className="mt-8">
            <Tabs
              tabs={[
                {
                  id: "delivery",
                  label: "Track record",
                  content: (
                    <div className="space-y-6">
                      <DataPreview
                        slug={dataset.slug}
                        preview={preview}
                        datasetName={dataset.name}
                        sourceName={dataset.region.split(" ")[0]}
                        cadenceLabel={CADENCE_LABEL[dataset.cadence]}
                      />
                      {sample && (
                        <SampleChart
                          slug={dataset.slug}
                          apiUrl={apiUrl}
                          initial={sample}
                        />
                      )}
                      <Panel>
                        <p className="max-w-3xl text-[14.5px] leading-[1.75] text-muted">
                          {dataset.description}
                        </p>
                      </Panel>
                    </div>
                  ),
                },
                {
                  id: "schema",
                  label: "Schema",
                  badge: dataset.schema.length,
                  content: (
                    <Panel padded={false}>
                      <PanelHeader
                        title="Declared schema"
                        subtitle="The contract. Every batch is validated against this before anything is promoted, and a nullable field has to say when and why it will be null."
                      />
                      <SchemaTable fields={dataset.schema} />
                      <div className="border-t border-line px-5 py-3.5">
                        <span className="font-mono text-[11px] tracking-[0.1em] text-faint uppercase">
                          Primary key
                        </span>
                        <span className="ml-3 font-mono text-[12.5px] text-ink">
                          {dataset.primaryKey.join(", ")}
                        </span>
                      </div>
                    </Panel>
                  ),
                },
                {
                  id: "source",
                  label: "Source",
                  content: (
                    <Panel padded={false}>
                      <PanelHeader
                        title="Sourcing and legal basis"
                        subtitle="Reviewed per dataset before it goes live, not waved through by category."
                      />
                      <dl className="divide-y divide-line">
                        <Row label="Source" value={dataset.sourceName} />
                        <Row
                          label="Endpoint"
                          value={
                            <a
                              href={dataset.sourceUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="font-mono text-[12.5px] text-accent underline-offset-4 hover:underline"
                            >
                              {dataset.sourceUrl}
                            </a>
                          }
                        />
                        <Row label="Basis" value={SOURCE_BASIS_LABEL[dataset.sourceBasis]} />
                        <Row
                          label="Cadence"
                          value={`${CADENCE_LABEL[dataset.cadence]} · SLA ${formatWindow(dataset.slaMinutes)}`}
                        />
                      </dl>
                    </Panel>
                  ),
                },
              ]}
            />
          </div>
        </div>

        <div className="lg:sticky lg:top-20">
          <AccessPanel dataset={dataset} />
          <MaintainerCard />
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="px-5 py-4">
      <div className="font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
        {label}
      </div>
      <div className="mt-1.5 text-[19px] font-semibold tabular-nums text-ink">
        {value ?? <span className="text-[15px] font-normal text-faint">Not yet collected</span>}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-3 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="font-mono text-[11px] tracking-[0.1em] text-faint uppercase">{label}</dt>
      <dd className="text-[13.5px] leading-relaxed text-muted">{value}</dd>
    </div>
  );
}
