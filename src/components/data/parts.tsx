import Link from "next/link";
import { cx } from "@/components/ui";
import { formatInstant, formatValue, type Column } from "@/lib/liveData";
import { blurbLead, entityCountLabel, isoOf, type Schema } from "@/lib/workspace/catalog";
import { rhythm, streamHref } from "@/lib/dataPages";

/**
 * The pieces every catalogue page is built from.
 *
 * Server components throughout, with no interactivity anywhere: these pages
 * exist to be crawled, and every word on them has to be in the first HTML a
 * crawler receives rather than behind a script it may not run.
 */

/* ── Chrome ────────────────────────────────────────────────────────────── */

export function Crumbs({ trail }: { trail: { name: string; href: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-faint">
      {trail.map((t, i) => (
        <span key={t.href} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden>›</span>}
          {i === trail.length - 1 ? (
            <span className="text-muted">{t.name}</span>
          ) : (
            <Link href={t.href} className="transition-colors hover:text-ink">
              {t.name}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

export function Section({
  id,
  title,
  lead,
  children,
}: {
  id?: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-12 scroll-mt-20">
      <h2 className="text-[19px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      {lead && <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">{lead}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* ── Facts ─────────────────────────────────────────────────────────────── */

export function Facts({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label} className="bg-surface px-4 py-3">
          <dt className="font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">{r.label}</dt>
          <dd className="mt-1.5 text-[13.5px] leading-relaxed text-ink">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Live figures ──────────────────────────────────────────────────────── */

/**
 * Current values, with the instant they are from.
 *
 * A number with no time on it is a claim nobody can check, and these pages
 * are rebuilt hourly rather than on view — so every figure says when it was
 * read, and the caption says how often the page refreshes. Anything else
 * would be a live-looking number that is quietly an hour old.
 */
export function LiveFigures({
  figures,
  unit,
  caption,
}: {
  figures: { entity: string; value: number; at: string }[];
  unit: string | null | undefined;
  caption?: string;
}) {
  if (figures.length === 0) return null;
  return (
    <figure>
      <div
        className={cx(
          "grid gap-px overflow-hidden rounded-lg border border-line bg-line",
          figures.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
        )}
      >
        {figures.map((f) => (
          <div key={f.entity} className="bg-surface px-4 py-4">
            <div className="truncate font-mono text-[11px] tracking-[0.08em] text-faint" title={f.entity}>
              {f.entity}
            </div>
            <div className="mt-1.5 text-[26px] leading-none font-semibold tabular-nums tracking-tight text-ink">
              {formatValue(f.value, unit)}
              {unit && !unit.startsWith("$") && (
                <span className="ml-1 text-[13px] font-normal text-muted">{unit}</span>
              )}
            </div>
            <div className="mt-2 text-[11.5px] text-faint">{formatInstant(f.at)}</div>
          </div>
        ))}
      </div>
      {caption && <figcaption className="mt-2 text-[12px] text-faint">{caption}</figcaption>}
    </figure>
  );
}

/* ── Columns ───────────────────────────────────────────────────────────── */

/**
 * The stream's columns, as the API declares them.
 *
 * Read from `/v1/datasets/{slug}` rather than written here: the column list
 * is the one part of a stream page that must never drift from what a request
 * actually answers with.
 */
export function ColumnTable({ columns }: { columns: Column[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line bg-surface-2">
            {["Column", "Type", "Description"].map((h) => (
              <th
                key={h}
                className="px-4 py-2.5 font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((c) => (
            <tr key={c.name} className="border-b border-line last:border-0">
              <td className="px-4 py-3 align-top font-mono text-[12.5px] whitespace-nowrap text-ink">
                {c.name}
                {!c.nullable && <span className="ml-2 text-[10px] text-faint">required</span>}
              </td>
              <td className="px-4 py-3 align-top font-mono text-[12px] whitespace-nowrap text-muted">
                {c.type}
              </td>
              <td className="px-4 py-3 align-top text-[13px] leading-relaxed text-muted">
                {c.description}
                {c.example && (
                  <span className="mt-1 block font-mono text-[11.5px] text-faint">e.g. {c.example}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Stream lists ──────────────────────────────────────────────────────── */

/** One stream in a list, as a link with enough on it to choose by. */
export function StreamRow({ schema, showIso = false }: { schema: Schema; showIso?: boolean }) {
  const iso = isoOf(schema);
  return (
    <li>
      <Link
        href={streamHref(schema)}
        className="group block rounded-lg border border-line bg-surface px-4 py-3.5 transition-colors hover:border-line-strong hover:bg-surface-2"
      >
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-[14.5px] font-medium text-ink group-hover:text-accent">
            {schema.name}
          </span>
          {showIso && iso && <span className="font-mono text-[10.5px] text-faint">{iso}</span>}
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{blurbLead(schema)}</p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-faint">
          <span>{rhythm(schema)}</span>
          <span>{entityCountLabel(schema)}</span>
          <span>{schema.dataset}</span>
        </div>
      </Link>
    </li>
  );
}

export function StreamList({ streams, showIso = false }: { streams: Schema[]; showIso?: boolean }) {
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2">
      {streams.map((s) => (
        <StreamRow key={s.dataset} schema={s} showIso={showIso} />
      ))}
    </ul>
  );
}

/* ── Notes ─────────────────────────────────────────────────────────────── */

/** The things a reader is owed before they trust a number off this page. */
export function Notes({ notes }: { notes: string[] }) {
  return (
    <ul className="space-y-2.5">
      {notes.map((n) => (
        <li key={n} className="flex gap-2.5 text-[13.5px] leading-relaxed text-muted">
          <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" />
          <span>{n}</span>
        </li>
      ))}
    </ul>
  );
}
