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

  // MISO trading hubs — the eight prices the Midcontinent market quotes.
  // MISO types 424 aggregates as "Hub"; these are the ones people mean.
  "INDIANA.HUB": "Indiana hub — the most-traded MISO hub; the benchmark for the north.",
  "ILLINOIS.HUB": "Illinois hub — Chicago-area price, the other northern benchmark.",
  "MICHIGAN.HUB": "Michigan hub — the Lower Peninsula.",
  "MINN.HUB": "Minnesota hub — the wind-heavy northwest of the footprint.",
  "ARKANSAS.HUB": "Arkansas hub — the north end of MISO South.",
  "LOUISIANA.HUB": "Louisiana hub — the Gulf Coast load pocket.",
  "MS.HUB": "Mississippi hub.",
  "TEXAS.HUB": "Texas hub — MISO's East Texas footprint, not ERCOT.",
  SWPP: "The SPP interface — the price at the seam with the Southwest Power Pool.",
  PJM: "The PJM interface — the price at the eastern seam.",

  // PJM — the hubs and zones people quote, out of 482 aggregate nodes.
  "WESTERN HUB": "Western hub — the most-traded PJM hub; the benchmark for the whole RTO.",
  "EASTERN HUB": "Eastern hub — the Mid-Atlantic price east of the constraints.",
  "AEP-DAYTON HUB": "AEP–Dayton hub — Ohio Valley; the western benchmark.",
  "N ILLINOIS HUB": "Northern Illinois hub — Chicago; ComEd's territory.",
  "DOMINION HUB": "Dominion hub — Virginia and the data-centre load.",
  "NEW JERSEY HUB": "New Jersey hub — the PSEG/JCPL side of the Delaware.",
  "OHIO HUB": "Ohio hub.",
  "CHICAGO HUB": "Chicago hub — the load-weighted Chicago price.",
  "ATSI GEN HUB": "ATSI generation hub — northern Ohio, FirstEnergy's territory.",
  "WEST INT HUB": "West interface hub — the price at PJM's western seam.",
  "PJM-RTO": "The RTO as one node — the load-weighted price of the whole of PJM.",
  COMED: "ComEd zone — Chicago and northern Illinois.",
  PSEG: "PSE&G zone — northern New Jersey.",
  DOM: "Dominion zone — most of Virginia; the fastest-growing load in the RTO.",
  AEP: "AEP zone — Ohio, Indiana, West Virginia, Virginia; the largest by load.",
  BGE: "BGE zone — Baltimore.",
  PEPCO: "Pepco zone — Washington, D.C. and its Maryland suburbs.",
  PECO: "PECO zone — Philadelphia.",
  PPL: "PPL zone — eastern Pennsylvania.",
  ATSI: "ATSI zone — northern Ohio (FirstEnergy).",
  DAY: "Dayton zone.",
  DEOK: "Duke Energy Ohio and Kentucky zone — Cincinnati.",
  DUQ: "Duquesne zone — Pittsburgh.",
  MISO: "The MISO interface — the price at PJM's seam with the Midcontinent.",
  NYIS: "The New York interface — the price at the seam with NYISO.",
  "PJM RTO": "The RTO total — the sum of every zone, or the net of every tie.",
  "PJM MISO": "Net flow across every PJM–MISO tie; a component of PJM RTO.",
};

export function entityNote(node: string): string | undefined {
  return ENTITY_NOTES[node];
}
