import {
  SCHEMAS,
  blurbLead,
  categoryOf,
  domainOf,
  grainSeconds,
  isoOf,
  sourceTzOf,
  type Schema,
} from "@/lib/workspace/catalog";
import { PUBLIC_API, SITE, every } from "@/lib/apiDocs";

/**
 * The public catalogue, as pages a search engine can reach.
 *
 * The workspace explorer and `/docs` both browse the same 134 streams, and
 * neither is an address: the explorer is behind a login, and `/docs` is one
 * page with a client-side filter. Somebody searching for "ERCOT real-time
 * LMP data" or "CAISO fuel mix API" lands on neither. So every live stream
 * gets a URL of its own, grouped under the operator that publishes it.
 *
 * Nothing here is written twice. The names, blurbs, units, cadences and
 * entity samples are the catalogue's; the source, columns, row count and
 * changelog are read from the delivery API at build time (see
 * `lib/liveData.ts`). This module is only the address scheme and the words
 * that introduce a group — the part no machine can derive.
 */

/** A group is one page of its own and the parent of its streams. */
export interface Group {
  /** The URL segment: `/data/ercot`. */
  id: string;
  /** How the operator writes its own name. */
  label: string;
  /** The collector-slug prefix its streams carry, where that differs. */
  prefix: string;
  /** A suffix stripped from the leaf, for a family named the other way round. */
  strip?: string;
  /** The `<title>`, which is also the H1's subject. */
  title: string;
  /** The meta description. One sentence, under 160 characters where it can be. */
  description: string;
  /** What the operator is, for a reader who does not already know. */
  intro: string;
  /** Facts worth stating above the stream list. */
  notes: string[];
  /** A stream slug and entity whose current value stands for the group. */
  headline?: { dataset: string; entities: string[] };
}

const ISO_TZ_NOTE: Record<string, string> = {
  ERCOT: "ERCOT settles and publishes on US Central time. Every timestamp Dryos serves is UTC.",
  MISO: "MISO runs on Eastern Standard Time all year and never observes daylight saving. Every timestamp Dryos serves is UTC.",
  PJM: "PJM's Eastern Prevailing Time observes daylight saving; its rows carry UTC as well. Every timestamp Dryos serves is UTC.",
  SPP: "SPP publishes on US Central prevailing time, with a UTC column on every row. Every timestamp Dryos serves is UTC.",
  CAISO: "CAISO's market clock is US Pacific; OASIS answers in UTC. Every timestamp Dryos serves is UTC.",
  NYISO: "NYISO stamps its files in Eastern prevailing time with no zone column. Every timestamp Dryos serves is UTC.",
  "ISO-NE": "ISO-NE stamps its files in Eastern prevailing time with no zone column. Every timestamp Dryos serves is UTC.",
};

export const GROUPS: Group[] = [
  {
    id: "ercot",
    label: "ERCOT",
    prefix: "ercot",
    title: "ERCOT data API — real-time and day-ahead LMP, load, fuel mix and forecasts",
    description:
      "Free ERCOT market data: real-time and day-ahead settlement point prices at 1,118 nodes, system load, generation by fuel, wind and solar, ancillary prices and forecasts. JSON API and MCP server.",
    intro:
      "ERCOT runs the electricity market for most of Texas — an energy-only market with no capacity payments, cleared every five minutes by its SCED engine and published to the ERCOT MIS with no credentials required. Dryos pulls every stream straight from those endpoints and compares what it stores against ERCOT's own file.",
    notes: [
      ISO_TZ_NOTE.ERCOT,
      "Settlement points are placed on the map through ERCOT's unit mapping and EIA-860M plant coordinates — a join, not a publication, and the coverage line says so.",
      "The 60-day disclosure workbooks and the unplanned-outage report are deliberately not collected: different file formats, not CSV streams.",
    ],
    headline: { dataset: "ercot-realtime-lmp", entities: ["HB_NORTH", "HB_HOUSTON", "HB_WEST"] },
  },
  {
    id: "miso",
    label: "MISO",
    prefix: "miso",
    title: "MISO data API — real-time and day-ahead LMP, load, fuel mix and interchange",
    description:
      "Free MISO market data: five-minute and day-ahead locational marginal prices, ancillary clearing prices, system load, generation by fuel, wind and solar, and net interchange. JSON API and MCP server.",
    intro:
      "MISO operates the market across fifteen states from Manitoba to Louisiana. It has two front doors and only one of them is intraday: the keyed Data Exchange serves a market date once it is complete, so the real-time streams here read MISO's own public dashboard API — the JSON behind its price map — while the day-ahead price comes from the Data Exchange, which posts it the afternoon before.",
    notes: [
      ISO_TZ_NOTE.MISO,
      "MISO's five-minute price label is the interval's end. Dryos stores the interval's start, proved row for row against the Data Exchange copy of the same day.",
      "The energy component is derived: MISO publishes LMP, congestion and loss, and the identity LMP = energy + congestion + loss holds to the cent.",
    ],
    headline: { dataset: "miso-realtime-lmp", entities: ["INDIANA.HUB", "MICHIGAN.HUB", "MINN.HUB"] },
  },
  {
    id: "pjm",
    label: "PJM",
    prefix: "pjm",
    title: "PJM data API — real-time and day-ahead LMP, load, generation and constraints",
    description:
      "Free PJM Data Miner 2 market data: five-minute and day-ahead LMPs at 482 aggregates and 13,967 buses, load, fuel mix, reserves, constraints and forecasts. JSON API and MCP server.",
    intro:
      "PJM coordinates the grid across thirteen mid-Atlantic and Midwest states, the largest wholesale electricity market in North America. Everything here comes from Data Miner 2 on a single key, paced through one lock — six requests a minute is the whole budget, and a seventh is a 429.",
    notes: [
      ISO_TZ_NOTE.PJM,
      "A node is one string across all four LMP streams: the substation padded to eight characters, then the voltage — a fixed-width relic, checked against PJM's pricing-node master for every row read.",
      "The real-time feed is unverified in its name and in fact; the verified copy posts the next business day. 28 of 14,449 nodes differed on the interval checked, most by rounding.",
    ],
    headline: { dataset: "pjm-realtime-lmp", entities: ["WESTERN HUB", "EASTERN HUB", "AEP GEN HUB"] },
  },
  {
    id: "spp",
    label: "SPP",
    prefix: "spp",
    title: "SPP data API — real-time and day-ahead LMP, load, fuel mix and reserves",
    description:
      "Free SPP market data: five-minute and day-ahead locational marginal prices at 1,612 settlement locations and 9,252 buses, load, fuel mix, ancillary prices, constraints and forecasts. JSON API and MCP server.",
    intro:
      "SPP balances the grid from North Dakota to the Texas panhandle, and since 2026 runs a western market in the same files. Its marketplace portal publishes flat CSVs with no listing endpoint, so every path Dryos reads is built rather than discovered.",
    notes: [
      ISO_TZ_NOTE.SPP,
      "Two markets share one file: BAA is SPP for the RTO and SWPW for the western market, which clears on its own energy price.",
      "All three price components are published and sum to the LMP on every row — nothing is derived.",
    ],
    headline: { dataset: "spp-realtime-lmp", entities: ["SPPNORTH_HUB", "SPPSOUTH_HUB"] },
  },
  {
    id: "caiso",
    label: "CAISO",
    prefix: "caiso",
    title: "CAISO data API — real-time, fifteen-minute and day-ahead LMP, load and fuel mix",
    description:
      "Free CAISO OASIS market data: five-minute, fifteen-minute and day-ahead LMPs at every APnode, load and renewables forecasts, fuel mix, ancillary prices, constraints and Western EIM transfers. JSON API and MCP server.",
    intro:
      "CAISO runs California's market and, through the Western EIM, balances imbalance energy across much of the West. Its price has five parts rather than three: energy, congestion, loss and a greenhouse-gas component, which is what makes a California node's price different in kind from any other operator's.",
    notes: [
      ISO_TZ_NOTE.CAISO,
      "LMP = energy + congestion + loss + greenhouse gas, held on every row. The energy component is not one number: each Western EIM area balances separately and takes six to ten values an interval.",
      "Every CAISO price file lists nodes it does not price, at exactly zero in all five components. Those are dropped rather than stored as real $0 prices.",
    ],
    headline: {
      dataset: "caiso-realtime-lmp",
      entities: ["TH_NP15_GEN-APND", "TH_SP15_GEN-APND", "TH_ZP26_GEN-APND"],
    },
  },
  {
    id: "nyiso",
    label: "NYISO",
    prefix: "nyiso",
    title: "NYISO data API — real-time and day-ahead LBMP, load, fuel mix and interface flows",
    description:
      "Free NYISO market data: five-minute and day-ahead zonal and generator LBMPs, system load and its six-day forecast, fuel mix, reserve prices, constraints and interface flows. JSON API and MCP server.",
    intro:
      "NYISO runs New York's market across eleven load zones and four external proxies, publishing one CSV per report per day and rewriting it as the day advances. Dryos reads the zonal and generator price files as one stream: 763 points an interval.",
    notes: [
      ISO_TZ_NOTE.NYISO,
      "NYISO publishes congestion with the opposite sign. Dryos stores it negated, so LBMP = energy + congestion + loss holds as it does everywhere else.",
      "The day file runs two hours into the future with advisory prices. Nothing past the last dispatched interval is kept.",
    ],
    headline: { dataset: "nyiso-realtime-lmp", entities: ["N.Y.C.", "LONGIL", "WEST"] },
  },
  {
    id: "iso-ne",
    label: "ISO-NE",
    prefix: "isone",
    title: "ISO-NE data API — five-minute real-time LMP at every New England node",
    description:
      "Free ISO New England market data: preliminary five-minute locational marginal prices at all 1,205 pricing locations — hubs, load zones, external nodes and generator units. JSON API and MCP server.",
    intro:
      "ISO-NE runs the market for the six New England states. Its live price files sit behind a token its own report pages mint — no login, twelve hours — while the closed four-hour blocks are open to anyone, and Dryos reads both so a missed interval heals from the archive.",
    notes: [
      ISO_TZ_NOTE["ISO-NE"],
      "The stamp is the interval's start, proved against ISO-NE's own hourly file: the five-minute energy averages equal it to the cent read as starts, and miss by up to $1.59 read as ends.",
      "ISO-NE publishes a coordinate for every network node, so all 1,137 are placed on the map without a name match.",
    ],
    headline: { dataset: "isone-realtime-lmp", entities: [".H.INTERNAL_HUB"] },
  },
  {
    id: "weather",
    label: "Weather",
    prefix: "",
    title: "Weather data API — NWS observations, gridpoint forecasts and a Texas wind field",
    description:
      "Free weather data beside the power markets: National Weather Service station observations and gridpoint forecasts, Open-Meteo zone forecasts, and a wind field across Texas. JSON API and MCP server.",
    intro:
      "Weather is the second source family, and it is here because load and renewable output are weather. Every observation carries the station's own published coordinates, so the map places them from the row rather than from a lookup table.",
    notes: [
      "Every weather timestamp is UTC at the source and at Dryos.",
      "A null column from a misnamed key and a null column from an unreported measurement are indistinguishable afterwards, so a key absent from the response raises rather than landing as a quiet null.",
      "Open-Meteo answers for many coordinates in one request, which is why a 168-cell wind field is two calls rather than 168.",
    ],
  },
  {
    id: "permits",
    label: "Building permits",
    prefix: "",
    strip: "-permits",
    title: "Building permit data API — Austin, San Antonio, Fort Worth and Collin County",
    description:
      "Free Texas building permit data: every permit issued in Austin, San Antonio, Fort Worth and Collin County, labelled by trade and action — roofing, HVAC, solar, batteries. JSON API and MCP server.",
    intro:
      "A permit is an event, not a reading, so these streams are read as tallies: how many were issued, of what kind, by whom and where. The cities publish them on Socrata, CKAN and ArcGIS portals; Dryos normalises the three into one shape and labels every permit with a subject and an action of its own.",
    notes: [
      "The people are not stored. Contractor and applicant names, phones and addresses are never selected; the contractor company is kept, because which firms pull permits where is the point of the feed.",
      "Subject and action are Dryos's own versioned labels, stored beside the city's rows rather than in them — the city's data stays exactly what the city published.",
      "Most of unincorporated Texas needs no permit at all, so rural and co-op installs are invisible to every permit feed.",
    ],
  },
];

export const GROUP_BY_ID = new Map(GROUPS.map((g) => [g.id, g]));

/** Every stream with a collector behind it — the only ones that get a page. */
export function liveStreams(): Schema[] {
  return SCHEMAS.filter((s) => s.dataset && s.availability === "live");
}

/** Which group's page a stream belongs under. */
export function groupOf(schema: Schema): Group | undefined {
  const domain = domainOf(schema);
  if (domain === "Weather") return GROUP_BY_ID.get("weather");
  if (domain === "Property") return GROUP_BY_ID.get("permits");
  const iso = isoOf(schema);
  return GROUPS.find((g) => g.label === iso);
}

/**
 * The stream's own URL segment: the slug with what the group already says
 * taken off it. `/data/ercot/realtime-lmp` rather than
 * `/data/ercot/ercot-realtime-lmp`, which says ERCOT twice.
 */
export function leafOf(schema: Schema): string {
  const slug = schema.dataset!;
  const group = groupOf(schema);
  if (!group) return slug;
  let leaf = slug;
  if (group.prefix && leaf.startsWith(`${group.prefix}-`)) leaf = leaf.slice(group.prefix.length + 1);
  if (group.strip && leaf.endsWith(group.strip)) leaf = leaf.slice(0, -group.strip.length);
  return leaf;
}

export function streamHref(schema: Schema): string {
  const group = groupOf(schema);
  return group ? `/data/${group.id}/${leafOf(schema)}` : `/data`;
}

export function groupHref(group: Group): string {
  return `/data/${group.id}`;
}

/** The streams on one group's page, in catalogue order. */
export function streamsIn(group: Group): Schema[] {
  return liveStreams().filter((s) => groupOf(s)?.id === group.id);
}

/** Resolve a URL back to a stream. Returns undefined for an address that names none. */
export function findStream(groupId: string, leaf: string): Schema | undefined {
  const group = GROUP_BY_ID.get(groupId);
  if (!group) return undefined;
  return streamsIn(group).find((s) => leafOf(s) === leaf);
}

/**
 * Every address is exactly one stream's.
 *
 * The leaf is built by taking a prefix off a slug, which is only safe while
 * no two slugs in a group reduce to the same thing — and the day one does,
 * a page would silently serve the wrong stream. Called from the page's
 * `generateStaticParams`, so a collision fails the build rather than the
 * reader.
 */
export function assertUniqueAddresses(): void {
  const seen = new Map<string, string>();
  for (const s of liveStreams()) {
    const group = groupOf(s);
    if (!group) throw new Error(`No /data group for ${s.dataset} (${s.path.join(" › ")})`);
    const href = streamHref(s);
    const taken = seen.get(href);
    if (taken) throw new Error(`${href} is claimed by both ${taken} and ${s.dataset}`);
    seen.set(href, s.dataset!);
  }
}

/** The sectors a group's streams fall into, each with its streams. */
export function sectionsIn(group: Group): { sector: string; streams: Schema[] }[] {
  const out = new Map<string, Schema[]>();
  for (const s of streamsIn(group)) {
    const key = categoryOf(s);
    const list = out.get(key);
    if (list) list.push(s);
    else out.set(key, [s]);
  }
  return [...out.entries()].map(([sector, streams]) => ({ sector, streams }));
}

/* ── Words a page needs, derived rather than written per stream ────────── */

/** "every 5 min · 5m rows" — delivery and resolution, which differ on a forecast. */
export function rhythm(schema: Schema): string {
  const grain = grainSeconds(schema);
  const rows = `${every(grain)} rows`;
  return schema.cadence.seconds === grain
    ? `${schema.cadence.label} · ${rows}`
    : `${schema.cadence.label} · ${rows}`;
}

/**
 * The page title for one stream.
 *
 * The layout's template appends " — Dryos", so this carries no dash of its
 * own: two of them in one title reads as a sentence that lost its way, and
 * the tail is what a search result truncates first.
 */
export function streamTitle(schema: Schema): string {
  const iso = isoOf(schema);
  const named = iso && schema.name.toUpperCase().startsWith(iso.toUpperCase());
  const subject = named ? schema.name : iso ? `${iso} ${schema.name}` : schema.name;
  return `${subject} data and free API`;
}

/**
 * The meta description, kept inside what a result actually shows.
 *
 * Google truncates around 160 characters and cuts mid-word; the blurb's own
 * first sentence is the part that distinguishes two streams, so it leads and
 * the counted facts follow only while they fit whole.
 */
export function streamDescription(schema: Schema): string {
  const lead = blurbLead(schema).replace(/\s+/g, " ").trim();
  const facts = `${schema.entities.count.toLocaleString()} entities, ${schema.cadence.label}. Free JSON API and MCP server, no key.`;
  const full = `${lead} ${facts}`;
  if (full.length <= 185) return full;
  // The lead alone still beats a truncated one: a description that ends in an
  // ellipsis mid-fact tells a reader less than a shorter complete one.
  return lead.length <= 185 ? lead : `${lead.slice(0, 182).trimEnd()}…`;
}

/** The canonical REST call a reader should try first. */
export function firstCall(schema: Schema): string {
  const node = schema.entities.sample[0];
  const q = node ? `?node=${encodeURIComponent(node)}&limit=12` : "?limit=12";
  return `${PUBLIC_API}/v1/datasets/${schema.dataset}/query${q}`;
}

/**
 * An MCP prompt that only makes sense for this stream.
 *
 * The measure keeps the catalogue's own capitalisation: lowercasing it turns
 * "Total LMP" into "total lmp", and an acronym written down is the one word
 * a reader checks the sentence against.
 */
export function mcpPrompt(schema: Schema): string {
  const node = schema.entities.sample[0];
  const measure = schema.variables[0]?.label ?? "the headline value";
  if (schema.tally)
    return `How many permits did ${schema.name.replace(/ permits$/i, "")} issue each week this quarter, by trade?`;
  if (node) return `What has ${measure} been at ${node} over the last 24 hours, and when did it peak?`;
  return `Show me ${measure} on ${schema.name} over the last 24 hours.`;
}

/** Streams a reader who wanted this one might also want. */
export function related(schema: Schema, limit = 6): Schema[] {
  const group = groupOf(schema);
  const sector = categoryOf(schema);
  const pool = liveStreams().filter((s) => s.dataset !== schema.dataset);
  const sameSector = pool.filter((s) => groupOf(s)?.id === group?.id && categoryOf(s) === sector);
  const sameGroup = pool.filter((s) => groupOf(s)?.id === group?.id && categoryOf(s) !== sector);
  // The same question asked of another operator — the comparison a reader on
  // a price page most often wants next.
  const sameSubject = pool.filter(
    (s) => groupOf(s)?.id !== group?.id && leafOf(s) === leafOf(schema),
  );
  const out: Schema[] = [];
  for (const s of [...sameSector, ...sameSubject, ...sameGroup]) {
    if (out.length >= limit) break;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/* ── Structured data ───────────────────────────────────────────────────── */

const ORG = { "@type": "Organization", "@id": `${SITE}/#org`, name: "Dryos", url: SITE };

/**
 * One stream as schema.org `Dataset`, which is the vocabulary Google's
 * dataset search reads. `variableMeasured` carries the columns and their
 * units, so the entry says what the numbers are rather than only that some
 * exist.
 */
export function datasetJsonLd(
  schema: Schema,
  extra: {
    temporalCoverage?: string;
    source?: { name: string; url: string; basis?: string };
  } = {},
): Record<string, unknown> {
  /*
    `license` is left off deliberately, and `usageInfo` points at the source's
    own terms rather than asserting one of our own.

    The collectors record a basis for every stream. `public_government` and
    `iso_public` mean the publisher puts it out with no credential, so naming
    that publisher's page as where the terms live is a fact. `tos_reviewed`
    means the redistribution terms have not been read yet — so nothing is
    emitted for those at all. Structured data is the one place a crawler can
    check a claim against reality, and a permissive licence we have not
    verified is the worst kind of thing to put there.
  */
  const termsKnown = extra.source?.basis === "public_government" || extra.source?.basis === "iso_public";
  const url = `${SITE}${streamHref(schema)}`;
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": `${url}#dataset`,
    name: schema.name,
    alternateName: schema.dataset,
    description: schema.blurb,
    url,
    identifier: schema.dataset,
    isAccessibleForFree: true,
    creator: ORG,
    publisher: ORG,
    keywords: [
      schema.name,
      isoOf(schema) ?? domainOf(schema),
      categoryOf(schema),
      ...schema.variables.map((v) => v.label),
    ].filter(Boolean),
    temporalCoverage: extra.temporalCoverage,
    isBasedOn: extra.source
      ? { "@type": "CreativeWork", name: extra.source.name, url: extra.source.url }
      : undefined,
    usageInfo: termsKnown && extra.source ? extra.source.url : undefined,
    variableMeasured: schema.variables.map((v) => ({
      "@type": "PropertyValue",
      name: v.label,
      description: v.description,
      unitText: v.unit,
      identifier: v.key,
    })),
    distribution: [
      {
        "@type": "DataDownload",
        name: "REST API (JSON)",
        encodingFormat: "application/json",
        contentUrl: `${PUBLIC_API}/v1/datasets/${schema.dataset}/query`,
      },
      {
        "@type": "DataDownload",
        name: "Catalogue entry (JSON)",
        encodingFormat: "application/json",
        contentUrl: `${PUBLIC_API}/v1/datasets/${schema.dataset}`,
      },
    ],
  };
}

/** A group page as a catalogue of the datasets on it. */
export function groupJsonLd(group: Group): Record<string, unknown> {
  const url = `${SITE}${groupHref(group)}`;
  return {
    "@context": "https://schema.org",
    "@type": "DataCatalog",
    "@id": `${url}#catalog`,
    name: `${group.label} data on Dryos`,
    description: group.description,
    url,
    publisher: ORG,
    isAccessibleForFree: true,
    dataset: streamsIn(group).map((s) => ({
      "@type": "Dataset",
      name: s.name,
      description: s.blurb,
      url: `${SITE}${streamHref(s)}`,
      isAccessibleForFree: true,
    })),
  };
}

/** Where the reader is, for the crumb trail a result can show. */
export function breadcrumbJsonLd(trail: { name: string; href: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: `${SITE}${t.href}`,
    })),
  };
}

/** Timezone note for a stream, in one sentence. */
export function tzNote(schema: Schema): string {
  const tz = sourceTzOf(schema);
  const pretty: Record<string, string> = {
    "America/Chicago": "US Central",
    "America/New_York": "US Eastern",
    "America/Los_Angeles": "US Pacific",
    EST: "Eastern Standard Time all year, never EDT",
    UTC: "UTC",
  };
  return pretty[tz] ?? tz;
}
