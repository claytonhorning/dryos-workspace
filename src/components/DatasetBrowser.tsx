"use client";

import { useMemo, useState } from "react";
import type { Dataset } from "@/lib/types";
import { DatasetCard } from "./DatasetCard";
import { Empty } from "./ui";

/**
 * Search only. Category, delivery and health filters were dropped along with the
 * seed data — with two datasets in one category and no run history, a filter row
 * is furniture that implies a catalogue we do not have.
 */
export function DatasetBrowser({ datasets }: { datasets: Dataset[] }) {
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return datasets;
    return datasets.filter((d) =>
      [d.name, d.tagline, d.description, d.region, d.sourceName, ...d.schema.map((f) => f.name)]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [datasets, q]);

  return (
    <div>
      <div className="relative">
        <svg
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11 L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search datasets and schema fields — try &quot;lmp_congestion&quot; or &quot;ERCOT&quot;"
          className="h-11 w-full rounded-lg border border-line bg-surface pr-3 pl-10 text-[14px] text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
        />
      </div>

      <p className="mt-5 font-mono text-[11.5px] tracking-[0.1em] text-faint uppercase">
        {results.length} {results.length === 1 ? "dataset" : "datasets"}
      </p>

      {results.length === 0 ? (
        <div className="mt-4">
          <Empty
            title="Nothing matches that"
            body="We are starting with two datasets. Tell us what else you need and it shapes what we build next."
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {results.map((d) => (
            <DatasetCard key={d.slug} dataset={d} />
          ))}
        </div>
      )}
    </div>
  );
}
