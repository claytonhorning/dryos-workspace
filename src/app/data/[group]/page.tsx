import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CodeBlock } from "@/components/CodeBlock";
import { Crumbs, Facts, LiveFigures, Notes, Section, StreamList } from "@/components/data/parts";
import { JsonLd } from "@/components/JsonLd";
import { MCP_URL, PUBLIC_API } from "@/lib/apiDocs";
import {
  GROUPS,
  GROUP_BY_ID,
  breadcrumbJsonLd,
  groupHref,
  groupJsonLd,
  sectionsIn,
  streamsIn,
} from "@/lib/dataPages";
import { headline } from "@/lib/liveData";
import { schemaFor } from "@/lib/workspace/catalog";

/**
 * One operator, and everything Dryos collects from it.
 *
 * The head term — "ERCOT data", "PJM API" — lands here, and the page has to
 * answer the question that brought somebody before it asks anything of them:
 * what this operator is, what is collected, at what cadence, and what the
 * price is right now. The stream list below it is the whole point of the
 * page for a search engine: nine hubs passing link equity to 134 streams
 * that would otherwise be reachable only from a sitemap.
 */

/*
  An hour, written as a literal: Next parses this export statically, before
  any module is evaluated, so an imported constant here is rejected outright
  ("Unknown identifier"). It must agree with `REVALIDATE_SECONDS`, which is
  what the fetches inside the page are cached for.
*/
export const revalidate = 3600;
export const dynamicParams = false;

type Params = { params: Promise<{ group: string }> };

export function generateStaticParams() {
  return GROUPS.map((g) => ({ group: g.id }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { group: id } = await params;
  const group = GROUP_BY_ID.get(id);
  if (!group) return {};
  return {
    title: { absolute: `${group.title} | Dryos` },
    description: group.description,
    alternates: { canonical: groupHref(group) },
    openGraph: { title: group.title, description: group.description, url: groupHref(group), type: "website" },
    twitter: { card: "summary_large_image", title: group.title, description: group.description },
  };
}

export default async function GroupPage({ params }: Params) {
  const { group: id } = await params;
  const group = GROUP_BY_ID.get(id);
  if (!group) notFound();

  const streams = streamsIn(group);
  const sections = sectionsIn(group);

  // The figure that stands for the operator: its trading hubs, right now.
  const head = group.headline ? schemaFor(group.headline.dataset) : undefined;
  const measure = head?.variables[0]?.key;
  const figures =
    group.headline && head && measure
      ? await headline(group.headline.dataset, group.headline.entities, measure)
      : [];

  const trail = [
    { name: "Data", href: "/data" },
    { name: group.label, href: groupHref(group) },
  ];

  const oldest = streams.reduce(
    (min, s) => Math.min(min, s.cadence.seconds),
    Number.POSITIVE_INFINITY,
  );

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-10">
      <JsonLd data={groupJsonLd(group)} />
      <JsonLd data={breadcrumbJsonLd(trail)} />

      <Crumbs trail={trail} />

      <header className="mt-5 max-w-3xl">
        <p className="font-mono text-[11px] tracking-[0.16em] text-faint uppercase">
          {streams.length} live {streams.length === 1 ? "stream" : "streams"}
        </p>
        <h1 className="mt-3 text-[34px] leading-[1.12] font-semibold tracking-[-0.02em] text-ink">
          {group.label} data
        </h1>
        <p className="mt-4 text-[15.5px] leading-relaxed text-muted">{group.intro}</p>
      </header>

      {figures.length > 0 && head && (
        <div className="mt-8">
          <LiveFigures
            figures={figures}
            unit={head.variables[0]?.unit}
            caption={`${head.name}, read from the Dryos API and cached for an hour.`}
          />
        </div>
      )}

      <Section title="What is collected" lead={`Every ${group.label} stream Dryos holds, grouped the way the catalogue groups them.`}>
        <Facts
          rows={[
            { label: "Streams", value: `${streams.length} live` },
            {
              label: "Fastest cadence",
              value: Number.isFinite(oldest)
                ? streams.find((s) => s.cadence.seconds === oldest)!.cadence.label
                : "—",
            },
            {
              label: "Entities",
              value: `${streams
                .reduce((n, s) => n + s.entities.count, 0)
                .toLocaleString()} across every stream`,
            },
            { label: "Access", value: "Public REST API and MCP server, no key" },
          ]}
        />
      </Section>

      {sections.map((s) => (
        <Section key={s.sector} title={s.sector}>
          <StreamList streams={s.streams} />
        </Section>
      ))}

      <Section title="Worth knowing first">
        <Notes notes={group.notes} />
      </Section>

      <Section
        title="Read it"
        lead="Public, read-only, no key and no sign-up. Every stream answers the same way."
      >
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-[13px] text-muted">Every stream in the catalogue</p>
            <CodeBlock code={`curl "${PUBLIC_API}/v1/datasets"`} wrap />
          </div>
          {group.headline && (
            <div>
              <p className="mb-1.5 text-[13px] text-muted">
                The newest rows at {group.headline.entities[0]}
              </p>
              <CodeBlock
                code={`curl "${PUBLIC_API}/v1/datasets/${group.headline.dataset}/query?node=${encodeURIComponent(
                  group.headline.entities[0],
                )}&limit=12"`}
                wrap
              />
            </div>
          )}
          <div>
            <p className="mb-1.5 text-[13px] text-muted">Or point an AI agent at all of it</p>
            <CodeBlock code={`claude mcp add --transport http dryos ${MCP_URL}`} wrap />
          </div>
        </div>
        <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
          Full parameters are on the{" "}
          <Link href="/docs" className="text-accent underline-offset-2 hover:underline">
            API reference
          </Link>
          ; every client&apos;s setup is on the{" "}
          <Link href="/mcp" className="text-accent underline-offset-2 hover:underline">
            MCP server page
          </Link>
          .
        </p>
      </Section>

      <Section title="Other operators">
        <ul className="flex flex-wrap gap-2">
          {GROUPS.filter((g) => g.id !== group.id).map((g) => (
            <li key={g.id}>
              <Link
                href={groupHref(g)}
                className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                {g.label}
                <span className="font-mono text-[11px] text-faint">{streamsIn(g).length}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
