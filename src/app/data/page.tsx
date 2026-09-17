import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Crumbs, Notes, Section } from "@/components/data/parts";
import { JsonLd } from "@/components/JsonLd";
import { MCP_URL, PUBLIC_API, SITE } from "@/lib/apiDocs";
import { GROUPS, breadcrumbJsonLd, groupHref, liveStreams, streamHref, streamsIn } from "@/lib/dataPages";
import { blurbLead, categoryOf, domainOf } from "@/lib/workspace/catalog";

/**
 * The catalogue, as one page.
 *
 * Its job for a reader is orientation — what exists, from whom — and its job
 * for a crawler is to be the one page that links to all nine groups and,
 * through their sectors, names every stream. Everything on it is derived
 * from the catalogue, so a stream added tomorrow appears here, on its
 * group's page, and in the sitemap without anything being written twice.
 */

/*
  An hour, written as a literal: Next parses this export statically, before
  any module is evaluated, so an imported constant here is rejected outright
  ("Unknown identifier"). It must agree with `REVALIDATE_SECONDS`, which is
  what the fetches inside the page are cached for.
*/
export const revalidate = 3600;

const TITLE =
  "Data catalogue — every US power market, weather and permit stream Dryos collects";
const DESCRIPTION =
  "134 live data streams from ERCOT, MISO, PJM, SPP, CAISO, NYISO and ISO-NE, plus National Weather Service observations and Texas building permits. Free JSON API and MCP server, no key.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | Dryos` },
  description: DESCRIPTION,
  keywords: [
    "power market data",
    "electricity price API",
    "LMP data",
    "ISO data API",
    "grid data",
    "energy data catalogue",
  ],
  alternates: { canonical: "/data" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/data", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function DataIndex() {
  const streams = liveStreams();
  const energy = GROUPS.filter((g) => streamsIn(g).some((s) => domainOf(s) === "Energy"));
  const rest = GROUPS.filter((g) => !energy.includes(g));
  const entities = streams.reduce((n, s) => n + s.entities.count, 0);

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "DataCatalog",
          "@id": `${SITE}/data#catalog`,
          name: "Dryos data catalogue",
          description: DESCRIPTION,
          url: `${SITE}/data`,
          isAccessibleForFree: true,
          publisher: { "@type": "Organization", "@id": `${SITE}/#org`, name: "Dryos", url: SITE },
          dataset: streams.map((s) => ({
            "@type": "Dataset",
            name: s.name,
            description: blurbLead(s),
            url: `${SITE}${streamHref(s)}`,
            isAccessibleForFree: true,
          })),
        }}
      />
      <JsonLd data={breadcrumbJsonLd([{ name: "Data", href: "/data" }])} />

      <Crumbs trail={[{ name: "Data", href: "/data" }]} />

      <header className="mt-5 max-w-3xl">
        <p className="font-mono text-[11px] tracking-[0.16em] text-faint uppercase">Catalogue</p>
        <h1 className="mt-3 text-[34px] leading-[1.12] font-semibold tracking-[-0.02em] text-ink">
          Every stream Dryos collects
        </h1>
        <p className="mt-4 text-[15.5px] leading-relaxed text-muted">
          {streams.length} live streams across seven US grid operators, the National Weather
          Service and four Texas permit offices — {entities.toLocaleString()} nodes, zones,
          stations and fuels in all. Somebody maintains each one: it is pulled straight from
          the operator that publishes it, and every number is compared against that
          operator&apos;s own file before it is served. Free to read over HTTP or through an
          AI agent, with no key and no sign-up.
        </p>
      </header>

      <Section title="Grid operators" lead="The wholesale markets, each with its own page.">
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {energy.map((g) => (
            <li key={g.id}>
              <Link
                href={groupHref(g)}
                className="group block h-full rounded-lg border border-line bg-surface px-4 py-4 transition-colors hover:border-line-strong hover:bg-surface-2"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[16px] font-semibold text-ink group-hover:text-accent">
                    {g.label}
                  </span>
                  <span className="font-mono text-[11px] text-faint">
                    {streamsIn(g).length} {streamsIn(g).length === 1 ? "stream" : "streams"}
                  </span>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">
                  {[...new Set(streamsIn(g).map(categoryOf))].join(" · ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Beside the markets" lead="Why load moves, and what is being built.">
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {rest.map((g) => (
            <li key={g.id}>
              <Link
                href={groupHref(g)}
                className="group block h-full rounded-lg border border-line bg-surface px-4 py-4 transition-colors hover:border-line-strong hover:bg-surface-2"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[16px] font-semibold text-ink group-hover:text-accent">
                    {g.label}
                  </span>
                  <span className="font-mono text-[11px] text-faint">
                    {streamsIn(g).length} {streamsIn(g).length === 1 ? "stream" : "streams"}
                  </span>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{g.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Read any of it">
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-[13px] text-muted">The catalogue itself</p>
            <CodeBlock code={`curl "${PUBLIC_API}/v1/datasets"`} wrap />
          </div>
          <div>
            <p className="mb-1.5 text-[13px] text-muted">Or give an agent all of it at once</p>
            <CodeBlock code={`claude mcp add --transport http dryos ${MCP_URL}`} wrap />
          </div>
        </div>
      </Section>

      <Section title="The rules that stop a wrong number">
        <Notes
          notes={[
            "Every timestamp is UTC, and interval_start_utc is the start of the interval. Convert only for display.",
            "Null means the source did not report it — never zero.",
            "Forecasts keep every publication. Each interval's newest vintage is returned by default; vintages are never averaged together.",
            "Entity names are verbatim, inner spaces included. Look one up rather than guessing it.",
          ]}
        />
        <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
          The full set is on the{" "}
          <Link href="/docs" className="text-accent underline-offset-2 hover:underline">
            API reference
          </Link>
          , and at{" "}
          <a href="/llms.txt" className="text-accent underline-offset-2 hover:underline">
            /llms.txt
          </a>{" "}
          for an agent.
        </p>
      </Section>
    </div>
  );
}
