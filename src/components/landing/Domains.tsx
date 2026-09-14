import { Reveal, RevealGroup } from "@/components/hero/Reveal";
import { SCHEMAS } from "@/lib/workspace/catalog";
import { Eyebrow, Heading, Lead, Section } from "./Section";

/**
 * The three domains, in plain words: what is in each, where it comes from,
 * and who uses it. Counts are read from the catalogue, so a card cannot
 * claim a stream nobody collects.
 */
function count(domain: string) {
  return SCHEMAS.filter((s) => s.availability === "live" && s.dataset && s.path[0] === domain).length;
}

const DOMAINS = [
  {
    name: "Energy",
    glyph: "⚡",
    what: "Real-time and day-ahead power prices, demand, generation by fuel, wind and solar, and forecasts.",
    from: "ERCOT, MISO, PJM, SPP, CAISO, NYISO and ISO-NE",
    for: "Traders, analysts, developers and battery operators",
  },
  {
    name: "Weather",
    glyph: "☀",
    what: "Temperature, wind, humidity and cloud cover, observed and forecast, plus a wind field across Texas.",
    from: "The National Weather Service and Open-Meteo",
    for: "Load forecasters, energy desks and anyone planning around the weather",
  },
  {
    name: "Property",
    glyph: "⌂",
    what: "Building permits labelled by trade and job type: HVAC, roofing, solar and batteries, EV chargers and more.",
    from: "Austin, San Antonio, Fort Worth and Collin County",
    for: "Contractors, installers and people tracking local markets",
  },
];

export function Domains() {
  return (
    <Section id="data" band>
      <Reveal when="view">
        <Eyebrow>The data</Eyebrow>
        <Heading>Energy, weather and property, in one place.</Heading>
        <Lead>
          Public data is free, but it is rarely easy to use. We collect it straight from the
          source, check every run against that source, and serve it in one consistent shape, so
          it drops into a chart, a spreadsheet or an app without cleanup.
        </Lead>
      </Reveal>

      <RevealGroup className="mt-10 grid gap-3 lg:grid-cols-3">
        {DOMAINS.map((d) => (
          <div key={d.name} className="flex flex-col rounded-lg border border-line bg-surface p-6">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2.5 text-[19px] font-semibold tracking-[-0.01em] text-ink">
                <span aria-hidden className="text-accent">
                  {d.glyph}
                </span>
                {d.name}
              </h3>
              <span className="font-mono text-[11px] tracking-[0.1em] text-faint uppercase">
                {count(d.name)} streams
              </span>
            </div>
            <p className="mt-3 text-[14px] leading-relaxed text-muted">{d.what}</p>
            <dl className="mt-5 space-y-2 border-t border-line pt-4 text-[13px]">
              <div>
                <dt className="font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">From</dt>
                <dd className="mt-0.5 text-ink">{d.from}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">Used by</dt>
                <dd className="mt-0.5 text-muted">{d.for}</dd>
              </div>
            </dl>
          </div>
        ))}
      </RevealGroup>
    </Section>
  );
}
