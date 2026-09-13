"use client";

import { useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/CodeBlock";
import { Select } from "@/components/Select";
import { cx } from "@/components/ui";
import { PUBLIC_API, apiStreams, every, streamExamples } from "@/lib/apiDocs";
import {
  blurbLead,
  categoryOf,
  entityCountLabel,
  grainSeconds,
  isoOf,
  sourceTzOf,
  type Schema,
} from "@/lib/workspace/catalog";

const ALL = "all";

/** `#stream/<slug>` — an open stream is a link someone can send. */
const HASH = "#stream/";

/**
 * The streams, browsed the way the workspace explorer browses them.
 *
 * Eighty rows in one table was a list nobody could read: the same question —
 * which stream answers mine — is answered in the workspace by sector chips and
 * headings at the explorer's own grain (`path.slice(1)`), so it is answered the
 * same way here, and a reader who has used one has used the other. A row opens
 * the stream beside the list rather than under it, with the facts a program
 * needs before its first request: the slug, the grain, the entity column, and
 * requests that work as written.
 */
export function StreamBrowser({ domain }: { domain: string | null }) {
  const everything = !domain || domain === ALL;
  const streams = useMemo(() => apiStreams(domain), [domain]);
  const [sector, setSector] = useState(ALL);
  const [iso, setIso] = useState(ALL);
  const [query, setQuery] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  // A new domain is a new question, as in the explorer: the chip and the
  // operator start over.
  useEffect(() => {
    setSector(ALL);
    setIso(ALL);
  }, [domain]);

  // Arriving on a sent link opens that stream, whatever domain the reader is
  // in — the pane looks it up in every stream, not only the ones listed.
  useEffect(() => {
    const h = window.location.hash;
    if (!h.startsWith(HASH)) return;
    const slug = decodeURIComponent(h.slice(HASH.length));
    if (!apiStreams(null).some((s) => s.dataset === slug)) return;
    setOpenSlug(slug);
    document.getElementById("streams")?.scrollIntoView();
  }, []);

  const open = useMemo(
    () => (openSlug ? apiStreams(null).find((s) => s.dataset === openSlug) ?? null : null),
    [openSlug],
  );

  function choose(slug: string | null) {
    setOpenSlug(slug);
    try {
      history.replaceState(null, "", slug ? `${HASH}${encodeURIComponent(slug)}` : "#streams");
    } catch {
      // A sandboxed document may refuse; the pane still opens.
    }
  }

  // Operators only where there are two to choose between — Weather has none,
  // and the blend is narrowed by domain, not by ISO.
  const operators = useMemo(() => {
    if (everything) return [];
    const found = [...new Set(streams.map(isoOf).filter((i): i is string => i !== null))];
    return found.length > 1 ? found : [];
  }, [streams, everything]);

  const byOperator = useMemo(
    () => streams.filter((s) => iso === ALL || isoOf(s) === iso),
    [streams, iso],
  );

  // Sectors in catalogue order, counted over what the operator leaves.
  const sectors = useMemo(() => {
    const counts = new Map<string, { n: number; streams: Schema[] }>();
    for (const s of byOperator) {
      const k = categoryOf(s);
      const c = counts.get(k);
      if (c) {
        c.n++;
        c.streams.push(s);
      } else counts.set(k, { n: 1, streams: [s] });
    }
    return [...counts.entries()].map(([name, c]) => ({ name, ...c }));
  }, [byOperator]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bySection = new Map<string, Schema[]>();
    for (const s of byOperator) {
      if (sector !== ALL && categoryOf(s) !== sector) continue;
      if (
        q &&
        !s.name.toLowerCase().includes(q) &&
        !s.path.join(" ").toLowerCase().includes(q) &&
        !(s.dataset ?? "").includes(q) &&
        !(isoOf(s) ?? "").toLowerCase().includes(q) &&
        !s.variables.some(
          (v) => v.label.toLowerCase().includes(q) || v.key.toLowerCase().includes(q),
        )
      )
        continue;
      // Headings drop the domain the sidebar already names — unless it names
      // everything, when the domain is what a heading must say.
      const heading = (everything ? s.path : s.path.slice(1)).join(" › ");
      const list = bySection.get(heading);
      if (list) list.push(s);
      else bySection.set(heading, [s]);
    }
    return [...bySection.entries()].map(([heading, list]) => ({ heading, list }));
  }, [byOperator, sector, query, everything]);

  const shown = groups.reduce((n, g) => n + g.list.length, 0);

  return (
    <div>
      <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5">
        <div className="flex items-stretch gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search streams, slugs, columns…"
            className="w-full min-w-0 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
          />
          {operators.length > 0 && (
            <Select
              value={iso}
              onChange={(i) => {
                setIso(i);
                setSector(ALL);
              }}
              options={[
                { value: ALL, label: "All ISOs" },
                ...operators.map((i) => ({ value: i, label: i })),
              ]}
              aria-label="Grid operator"
              align="right"
              className="shrink-0"
            />
          )}
        </div>
        <div className="dr-scroll flex gap-1 overflow-x-auto">
          {[{ name: ALL, n: byOperator.length }, ...sectors].map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setSector(c.name)}
              className={cx(
                "flex shrink-0 items-baseline gap-1.5 rounded-full border px-2.5 py-[3px] text-[12px] transition-colors",
                c.name === sector
                  ? "border-accent-line bg-accent-dim text-accent"
                  : "border-line text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {c.name === ALL ? "All" : c.name}
              <span className="font-mono text-[10.5px] opacity-70 tabular-nums">{c.n}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
          {shown === 0 ? (
            <p className="py-3 text-[13px] text-faint">
              No stream matches{query.trim() ? ` “${query.trim()}”` : " the selection"}.
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.heading} className="mb-4 last:mb-0">
                <h3 className="px-0.5 pb-1.5 font-mono text-[10px] tracking-[0.13em] text-faint uppercase">
                  {g.heading}
                </h3>
                <div className="space-y-1.5">
                  {g.list.map((s) => {
                    const on = s.dataset === openSlug;
                    return (
                      <div key={s.id}>
                        <StreamRow schema={s} on={on} onClick={() => choose(on ? null : s.dataset!)} />
                        {/* Below lg there is no column beside the list, so the
                            stream opens under its own row. */}
                        {on && open && (
                          <div className="mt-1.5 lg:hidden">
                            <StreamDetail schema={open} onClose={() => choose(null)} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        <aside className="hidden min-w-0 lg:block">
          <div className="dr-scroll sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
            {open ? (
              <StreamDetail schema={open} onClose={() => choose(null)} />
            ) : (
              <Overview
                sectors={sectors}
                onSector={(name) => setSector(name)}
                current={sector}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function StreamRow({
  schema,
  on,
  onClick,
}: {
  schema: Schema;
  on: boolean;
  onClick: () => void;
}) {
  const iso = isoOf(schema);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={on}
      className={cx(
        "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors",
        on
          ? "border-accent-line bg-accent-dim"
          : "border-line bg-surface hover:border-line-strong hover:bg-surface-2/50",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className={cx("truncate text-[13px]", on ? "text-accent" : "text-ink")}>{schema.name}</div>
        <div className="truncate font-mono text-[11px] text-faint">{schema.dataset}</div>
      </div>
      {iso && (
        <span className="shrink-0 rounded border border-line px-1.5 py-px font-mono text-[10px] text-muted">
          {iso}
        </span>
      )}
      <span className="min-w-[74px] shrink-0 text-right text-[11.5px] whitespace-nowrap text-muted">
        {schema.cadence.label}
      </span>
    </button>
  );
}

/**
 * What the pane says before anything is open: the sectors as cards, each
 * naming the streams it holds, so the categories are readable at a glance and
 * a click narrows the list to one.
 */
function Overview({
  sectors,
  onSector,
  current,
}: {
  sectors: { name: string; n: number; streams: Schema[] }[];
  onSector: (name: string) => void;
  current: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-[13px] text-muted">
        Open a stream for its slug, columns, entities and requests that work as written.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {sectors.map((c) => {
          const kinds = [...new Set(c.streams.map((s) => s.path[2]))];
          return (
            <button
              key={c.name}
              type="button"
              onClick={() => onSector(c.name === current ? ALL : c.name)}
              className={cx(
                "rounded-md border px-3 py-2.5 text-left transition-colors",
                c.name === current
                  ? "border-accent-line bg-accent-dim"
                  : "border-line bg-surface-2/40 hover:border-line-strong",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className={cx("text-[13.5px] font-medium", c.name === current ? "text-accent" : "text-ink")}>
                  {c.name}
                </span>
                <span className="font-mono text-[11px] text-faint tabular-nums">
                  {c.n} {c.n === 1 ? "stream" : "streams"}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-faint">{kinds.join(" · ")}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StreamDetail({ schema, onClose }: { schema: Schema; onClose: () => void }) {
  const iso = isoOf(schema);
  const grain = grainSeconds(schema);
  const system = schema.entities.count <= 1 && schema.entities.sample.length === 0;
  const tz = sourceTzOf(schema);
  const examples = streamExamples(schema);

  const facts: [string, React.ReactNode][] = [
    ...(iso ? ([["Operator", iso]] as [string, React.ReactNode][]) : []),
    ["Updates", schema.cadence.label],
    ["A row every", every(grain)],
    [
      "Entities",
      system ? (
        "none — one system-wide series; send no node"
      ) : (
        <>
          {entityCountLabel(schema)}
          {schema.entities.sample.length > 0 && (
            <span className="text-faint"> · e.g. {schema.entities.sample.slice(0, 3).join(", ")}</span>
          )}
        </>
      ),
    ],
    ["Source time", tz === "UTC" ? "UTC" : `${tz} — served in UTC`],
  ];
  if (schema.located) facts.push(["Located", schema.locatedBy ?? "rows carry lat / lon"]);
  if (schema.tally) facts.push(["Events", "one row per record — ask for buckets to count them"]);

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] tracking-[0.13em] text-faint uppercase">
            {schema.path.join(" › ")}
          </p>
          <h3 className="mt-1 text-[16px] font-semibold tracking-[-0.01em] text-ink">{schema.name}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded px-1.5 text-[16px] leading-none text-faint hover:text-ink"
        >
          ×
        </button>
      </div>

      <div className="space-y-4 px-4 py-4 text-[13px] text-muted">
        <p className="leading-relaxed">{schema.blurb || blurbLead(schema)}</p>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">Slug</span>
          <code className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-[12.5px] text-ink">
            {schema.dataset}
          </code>
          <CopyButton value={schema.dataset!} />
        </div>

        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-faint">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        {schema.variables.length > 0 && (
          <div>
            <h4 className="mb-1.5 font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
              Measures
            </h4>
            <div className="dr-scroll overflow-x-auto rounded-md border border-line">
              <table className="w-full text-left text-[12.5px]">
                <tbody>
                  {schema.variables.map((v) => (
                    <tr key={v.key} className="border-b border-line last:border-0 align-top">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <code className="font-mono text-[12px] text-ink">{v.key}</code>
                        {v.unit && <div className="text-[11px] text-faint">{v.unit}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-ink">{v.label}</div>
                        {v.description && (
                          <div className="mt-0.5 text-[11.5px] leading-snug text-faint">{v.description}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[11.5px] text-faint">
              The headline columns. Every column, with its type, is in the catalogue entry below.
            </p>
          </div>
        )}

        <div>
          <h4 className="mb-1.5 font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">Requests</h4>
          <div className="space-y-2.5">
            {examples.map((e) => (
              <div key={e.path}>
                <p className="mb-1 text-[12px] text-muted">{e.label}</p>
                <CurlLine path={e.path} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A request as a line to copy, and a link to see its answer. */
export function CurlLine({ path, tryIt = true }: { path: string; tryIt?: boolean }) {
  const url = `${PUBLIC_API}${path}`;
  return (
    <div className="flex items-center gap-2">
      <code className="dr-scroll min-w-0 flex-1 overflow-x-auto rounded-md border border-line bg-code px-2.5 py-1.5 font-mono text-[12px] whitespace-nowrap text-muted">
        curl &quot;{url}&quot;
      </code>
      <CopyButton value={`curl "${url}"`} />
      {tryIt && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded border border-line-strong bg-surface-2 px-2 py-1 font-mono text-[10.5px] tracking-[0.08em] text-muted uppercase hover:text-ink"
        >
          Try
        </a>
      )}
    </div>
  );
}
