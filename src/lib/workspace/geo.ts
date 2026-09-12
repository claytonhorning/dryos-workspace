/**
 * Where a settlement point roughly is.
 *
 * The feed has no geography. ERCOT publishes a price against a name — there is
 * no latitude in NP6-788-CD and there is no honest way to derive one from the
 * data, so a map component has nothing to plot unless something supplies it.
 * This is that something.
 *
 * These are APPROXIMATE CENTROIDS, not published locations. A load zone is a
 * region covering thousands of square miles and a trading hub is an average of
 * many nodes, so a single dot is a convenience for reading a map, never a
 * statement about where anything physically sits. Every surface that renders
 * them says so, and a node with no entry here is left off rather than guessed.
 */

export interface Point {
  lon: number;
  lat: number;
  /** Shown in the popup so nobody mistakes a dot for a substation. */
  label: string;
}

export const ERCOT_POINTS: Record<string, Point> = {
  // Trading hubs — the aggregate they represent, placed at its rough middle.
  HB_HOUSTON: { lon: -95.37, lat: 29.76, label: "Houston hub" },
  HB_NORTH: { lon: -96.8, lat: 32.78, label: "North hub" },
  HB_SOUTH: { lon: -98.49, lat: 29.42, label: "South hub" },
  HB_WEST: { lon: -101.86, lat: 32.0, label: "West hub" },
  HB_PAN: { lon: -101.83, lat: 35.22, label: "Panhandle hub" },
  HB_BUSAVG: { lon: -99.0, lat: 31.4, label: "Bus average (statewide)" },
  HB_HUBAVG: { lon: -99.0, lat: 31.0, label: "Hub average (statewide)" },

  // Load zones — regional centroids.
  LZ_HOUSTON: { lon: -95.37, lat: 29.76, label: "Houston zone" },
  LZ_NORTH: { lon: -96.8, lat: 33.2, label: "North zone" },
  LZ_SOUTH: { lon: -98.2, lat: 28.4, label: "South zone" },
  LZ_WEST: { lon: -101.5, lat: 31.8, label: "West zone" },
  LZ_AEN: { lon: -97.74, lat: 30.27, label: "Austin Energy" },
  LZ_CPS: { lon: -98.49, lat: 29.42, label: "CPS Energy · San Antonio" },
  LZ_LCRA: { lon: -98.38, lat: 30.55, label: "LCRA" },
  LZ_RAYBN: { lon: -96.12, lat: 33.55, label: "Rayburn Country" },

  // Weather zones, shared by the mock load and weather schemas.
  COAST: { lon: -95.1, lat: 29.4, label: "Coast weather zone" },
  NORTH_C: { lon: -96.9, lat: 32.9, label: "North Central weather zone" },
  WEST: { lon: -101.5, lat: 31.9, label: "West weather zone" },
  PANHANDLE: { lon: -101.8, lat: 35.2, label: "Panhandle" },
  COASTAL: { lon: -95.5, lat: 28.9, label: "Coastal" },

  // Gas hubs.
  HENRY: { lon: -92.28, lat: 29.9, label: "Henry Hub, Louisiana" },
  WAHA: { lon: -103.1, lat: 31.4, label: "Waha, West Texas" },
  KATY: { lon: -95.82, lat: 29.79, label: "Katy, Texas" },
};

/** Bounds a map should open on to hold everything above. */
export const ERCOT_VIEW = { lon: -99.3, lat: 31.3, zoom: 4.6 };

/**
 * Each operator's footprint as [west, south, east, north] — the same boxes
 * `node_locations.py` checks a manual row against, so a map opens on every
 * place a node could be.
 */
const OPERATOR_BOUNDS: Record<string, [number, number, number, number]> = {
  ERCOT: [-107.0, 25.5, -93.4, 36.7],
  MISO: [-106.5, 28.5, -82.0, 50.5],
  PJM: [-91.5, 34.0, -73.5, 43.5],
  // The RTO from the Texas Panhandle to the Dakotas, and since its western
  // market opened, Colorado, Wyoming and the edge of the Rockies.
  SPP: [-111.0, 31.5, -89.5, 49.0],
  // California, and the Western EIM areas priced beside it from Arizona to
  // British Columbia.
  CAISO: [-125.5, 31.0, -103.0, 52.0],
  // New York State, Long Island's tip included.
  NYISO: [-80.0, 40.4, -71.8, 45.1],
};

/**
 * The box a map of these operators should open on, or null for the ERCOT
 * view. A map centred on Texas puts PJM above the top edge of a 420px tile,
 * so any pins beyond ERCOT's open on the union of their footprints instead.
 */
export function operatorBounds(
  isos: (string | null)[],
): [[number, number], [number, number]] | null {
  const boxes = [...new Set(isos)].map((i) => (i ? OPERATOR_BOUNDS[i] : undefined));
  if (!boxes.length || boxes.some((b) => !b)) return null;
  if (boxes.length === 1 && boxes[0] === OPERATOR_BOUNDS.ERCOT) return null;
  const bs = boxes as [number, number, number, number][];
  return [
    [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1]))],
    [Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))],
  ];
}

/**
 * A grid cell carries its own position.
 *
 * `G_315_1005` is 31.5°N, 100.5°W — tenths of a degree, west positive. Encoding
 * it in the id means a grid can be resized or moved without a lookup table
 * having to grow alongside it, and the mock generator can seed on the id and
 * still produce something spatially coherent.
 */
export function gridPoint(id: string): Point | null {
  const m = /^G_(\d+)_(\d+)$/.exec(id);
  if (!m) return null;
  const lat = Number(m[1]) / 10;
  const lon = -Number(m[2]) / 10;
  return { lon, lat, label: `${lat.toFixed(1)}°N ${Math.abs(lon).toFixed(1)}°W` };
}

/** Every cell of the field, in the order the mock generator produces them. */
export function gridCells(): string[] {
  const out: string[] = [];
  // 1.5° steps across the ERCOT footprint: coarse enough to read as a field,
  // few enough that one query is a handful of kilobytes.
  for (let lat = 26.0; lat <= 36.5; lat += 1.5) {
    for (let lon = -105.0; lon <= -94.0; lon += 1.5) {
      out.push(`G_${Math.round(lat * 10)}_${String(Math.round(-lon * 10)).padStart(4, "0")}`);
    }
  }
  return out;
}

export function pointFor(id: string): Point | null {
  return ERCOT_POINTS[id] ?? gridPoint(id);
}

export function hasGeography(nodes: string[]): boolean {
  return nodes.some((n) => Boolean(pointFor(n)));
}


/**
 * Airports the demo fleet flies between.
 *
 * Real coordinates and real IATA codes, because a route map with invented
 * airports reads as wrong to anyone who knows the region — and everyone who
 * would look at this knows the region.
 */
export const AIRPORTS: Record<string, Point> = {
  DFW: { lon: -97.038, lat: 32.897, label: "Dallas/Fort Worth" },
  IAH: { lon: -95.341, lat: 29.984, label: "Houston Intercontinental" },
  HOU: { lon: -95.279, lat: 29.646, label: "Houston Hobby" },
  AUS: { lon: -97.668, lat: 30.194, label: "Austin-Bergstrom" },
  SAT: { lon: -98.472, lat: 29.534, label: "San Antonio" },
  ELP: { lon: -106.378, lat: 31.807, label: "El Paso" },
  LBB: { lon: -101.823, lat: 33.664, label: "Lubbock" },
  MAF: { lon: -102.202, lat: 31.942, label: "Midland" },
  CRP: { lon: -97.501, lat: 27.774, label: "Corpus Christi" },
  OKC: { lon: -97.601, lat: 35.393, label: "Oklahoma City" },
  ABQ: { lon: -106.609, lat: 35.04, label: "Albuquerque" },
  MSY: { lon: -90.259, lat: 29.993, label: "New Orleans" },
};

/** Bearing from one point to another, in degrees from north. */
export function bearing(a: Point, b: Point): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * toRad) * Math.cos(b.lat * toRad);
  const x =
    Math.cos(a.lat * toRad) * Math.sin(b.lat * toRad) -
    Math.sin(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.cos((b.lon - a.lon) * toRad);
  return (Math.atan2(y, x) / toRad + 360) % 360;
}

/** Great-circle distance in nautical miles — close enough at this scale. */
export function distanceNm(a: Point, b: Point): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 3440.065 * 2 * Math.asin(Math.sqrt(h));
}
