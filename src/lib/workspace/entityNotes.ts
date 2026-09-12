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

  // CAISO — the three trading hubs and the utilities' default load
  // aggregation points, out of 2,757 APnodes. OASIS spells every one with
  // the -APND suffix, and so does the data.
  "TH_NP15_GEN-APND": "NP15 hub — Northern California; the benchmark north of Path 15.",
  "TH_SP15_GEN-APND": "SP15 hub — Southern California; the most-traded Western price.",
  "TH_ZP26_GEN-APND": "ZP26 hub — the Central Valley zone between NP15 and SP15.",
  "DLAP_PGAE-APND": "PG&E load aggregation point — what load in Northern California pays.",
  "DLAP_SCE-APND": "SCE load aggregation point — what load in Southern California Edison's area pays.",
  "DLAP_SDGE-APND": "SDG&E load aggregation point — San Diego.",
  "DLAP_VEA-APND": "Valley Electric load aggregation point — southern Nevada.",

  // NYISO — the eleven load zones, quoted by letter as often as by name, and
  // the external proxies. NYISO spells them this way, spaces and dots
  // included, and so does the data. PJM's proxy shares its note with the
  // other operators' PJM interface above.
  WEST: "Zone A — West: Buffalo and the Niagara Frontier.",
  GENESE: "Zone B — Genesee: Rochester.",
  CENTRL: "Zone C — Central: Syracuse.",
  NORTH: "Zone D — North: the St. Lawrence valley and Plattsburgh.",
  "MHK VL": "Zone E — Mohawk Valley: Utica.",
  CAPITL: "Zone F — Capital: Albany.",
  "HUD VL": "Zone G — Hudson Valley.",
  MILLWD: "Zone H — Millwood: northern Westchester.",
  DUNWOD: "Zone I — Dunwoodie: southern Westchester.",
  "N.Y.C.": "Zone J — New York City; the most-watched price in the state.",
  LONGIL: "Zone K — Long Island.",
  "H Q": "Hydro-Québec proxy — the price at NYISO's border with Quebec.",
  NPX: "New England proxy — the price at NYISO's seam with ISO-NE.",
  "O H": "Ontario proxy — the price at NYISO's seam with Ontario's IESO.",
};

export function entityNote(node: string): string | undefined {
  return ENTITY_NOTES[node];
}
