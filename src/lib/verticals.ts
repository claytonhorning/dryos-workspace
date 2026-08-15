export type VerticalId = "energy" | "property" | "finance";

export interface Vertical {
  id: VerticalId;
  name: string;
  /** Shown in the nav dropdown. */
  blurb: string;
  status: "live" | "planned";
  /** What a maintainer in this vertical actually knows that a generalist doesn't. */
  expertise: string;
  examples: string[];
}

export const VERTICALS: Vertical[] = [
  {
    id: "energy",
    name: "Energy",
    blurb: "ISO market prices — starting with CAISO and ERCOT day-ahead",
    status: "live",
    expertise:
      "Which ISO renames a field between network model updates, and which tariff PDF actually governs a bill.",
    examples: ["CAISO day-ahead nodal LMP", "ERCOT day-ahead settlement point prices"],
  },
  {
    id: "property",
    name: "Property",
    blurb: "Parcels, permits, assessments, zoning — county by county",
    status: "planned",
    expertise:
      "Which of 3,000 county assessor portals changed its export format this quarter, and how parcel IDs survive a re-plat.",
    examples: [
      "County parcel & assessment rolls",
      "Building permit filings",
      "Zoning overlays",
      "Tax lien records",
    ],
  },
  {
    id: "finance",
    name: "Finance",
    blurb: "Regulatory filings, ownership, private-market disclosures",
    status: "planned",
    expertise:
      "Which exhibit inside a filing carries the number everyone quotes, and when an issuer quietly restates it.",
    examples: [
      "Form D private placements",
      "13F holdings deltas",
      "Municipal bond disclosures",
      "State UCC filings",
    ],
  },
];

export const verticalById = new Map(VERTICALS.map((v) => [v.id, v]));

export const LIVE_VERTICALS = VERTICALS.filter((v) => v.status === "live");
