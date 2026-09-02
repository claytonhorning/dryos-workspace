import { Reveal, RevealGroup } from "@/components/hero/Reveal";
import { cx } from "@/components/ui";
import { LIVE_SCHEMA, SCHEMAS } from "@/lib/workspace/catalog";
import { Eyebrow, Heading, Lead, Section } from "./Section";

/**
 * The first verticals, and the argument for putting them under one roof.
 *
 * Energy and Weather are read from the catalogue — sectors and stream counts
 * come from what is actually collected, so the card cannot outrun the
 * collectors. Property is declared here as the next one, because there is
 * nothing in the catalogue to read yet, and the card says so rather than
 * wearing a count it does not have.
 *
 * The "at the source" lines are the real state of the real feeds — the ones
 * that cost an afternoon each in CLAUDE.md — because the claim of the section
 * is that public data is public but not usable, and a generic sentence about
 * "messy data" would not carry it.
 */
type Vertical = {
  name: string;
  status: "live" | "next";
  sectors: string[];
  streams?: number;
  sources: string;
  atSource: string;
};

function collected(domain: string) {
  const live = SCHEMAS.filter((s) => s.availability === "live" && s.path[0] === domain);
  return { sectors: [...new Set(live.map((s) => s.path[1]))], streams: live.length };
}

const VERTICALS: Vertical[] = [
  {
    name: "Energy",
    status: "live",
    ...collected("Energy"),
    sources: "ERCOT market reports and grid dashboards",
    atSource:
      "Zipped CSVs on a listing that keeps a few days. Timestamps in Central time, with a repeated-hour flag every report carries except one. Forecasts republished hourly, each copy a new vintage of tomorrow.",
  },
  {
    name: "Weather",
    status: "live",
    ...collected("Weather"),
    sources: "National Weather Service observations and forecasts, Open-Meteo wind fields",
    atSource:
      "A pagination cursor that never says stop. A field the station did not report and a field that does not exist, both arriving as null. Units that change from one station to the next.",
  },
  {
    name: "Property",
    status: "next",
    sectors: ["Assessments", "Transfers", "Permits", "Zoning"],
    sources: "County appraisal districts, clerks and permitting offices",
    atSource:
      "Published county by county, each in its own schema: some as spreadsheets, some as PDFs, none as an API. The same parcel described three ways by three offices.",
  },
];

export function TheData() {
  const live = SCHEMAS.filter((s) => s.availability === "live");
  const domains = new Set(live.map((s) => s.path[0])).size;

  return (
    <Section id="the-data">
      <Reveal when="view">
        <Eyebrow>The data</Eyebrow>
        <Heading>The data is public. The cleanup is the job.</Heading>
        <Lead>
          Almost everything worth building on is already published: by a grid operator, a
          weather service, a county. It arrives as zipped CSVs, hourly republications,
          local-time timestamps and column names that change without notice. Formatting,
          normalising and cleaning it is the whole job. That is what every data vendor charges
          for, and each of them does it for one vertical only.
        </Lead>
      </Reveal>

      <RevealGroup className="mt-10 grid gap-3 md:grid-cols-3">
        {VERTICALS.map((v) => (
          <div
            key={v.name}
            className={cx(
              "flex flex-col rounded-lg border p-5",
              v.status === "live" ? "border-line bg-surface" : "border-dashed border-line bg-surface/50",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{v.name}</h3>
              {v.status === "live" ? (
                <span className="rounded border border-accent-line bg-accent-dim px-1.5 py-[2px] font-mono text-[10px] tracking-[0.12em] text-accent uppercase">
                  {v.streams} live streams
                </span>
              ) : (
                <span className="rounded border border-line bg-surface-2 px-1.5 py-[2px] font-mono text-[10px] tracking-[0.12em] text-faint uppercase">
                  next
                </span>
              )}
            </div>

            <ul className="mt-3 flex flex-wrap gap-1.5">
              {v.sectors.map((s) => (
                <li
                  key={s}
                  className="rounded border border-line bg-surface-2 px-2 py-[3px] text-[11.5px] text-muted"
                >
                  {s}
                </li>
              ))}
            </ul>

            <div className="mt-5 font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
              Where it comes from
            </div>
            <p className="mt-1 text-[13.5px] text-ink">{v.sources}</p>

            <div className="mt-4 font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
              What it looks like there
            </div>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{v.atSource}</p>

            <p className="mt-5 border-t border-line pt-3 text-[12.5px] text-faint">
              Sold today by vendors who do only {v.name.toLowerCase()}, to companies who need
              only {v.name.toLowerCase()}.
            </p>
          </div>
        ))}
      </RevealGroup>

      <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
        <Reveal when="view">
          <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">
            Every vendor cleans one vertical. We clean all of them, once.
          </h3>
          <p className="mt-3 text-[15px] leading-[1.7] text-muted">
            A single-vertical vendor builds a collector, a validator, hosting, billing and a
            sales team, and charges one industry for the lot. One vertical over, another
            company builds the same five things again. The data was public both times. What
            got paid for twice was the plumbing.
          </p>
          <p className="mt-3 text-[15px] leading-[1.7] text-muted">
            Dryos is horizontal, so the plumbing is built once. The pipeline that stages,
            validates and promotes an ERCOT report is the one a weather station goes through
            and the one a county roll will; the sandbox, the metering and the marketplace are
            shared by every stream. The fixed cost is spread across every vertical, and what a
            stream has to earn is its maintainer&rsquo;s time and a slice of infrastructure,
            not a company. That is a different unit economics, and it is why the invoice below
            has two lines.
          </p>
        </Reveal>

        <RevealGroup className="grid grid-cols-2 gap-3 self-start">
          <Figure
            value={live.length.toLocaleString()}
            label="live streams"
            hint={`across ${domains} domains, one per collected report`}
          />
          <Figure
            value={`${Math.round(LIVE_SCHEMA.cadence.seconds / 60)} min`}
            label="fastest refresh"
            hint="real-time prices, collected as ERCOT posts them"
          />
          <Figure value="100%" label="checked against the source" hint="on every run, before it is promoted" />
          <Figure value="1" label="pipeline" hint="stage, validate, promote, for every source" accent />
        </RevealGroup>
      </div>
    </Section>
  );
}

function Figure({
  value,
  label,
  hint,
  accent,
}: {
  value: string;
  label: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-5 py-4">
      <div
        className={`font-mono text-[28px] tabular-nums tracking-tight ${accent ? "text-accent" : "text-ink"}`}
      >
        {value}
      </div>
      <div className="mt-1 text-[13.5px] font-semibold text-ink">{label}</div>
      <div className="mt-0.5 text-[12.5px] text-faint">{hint}</div>
    </div>
  );
}
