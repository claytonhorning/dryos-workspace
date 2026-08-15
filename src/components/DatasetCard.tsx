import Link from "next/link";
import { CADENCE_LABEL } from "@/lib/format";
import type { Dataset } from "@/lib/types";
import { StatusBadge } from "./HealthBadge";
import { TierBadge } from "./TierBadge";
import { Chip } from "./ui";

export function DatasetCard({ dataset }: { dataset: Dataset }) {
  return (
    <Link
      href={`/datasets/${dataset.slug}`}
      className="group flex flex-col rounded-lg border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-3">
        <StatusBadge dataset={dataset} size="sm" />
        <span className="font-mono text-[11.5px] text-faint">
          {CADENCE_LABEL[dataset.cadence]}
        </span>
      </div>

      <h3 className="mt-3.5 text-[15.5px] leading-snug font-semibold text-ink group-hover:text-accent">
        {dataset.name}
      </h3>
      <p className="mt-1.5 line-clamp-3 text-[13.5px] leading-relaxed text-muted">
        {dataset.tagline}
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <TierBadge tier={dataset.tier} size="sm" />
        <Chip>{dataset.region}</Chip>
      </div>

      <div className="mt-auto flex items-center gap-2 pt-4 text-[12.5px] text-faint">
        <span className="font-mono">{dataset.sourceName}</span>
        <span className="text-line-strong">·</span>
        <span>{dataset.schema.length} fields</span>
      </div>
    </Link>
  );
}
