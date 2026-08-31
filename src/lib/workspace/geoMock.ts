/**
 * Invented positions for ERCOT settlement points. **Not real. Demonstration only.**
 *
 * ERCOT publishes a price against a name and no coordinate, and there is no
 * honest way to derive one from the data — which is why `geo.ts` places the
 * three dozen aggregates whose rough middles are public knowledge and leaves
 * every other node off the map rather than guessing. That refusal is correct
 * and this file does not change it.
 *
 * What this is for: a map layer of 1,118 nodes cannot be evaluated from fifteen
 * pins. So these coordinates exist to show what the *component* does, and every
 * surface that draws them says MOCK — the badge, the caveat line and the
 * catalogue entry — because a plausible map of invented substations is exactly
 * the artefact somebody screenshots and believes. That is the one failure this
 * codebase treats as unforgivable, and the marking is what makes the trade
 * acceptable rather than the plausibility.
 *
 * Replace it, do not extend it: the real fix is a source of node coordinates,
 * at which point this file is deleted rather than corrected.
 *
 * Positions are deterministic in the node id, so a node lands in the same place
 * on every reload and across every machine — a map whose pins moved between
 * refreshes would be obviously broken, which is a different problem from being
 * invented.
 */

import { ERCOT_POINTS, type Point } from "./geo";

/**
 * Where the nodes cluster. Real load and generation centres, weighted roughly
 * by how much of ERCOT sits in each, so the scatter reads like a grid rather
 * than like confetti — the shape of the cloud is honest even though no single
 * point in it is.
 */
const ANCHORS: { lat: number; lon: number; weight: number; label: string }[] = [
  { lat: 32.8, lon: -97.0, weight: 16, label: "Dallas–Fort Worth" },
  { lat: 29.8, lon: -95.4, weight: 15, label: "Houston" },
  { lat: 31.9, lon: -102.3, weight: 11, label: "Permian Basin" },
  { lat: 29.5, lon: -98.5, weight: 8, label: "San Antonio" },
  { lat: 30.3, lon: -97.7, weight: 7, label: "Austin" },
  { lat: 34.5, lon: -101.5, weight: 7, label: "Panhandle" },
  { lat: 32.0, lon: -100.3, weight: 6, label: "Abilene–San Angelo" },
  { lat: 27.8, lon: -97.4, weight: 6, label: "Coastal Bend" },
  { lat: 26.2, lon: -98.2, weight: 5, label: "Rio Grande Valley" },
  { lat: 31.3, lon: -97.3, weight: 5, label: "Waco–Temple" },
  { lat: 32.3, lon: -95.3, weight: 5, label: "East Texas" },
  { lat: 27.6, lon: -99.5, weight: 3, label: "Laredo" },
  { lat: 29.0, lon: -96.5, weight: 3, label: "Mid-coast" },
  { lat: 33.6, lon: -96.6, weight: 3, label: "Red River" },
];

const TOTAL_WEIGHT = ANCHORS.reduce((n, a) => n + a.weight, 0);

/** FNV-1a, the same one the preview shim seeds its series with. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Three uncorrelated unit values from one id.
 *
 * Salted differently, and that is not cosmetic. The same hash three times gives
 * the same number three times, which would lay every node on one diagonal
 * through its anchor — an invented map that looks like a rendering bug rather
 * than like a caveat, which is the worse of the two ways to be wrong here.
 */
function seeds(id: string): [number, number, number] {
  return [
    hash(id) / 4294967295,
    hash("lat:" + id) / 4294967295,
    hash("lon:" + id) / 4294967295,
  ];
}

/**
 * A position for a node, invented unless we actually know one.
 *
 * A real entry always wins: the hubs and load zones in `geo.ts` are published
 * aggregates placed at their rough middles, and inventing a position for
 * HB_NORTH when its approximate centroid is known would be worse data, not
 * more of it.
 */
export function mockNodePoint(id: string): Point {
  const real = ERCOT_POINTS[id];
  if (real) return real;

  const [pick, jLat, jLon] = seeds(id);
  let cut = pick * TOTAL_WEIGHT;
  let anchor = ANCHORS[ANCHORS.length - 1];
  for (const a of ANCHORS) {
    cut -= a.weight;
    if (cut <= 0) {
      anchor = a;
      break;
    }
  }
  // Roughly a 220 km box around the anchor. Tighter read as discrete blobs
  // with empty ground between them, which looks like a rendering artefact
  // rather than like a grid.
  return {
    lat: Number((anchor.lat + (jLat - 0.5) * 2.0).toFixed(4)),
    lon: Number((anchor.lon + (jLon - 0.5) * 2.4).toFixed(4)),
    label: `${id} · invented position near ${anchor.label}`,
  };
}

/**
 * The same function, as source, for the generated map to carry.
 *
 * A thousand baked coordinates would be sixty kilobytes of literal in every
 * page that draws this layer, and would go stale the moment ERCOT added a node.
 * The generator travels instead — the same reasoning as a grid cell id encoding
 * its own position, and the same consequence: a node the source adds tomorrow
 * appears without anything being recomposed.
 */
export const MOCK_POINT_SOURCE = `
  // INVENTED POSITIONS — see lib/workspace/geoMock.ts. Marked mock everywhere
  // they are drawn, because a plausible map of substations nobody published is
  // the one artefact worth refusing to make by accident.
  const MOCK_ANCHORS = ${JSON.stringify(ANCHORS.map((a) => [a.lat, a.lon, a.weight]))};
  const MOCK_TOTAL = ${TOTAL_WEIGHT};
  function mockHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
  }
  function mockPoint(id) {
    if (POINTS[id]) return POINTS[id];
    const pick = mockHash(id), jLat = mockHash("lat:" + id), jLon = mockHash("lon:" + id);
    let cut = pick * MOCK_TOTAL, a = MOCK_ANCHORS[MOCK_ANCHORS.length - 1];
    for (const c of MOCK_ANCHORS) { cut -= c[2]; if (cut <= 0) { a = c; break; } }
    return { lat: a[0] + (jLat - 0.5) * 2.0, lon: a[1] + (jLon - 0.5) * 2.4, label: id };
  }
`;
