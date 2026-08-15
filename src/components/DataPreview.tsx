import { LiveDeliveryRecord } from "./LiveDeliveryRecord";
import type { DatasetPreview } from "@/lib/types";
import { Panel, PanelHeader } from "./ui";

/**
 * Delivery record: what the source promises, and what actually arrived.
 *
 * Deliberately shows no prices. The values are the product; what a buyer needs
 * before paying is evidence the feed arrives when it says it will. Everything
 * is measured from collected rows, so a dataset with nothing collected gets an
 * empty panel rather than a plausible-looking track record.
 */
export function DataPreview({
  slug,
  preview,
  datasetName,
  sourceName,
  cadenceLabel,
}: {
  slug: string;
  preview: DatasetPreview | null;
  datasetName: string;
  sourceName: string;
  cadenceLabel: string;
}) {
  // Public because the browser polls it directly; the server-side var is for
  // the initial render and stays private.
  const apiUrl = process.env.NEXT_PUBLIC_DRYOS_API_URL ?? null;

  if (!preview) {
    return (
      <Panel padded={false}>
        <PanelHeader
          title="Delivery record"
          subtitle="What the source promises, and what actually arrived."
        />
        <div className="px-5 py-10 text-center">
          <p className="text-[14px] text-ink">Nothing collected yet</p>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">
            {datasetName} has no collection history to show. This fills in on its own
            once the collector runs — we would rather show you an empty panel than a
            sample that looks like a track record.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel padded={false}>
      <PanelHeader
        title="Delivery record"
        subtitle={`Every interval ${sourceName} published in the last ${preview.hours} hours, when they posted it, and when we had it. Measured, not sampled${apiUrl ? " — and live" : ""}.`}
      />
      <LiveDeliveryRecord
        slug={slug}
        apiUrl={apiUrl}
        initial={preview}
        cadenceLabel={cadenceLabel}
      />
    </Panel>
  );
}
