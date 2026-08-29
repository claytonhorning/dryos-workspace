"use client";

import { useEffect, useState } from "react";
import { Empty } from "@/components/ui";
import { Skeleton } from "@/components/Skeleton";
import { AvailabilityBadge } from "@/components/workspace/DataChip";
import { SCHEMAS, pathLabel, tokenLabel } from "@/lib/workspace/catalog";
import type { UsageSummary } from "@/lib/workspace/meter";

/**
 * The bill, such as it is.
 *
 * Counted by the same route every app queries through, so this is not a
 * projection — it is what was actually served. The mock rows sit in the same
 * table as the live ones at zero, because the shape of the bill is the argument:
 * you can build all day against generated data and owe nothing, and the moment
 * you point an app at production it starts costing what the schema says.
 */
export default function UsagePage() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);

  useEffect(() => {
    fetch("/api/workspace/usage")
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => setUsage(null));
  }, []);

  const live = SCHEMAS.filter((s) => s.availability === "live");

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-12">
      <header className="max-w-2xl">
        <p className="font-mono text-[11px] tracking-[0.16em] text-faint uppercase">Usage</p>
        <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.02em] text-ink">
          You pay for production data, by the query
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Every call your apps make passes through one route, and that route counts it.
          Live schemas cost what the catalogue says. Mock schemas are generated locally and
          cost nothing — build against them as long as you like.
        </p>
      </header>

      {!usage ? (
        <div className="mt-10">
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-[104px]" />
            <Skeleton className="h-[104px]" />
            <Skeleton className="h-[104px]" />
          </div>
          <Skeleton className="mt-10 h-[180px]" />
        </div>
      ) : (
        <>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            <Figure label="Today" value={tokenLabel(usage.today.tokens)} sub={`${usage.today.billable.toLocaleString()} billable of ${usage.today.queries.toLocaleString()} calls`} accent />
            <Figure
              label="This month"
              value={tokenLabel(usage.month.tokens)}
              sub={`${usage.month.queries.toLocaleString()} calls · ${usage.month.rows.toLocaleString()} rows`}
            />
            <Figure
              label="Rate"
              value={live.map((s) => tokenLabel(s.tokens)).join(" · ")}
              sub={`per query · ${live.map((s) => pathLabel(s)).join(", ")}`}
            />
          </div>

          <section className="mt-10">
            <h2 className="font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
              By schema · this month
            </h2>
            {usage.month.bySchema.length === 0 ? (
              <div className="mt-4">
                <Empty
                  title="Nothing queried yet"
                  body="Open an app in the workspace. Every query it makes lands here, priced by the schema it came from."
                />
              </div>
            ) : (
              <div className="dr-scroll mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
                <table className="w-full min-w-[560px] text-[13.5px]">
                  <thead>
                    <tr className="border-b border-line">
                      <Th>Schema</Th>
                      <Th right>Calls</Th>
                      <Th right>Rows</Th>
                      <Th right>Cost</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.month.bySchema.map((r) => (
                      <tr key={r.schemaId} className="border-b border-line last:border-0">
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2">
                            <span className="text-ink">{r.path}</span>
                            <AvailabilityBadge availability={r.availability} />
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-muted">
                          {r.queries.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-muted">
                          {r.rows.toLocaleString()}
                        </td>
                        <td
                          className={
                            "px-4 py-3 text-right font-mono tabular-nums " +
                            (r.tokens > 0 ? "text-accent" : "text-faint")
                          }
                        >
                          {r.tokens > 0 ? tokenLabel(r.tokens) : "free"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <div className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">{label}</div>
      <div
        className={
          "mt-2 font-mono text-[22px] tabular-nums " + (accent ? "text-accent" : "text-ink")
        }
      >
        {value}
      </div>
      <div className="mt-1 text-[12.5px] text-muted">{sub}</div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={
        "px-4 py-2.5 font-mono text-[10px] font-normal tracking-[0.12em] text-faint uppercase " +
        (right ? "text-right" : "text-left")
      }
    >
      {children}
    </th>
  );
}
