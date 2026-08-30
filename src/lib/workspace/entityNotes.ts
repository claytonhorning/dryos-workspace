/**
 * One-line meanings for the entities people quote.
 *
 * The literal answer to "how do I know HB_SOUTH from HB_HOUSTON": tell them.
 * Curated, deliberately small — hubs, load zones and DC ties are the ~20 names
 * a newcomer meets first, and the thousand resource nodes behind them are
 * expert territory that needs no caption. Like `geo.ts`, this is convenience
 * knowledge held frontend-side for now; the framework destination is a
 * maintainer-published glossary served with the dataset, because curating the
 * entity space is part of what a maintainer is accountable for.
 */
export const ENTITY_NOTES: Record<string, string> = {
  // Trading hubs — the prices people quote.
  HB_HOUSTON: "Houston hub — the Gulf Coast price most quotes reference.",
  HB_NORTH: "North hub — covers DFW; the most-traded ERCOT hub.",
  HB_WEST: "West hub — West Texas, where wind and solar set the price.",
  HB_SOUTH: "South hub — San Antonio down to the border.",
  HB_PAN: "Panhandle hub.",
  HB_BUSAVG: "Average of every electrical bus — a reference, not a traded point.",
  HB_HUBAVG: "Average of the four geographic hubs.",

  // Load zones — what load in each region pays.
  LZ_HOUSTON: "Houston load zone — what load on the Gulf Coast pays.",
  LZ_NORTH: "North load zone — what load around DFW pays.",
  LZ_SOUTH: "South load zone — what load in South Texas pays.",
  LZ_WEST: "West load zone — what load in West Texas pays.",
  LZ_AEN: "Austin Energy's load zone.",
  LZ_CPS: "CPS Energy's load zone (San Antonio).",
  LZ_LCRA: "LCRA's load zone (Texas Hill Country).",
  LZ_RAYBN: "Rayburn Country's load zone (northeast Texas).",

  // DC ties — the only doors out of the interconnect.
  DC_E: "East DC tie — to the Eastern Interconnection.",
  DC_L: "Laredo DC tie — to Mexico (CFE).",
  DC_N: "North DC tie — to the Eastern Interconnection via Oklahoma.",
  DC_R: "Railroad DC tie — to Mexico (CFE).",
  DC_S: "Eagle Pass DC tie — to Mexico (CFE).",
};

export function entityNote(node: string): string | undefined {
  return ENTITY_NOTES[node];
}
