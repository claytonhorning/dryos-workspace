/**
 * The people on the shelf and in the hero.
 *
 * Placeholders, and one roster on purpose: the landing page's ring and the
 * workspace's community panel must not name different experts for the same
 * source. Four maintainers across the domains the catalogue serves or is
 * about to, and two builders. Replace entries here as real people claim feeds; the
 * shape is what a maintainer record will carry.
 */
export interface Maintainer {
  name: string;
  /** The catalogue domain they keep, as the explorer names it. */
  domain: string;
  role: string;
  blurb: string;
  /** Absent until there is a photograph; initials stand in. */
  src?: string;
  initials: string;
}

export const MAINTAINERS: Maintainer[] = [
  {
    name: "Marcus Delgado",
    domain: "Energy",
    role: "Energy data maintainer",
    blurb:
      "ERCOT prices, ancillary services and load. Knows which report drops its repeated-hour flag.",
    src: "/landing/people/energy.jpg",
    initials: "MD",
  },
  {
    name: "Hannah Okafor",
    domain: "Weather",
    role: "Weather data maintainer",
    blurb:
      "NWS observations and forecasts. Knows which null means the station said nothing.",
    src: "/landing/people/weather.jpg",
    initials: "HO",
  },
  {
    name: "Anika Verma",
    domain: "Energy",
    role: "Energy data maintainer",
    blurb:
      "ERCOT ancillary services, system lambda and the DAM. Knows which clearing price is quoted per MW and which per MWh.",
    initials: "AV",
  },
  {
    name: "Tomás Rivera",
    domain: "Property",
    role: "Property data maintainer",
    blurb:
      "Permits first, city by city — Austin is live — then county rolls and transfers, one schema per office.",
    src: "/landing/people/property.jpg",
    initials: "TR",
  },
];

export interface Builder {
  name: string;
  /** What they build, in the words a shelf has room for. */
  note: string;
  /** Components published, in the shelf's own word: contributions. */
  pages: number;
  initials: string;
}

export const BUILDERS: Builder[] = [
  { name: "Priya Natarajan", note: "trading desk screens", pages: 6, initials: "PN" },
  { name: "Ben Whitaker", note: "weather-to-load pages", pages: 3, initials: "BW" },
];
