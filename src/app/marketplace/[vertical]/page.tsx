import Link from "next/link";
import { notFound } from "next/navigation";
import { DatasetBrowser } from "@/components/DatasetBrowser";
import { ButtonLink, Panel, cx } from "@/components/ui";
import { listDatasets } from "@/lib/repo";
import { VERTICALS, verticalById, type VerticalId } from "@/lib/verticals";

export function generateStaticParams() {
  return VERTICALS.map((v) => ({ vertical: v.id }));
}

export default async function VerticalPage({
  params,
}: {
  params: Promise<{ vertical: string }>;
}) {
  const { vertical: id } = await params;
  const vertical = verticalById.get(id as VerticalId);
  if (!vertical) notFound();

  const datasets = await listDatasets({ vertical: vertical.id });

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-8">
      <nav className="flex flex-wrap gap-1.5">
        {VERTICALS.map((v) => {
          const active = v.id === vertical.id;
          const live = v.status === "live";
          const className = cx(
            "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
            active
              ? "border-accent-line bg-accent-dim text-accent"
              : live
                ? "border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
                : "cursor-default border-dashed border-line text-faint",
          );
          const inner = (
            <>
              {v.name}
              {!live && (
                <span className="font-mono text-[9.5px] tracking-[0.1em] uppercase">later</span>
              )}
            </>
          );
          return live ? (
            <Link key={v.id} href={`/marketplace/${v.id}`} className={className}>
              {inner}
            </Link>
          ) : (
            <span key={v.id} className={className}>
              {inner}
            </span>
          );
        })}
      </nav>

      <header className="mt-7">
        <h1 className="text-[28px] font-semibold tracking-[-0.025em] text-ink">
          {vertical.name} data
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
          {vertical.expertise}
        </p>
      </header>

      {vertical.status === "live" ? (
        <>
          <div className="mt-7 rounded-lg border border-dashed border-line-strong bg-surface/60 px-5 py-4">
            <p className="text-[13.5px] leading-relaxed text-muted">
              <span className="text-ink">Neither collector is serving data yet.</span>{" "}
              The ERCOT parser is verified end to end against the live endpoint and passes
              every validation check against live data. Everything below is what it
              emits — nothing here is a projection.
            </p>
          </div>

          <div className="mt-8">
            <DatasetBrowser datasets={datasets} />
          </div>
        </>
      ) : (
        <Panel className="mt-8">
          <div className="mx-auto max-w-xl py-8 text-center">
            <h2 className="text-[17px] font-semibold text-ink">
              {vertical.name} isn&apos;t open
            </h2>
            <p className="mt-2.5 text-[14px] leading-relaxed text-muted">
              We are working on energy first and have not started here. It is on the map,
              not on the calendar. If you need {vertical.name.toLowerCase()} data, tell us
              what and we will factor it in.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2">
              <ButtonLink href="/marketplace/energy" tone="primary" size="sm">
                See the energy datasets
              </ButtonLink>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
