import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CodeBlock } from "@/components/CodeBlock";
import { ColumnTable, Crumbs, Facts, LiveFigures, Notes, Section, StreamList } from "@/components/data/parts";
import { JsonLd } from "@/components/JsonLd";
import { MCP_URL, PUBLIC_API } from "@/lib/apiDocs";
import {
  GROUP_BY_ID,
  assertUniqueAddresses,
  breadcrumbJsonLd,
  datasetJsonLd,
  findStream,
  firstCall,
  groupHref,
  groupOf,
  leafOf,
  liveStreams,
  mcpPrompt,
  related,
  rhythm,
  streamDescription,
  streamHref,
  streamTitle,
  tzNote,
} from "@/lib/dataPages";
import {
  coverage,
  datasetEntry,
  formatDay,
  headline,
  temporalCoverage,
} from "@/lib/liveData";
import { categoryOf, entityCountLabel, grainSeconds, isoOf } from "@/lib/workspace/catalog";

/**
 * One stream, at an address.
 *
 * Everything a reader needs before their first request, and everything a
 * search engine needs to know the page is about a real dataset: what it
 * measures and in what unit, how often it lands, where it came from, every
 * column with its own description, a request that works as written, and the
 * current value at a named place so the page is evidence rather than a
 * description.
 *
 * Prerendered for all 134 streams and revalidated hourly — a reader is
 * served HTML, and the API sees one call an hour per page rather than one
 * per visit.
 */

/*
  An hour, written as a literal: Next parses this export statically, before
  any module is evaluated, so an imported constant here is rejected outright
  ("Unknown identifier"). It must agree with `REVALIDATE_SECONDS`, which is
  what the fetches inside the page are cached for.
*/
export const revalidate = 3600;
/** Every address is generated below; anything else is a 404, not a guess. */
export const dynamicParams = false;

type Params = { params: Promise<{ group: string; stream: string }> };

export function generateStaticParams() {
  // A slug reduced to a leaf must still name exactly one stream. Checked here
  // so a collision fails the build rather than quietly serving the wrong page.
  assertUniqueAddresses();
  return liveStreams().map((s) => ({ group: groupOf(s)!.id, stream: leafOf(s) }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { group, stream } = await params;
  const schema = findStream(group, stream);
  if (!schema) return {};
  const title = streamTitle(schema);
  const description = streamDescription(schema);
  const url = streamHref(schema);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function StreamPage({ params }: Params) {
  const { group: groupId, stream: leaf } = await params;
  const group = GROUP_BY_ID.get(groupId);
  const schema = findStream(groupId, leaf);
  if (!group || !schema) notFound();

  const slug = schema.dataset!;
  const iso = isoOf(schema);
  const sector = categoryOf(schema);

  // All three in flight together: the page is prerendered, and three round
  // trips in series is three times the build.
  const [entry, extent] = await Promise.all([datasetEntry(slug), coverage(slug)]);

  const measure = entry?.serving?.measure ?? schema.variables[0]?.key ?? null;
  const unit = entry?.serving?.unit ?? schema.variables[0]?.unit ?? null;
  // A tally has no current value — a permit is an event, and "the newest
  // permit" is not a reading of anything.
  const figures =
    measure && !schema.tally ? await headline(slug, schema.entities.sample.slice(0, 3), measure) : [];

  const trail = [
    { name: "Data", href: "/data" },
    { name: group.label, href: groupHref(group) },
    { name: schema.name, href: streamHref(schema) },
  ];

  const examples = [
    { label: "The newest rows", code: `curl "${firstCall(schema)}"` },
    {
      label: "The catalogue entry — every column, its type and the source",
      code: `curl "${PUBLIC_API}/v1/datasets/${slug}"`,
    },
    ...(grainSeconds(schema) < 3600 && schema.entities.sample[0]
      ? [
          {
            label: "Hourly averages for the last day",
            code: `curl "${PUBLIC_API}/v1/datasets/${slug}/query?node=${encodeURIComponent(
              schema.entities.sample[0],
            )}&start=-24h&interval=1h&agg=avg"`,
          },
        ]
      : []),
  ];

  const siblings = related(schema);

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-10">
      <JsonLd
        data={datasetJsonLd(schema, {
          temporalCoverage: temporalCoverage(extent),
          source: entry?.source
            ? { name: entry.source.name, url: entry.source.url, basis: entry.source.basis }
            : undefined,
        })}
      />
      <JsonLd data={breadcrumbJsonLd(trail)} />

      <Crumbs trail={trail} />

      <header className="mt-5 max-w-3xl">
        <p className="font-mono text-[11px] tracking-[0.16em] text-faint uppercase">
          {iso ? `${iso} · ${sector}` : `${schema.path[0]} · ${sector}`}
        </p>
        <h1 className="mt-3 text-[32px] leading-[1.15] font-semibold tracking-[-0.02em] text-ink">
          {schema.name}
        </h1>
        <p className="mt-4 text-[15.5px] leading-relaxed text-muted">{schema.blurb}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <code className="rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[12px] text-ink">
            {slug}
          </code>
          <span className="font-mono text-[11.5px] text-faint">{rhythm(schema)}</span>
          <span className="font-mono text-[11.5px] text-faint">{entityCountLabel(schema)}</span>
        </div>
      </header>

      {figures.length > 0 && (
        <div className="mt-8">
          <LiveFigures
            figures={figures}
            unit={unit}
            caption={`Read from the Dryos API and cached for an hour; the stream itself updates ${schema.cadence.label}.`}
          />
        </div>
      )}

      <Section title="What is in it">
        <Facts
          rows={[
            { label: "Updates", value: rhythm(schema) },
            { label: "Entities", value: `${entityCountLabel(schema)}${schema.entities.sample.length ? ` — ${schema.entities.sample.slice(0, 3).join(", ")}…` : ""}` },
            {
              label: "Source",
              value: entry?.source ? (
                <a
                  href={entry.source.url}
                  className="text-accent underline-offset-2 hover:underline"
                  rel="noopener"
                >
                  {entry.source.name}
                </a>
              ) : (
                "Collected from the operator's own public endpoints"
              ),
            },
            { label: "Source timezone", value: `${tzNote(schema)} — every timestamp Dryos serves is UTC` },
            ...(extent?.earliest
              ? [{ label: "Coverage", value: `${formatDay(extent.earliest)} to now` }]
              : []),
            ...(extent?.rows
              ? [{ label: "Rows held", value: extent.rows.toLocaleString() }]
              : []),
            ...(entry?.primaryKey?.length
              ? [{ label: "Primary key", value: <span className="font-mono text-[12.5px]">{entry.primaryKey.join(", ")}</span> }]
              : []),
            ...(schema.located
              ? [
                  {
                    label: "On the map",
                    value: `${(schema.locatedCount ?? schema.entities.count).toLocaleString()} of ${schema.entities.count.toLocaleString()} placed${schema.locatedBy ? ` — ${schema.locatedBy}` : ""}`,
                  },
                ]
              : []),
          ]}
        />
      </Section>

      <Section
        title="What it measures"
        lead="Every value, its unit, and what the source means by it."
      >
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {schema.variables.map((v) => (
            <li key={v.key} className="rounded-lg border border-line bg-surface px-4 py-3.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[14px] font-medium text-ink">{v.label}</span>
                <span className="font-mono text-[11px] text-faint">{v.unit}</span>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{v.description}</p>
              <code className="mt-2 block font-mono text-[11.5px] text-faint">{v.key}</code>
            </li>
          ))}
        </ul>
      </Section>

      {entry?.schema?.length ? (
        <Section
          id="columns"
          title="Columns"
          lead="Exactly what a request answers with, read from the API rather than written here."
        >
          <ColumnTable columns={entry.schema} />
        </Section>
      ) : null}

      <Section
        id="api"
        title="Read it"
        lead="Public, read-only, no key and no sign-up. Relative times stay relative, so a URL keeps working."
      >
        <div className="space-y-4">
          {examples.map((e) => (
            <div key={e.label}>
              <p className="mb-1.5 text-[13px] text-muted">{e.label}</p>
              <CodeBlock code={e.code} wrap />
            </div>
          ))}
        </div>
        <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
          Full parameters — bucketing, aggregation, filters and search — are on the{" "}
          <Link href="/docs" className="text-accent underline-offset-2 hover:underline">
            API reference
          </Link>
          .
        </p>
      </Section>

      <Section
        id="mcp"
        title="Ask an agent"
        lead="The same stream through the Model Context Protocol, so Claude, ChatGPT, Cursor or any MCP client can query it directly."
      >
        <CodeBlock code={`claude mcp add --transport http dryos ${MCP_URL}`} wrap />
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">Then ask:</p>
        <blockquote className="mt-2 border-l-2 border-accent-line bg-accent-dim/40 py-2.5 pl-4 text-[14px] leading-relaxed text-ink">
          {mcpPrompt(schema)}
        </blockquote>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
          Setup for every client is on the{" "}
          <Link href="/mcp" className="text-accent underline-offset-2 hover:underline">
            MCP server page
          </Link>
          .
        </p>
      </Section>

      {entry?.changelog?.length ? (
        <Section
          id="changes"
          title="Changes to this collector"
          lead="A change in the collector is a change in the data. Anyone reading a step in a series is owed the day it moved under them."
        >
          <ol className="space-y-3">
            {entry.changelog.slice(0, 6).map((c) => (
              <li key={`${c.on}-${c.what}`} className="rounded-lg border border-line bg-surface px-4 py-3.5">
                <div className="font-mono text-[11px] tracking-[0.08em] text-faint">{c.on}</div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink">{c.what}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{c.why}</p>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <Section title="How this stream is checked">
        <Notes
          notes={[
            `Pulled straight from ${entry?.source?.name ?? "the operator that publishes it"} — no reseller in between — and compared against that file before it is served.`,
            "Null means the source did not report it — never zero.",
            `A reading lands ${schema.cadence.label}; the interval timestamp is the start of the interval, in UTC.`,
            ...group.notes.slice(0, 1),
          ]}
        />
      </Section>

      {siblings.length > 0 && (
        <Section title="Related streams">
          <StreamList streams={siblings} showIso />
        </Section>
      )}

      <div className="mt-12 flex flex-wrap gap-3 border-t border-line pt-6 text-[13.5px]">
        <Link href={groupHref(group)} className="text-accent underline-offset-2 hover:underline">
          All {group.label} streams
        </Link>
        <span className="text-faint">·</span>
        <Link href="/data" className="text-accent underline-offset-2 hover:underline">
          The whole catalogue
        </Link>
        <span className="text-faint">·</span>
        <Link href="/workspace" className="text-accent underline-offset-2 hover:underline">
          Chart it in a workspace
        </Link>
      </div>
    </div>
  );
}
