/**
 * Who operates each collector.
 *
 * The first two are run in-house — normal for a bootstrap, and the honest thing
 * to show while there are no third-party maintainers. Every field here is
 * editable copy about a real person, so keep it accurate: the whole pitch is
 * that a named human is accountable for the feed, which fails immediately if
 * the name is decorative.
 */
export interface Maintainer {
  id: string;
  name: string;
  handle: string;
  title: string;
  location: string;
  bio: string;
  /**
   * Path under /public, e.g. "/maintainers/clayton.jpg". Leave undefined and the
   * card falls back to initials rather than a stock photo of nobody.
   */
  photo?: string;
  since: string;
  contact?: string;
}

export const MAINTAINERS: Record<string, Maintainer> = {
  in_house: {
    id: "in_house",
    name: "Clayton Horning",
    handle: "clayton",
    title: "Founder · operates the launch collectors",
    location: "United States",
    bio:
      "Runs the ERCOT and CAISO collectors directly while Dryos is being built. " +
      "If a feed breaks, this is the person who gets the alert and the person who " +
      "answers you — there is no support tier in between.",
    since: "August 2026",
    contact: "mailto:hello@dryos.dev",
  },
};

/** Which maintainer operates a given dataset. */
export const DATASET_MAINTAINER: Record<string, string> = {
  "ercot-realtime-lmp": "in_house",
  "caiso-day-ahead-nodal-lmp": "in_house",
};

export function maintainerFor(slug: string): Maintainer | undefined {
  const id = DATASET_MAINTAINER[slug];
  return id ? MAINTAINERS[id] : undefined;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
