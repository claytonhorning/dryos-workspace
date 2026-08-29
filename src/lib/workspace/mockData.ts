import { type Schema, schemaFor } from "./catalog";
import { AIRPORTS, bearing, distanceNm, gridCells, gridPoint } from "./geo";

/**
 * Rows for the schemas that have no collector yet.
 *
 * These exist so a mock stream is something you can actually build against: an
 * app wired to Energy › Gas › Spot renders, refreshes and charts exactly as one
 * wired to the live feed does, and the only difference is the badge on it. A
 * mock that returns nothing teaches you nothing about whether the app works.
 *
 * Deterministic on (entity, interval) rather than random, for one specific
 * reason: an app polling every five minutes must not see history rewrite itself
 * between polls. Seeded this way, yesterday's 14:05 is the same number today.
 */

/** Cheap integer hash — same string in, same number out, stable across restarts. */
function hash(s: string): number {
  let h = 2_166_136_261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return (h >>> 0) / 4_294_967_295;
}

function value(
  spec: { base: number; swing: number; noise: number; floor?: number },
  entity: string,
  at: number,
  key: string,
  step: number,
): number {
  // A daily shape plus a slower multi-day one, so a 24h window has structure and
  // a 7d window does not look like seven copies of the same day.
  const day = (at % 86_400_000) / 86_400_000;
  const diurnal = Math.sin((day - 0.25) * 2 * Math.PI);
  const slow = Math.sin(at / 259_200_000 + hash(entity) * 6.283);

  // A daily or slower stream samples the same point of the diurnal curve every
  // time, which would pin it to one end of the swing forever. Those get the slow
  // shape alone rather than a constant with noise sprinkled on it.
  const shape = step < 43_200_000 ? diurnal * 0.7 + slow * 0.3 : slow;

  /*
    A grid cell varies with where it is, and smoothly.

    Neighbours have to resemble each other or the field renders as static rather
    than as weather — so a cell drops the per-entity random offset that gives
    named places their character, and takes a couple of long wavelengths across
    the footprint instead. The wave drifts with time, which makes it a front
    moving over Texas rather than a fixed pattern. Jitter stays, small, so the
    surface is not glassy.
  */
  const cell = gridPoint(entity);

  if (cell) {
    const drift = at / 4.2e8;
    const spatial =
      Math.sin(cell.lon / 2.6 + drift) * 0.6 +
      Math.cos(cell.lat / 2.1 - drift * 0.6) * 0.4;
    const wobble = (hash(`${entity}:${key}:${at}`) - 0.5) * 2 * spec.noise * 0.35;
    const value = spec.base + spec.swing * (shape * 0.35 + spatial * 0.75) + wobble;
    const bounded = spec.floor === undefined ? value : Math.max(spec.floor, value);
    return Math.round(bounded * 1000) / 1000;
  }

  const offset = (hash(`${entity}:${key}`) - 0.5) * 2;
  const jitter = (hash(`${entity}:${key}:${at}`) - 0.5) * 2 * spec.noise;

  const raw = spec.base * (1 + offset * 0.12) + spec.swing * shape + jitter;
  const out = spec.floor === undefined ? raw : Math.max(spec.floor, raw);
  return Math.round(out * 1000) / 1000;
}

function entities(schema: Schema): string[] {
  // A field's entities are its grid, and the grid knows how to enumerate itself.
  if (schema.field) return gridCells();

  // The sample names are the real ones; anything beyond them is filled out so a
  // schema claiming eight zones can return eight.
  const out = [...schema.entities.sample];
  for (let i = out.length; i < schema.entities.count; i++) {
    out.push(`${schema.path[1].toUpperCase()}_${String(i + 1).padStart(2, "0")}`);
  }
  return out.slice(0, Math.max(schema.entities.count, schema.entities.sample.length));
}

/**
 * A fleet, flying real routes, deterministic in time.
 *
 * Every aircraft is a seeded (origin, destination, departure) triple, so its
 * position is a pure function of the clock — the same second always produces the
 * same fleet, and a client polling every ten seconds watches aeroplanes move
 * rather than teleport.
 *
 * The rows come out in the ADS-B state-vector shape the open networks publish:
 * `icao24`, `callsign`, position, barometric altitude, ground speed, true track
 * and vertical rate. Anything reading this is reading the same fields it would
 * read from a real feed.
 */
const CARRIERS = ["SWA", "AAL", "UAL", "DAL", "ASA", "JBU", "FDX", "UPS"];
const CODES = Object.keys(AIRPORTS);

function flightRows(at: number, count: number): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < count; i++) {
    const seed = `flight:${i}`;
    /*
      A 24-bit ICAO address in the block the FAA actually assigns —
      A00000–ADF7C7 — because that is what a US fleet shows on any tracker, and
      an address outside it reads as wrong to anyone who knows the format.
      Two hashes combined: one alone clusters, and near-identical tails across
      a fleet look invented.
    */
    const icao24 = (
      0xa00000 +
      Math.floor((hash(seed + ":hi") * 0xdf + hash(seed + ":lo") * 0.997) * 0x1000) % 0xdf7c7
    )
      .toString(16)
      .padStart(6, "0");

    const from = AIRPORTS[CODES[Math.floor(hash(seed + ":from") * CODES.length)]];
    let toKey = CODES[Math.floor(hash(seed + ":to") * CODES.length)];
    if (AIRPORTS[toKey] === from) toKey = CODES[(CODES.indexOf(toKey) + 3) % CODES.length];
    const to = AIRPORTS[toKey];

    const nm = distanceNm(from, to);
    const cruiseKt = 400 + hash(seed + ":kt") * 120;
    // Padded for climb and descent, floored so short hops still have a profile.
    const durationMs = Math.max(35, (nm / cruiseKt) * 60 + 22) * 60_000;

    // Each aircraft is somewhere different in its own cycle.
    const phase = ((at + hash(seed + ":phase") * durationMs) % durationMs) / durationMs;

    const lon = from.lon + (to.lon - from.lon) * phase;
    const lat = from.lat + (to.lat - from.lat) * phase;
    const here = { lon, lat, label: "" };

    /*
      A trapezoid: climb for the first fifth, cruise, descend over the last
      quarter. Crude, but it is the shape that makes an altitude colour ramp
      mean something — everything near an airport is low, everything between
      them is high.
    */
    const ceiling = 31_000 + Math.round(hash(seed + ":alt") * 10) * 1_000;
    const altitude =
      phase < 0.2
        ? ceiling * (phase / 0.2)
        : phase > 0.75
          ? ceiling * (1 - (phase - 0.75) / 0.25)
          : ceiling;

    const climbing = phase < 0.2;
    const descending = phase > 0.75;

    rows.push({
      icao24,
      callsign:
        CARRIERS[Math.floor(hash(seed + ":carrier") * CARRIERS.length)] +
        String(100 + Math.floor(hash(seed + ":no") * 8899)),
      origin: Object.keys(AIRPORTS).find((k) => AIRPORTS[k] === from),
      destination: toKey,
      lon: Math.round(lon * 1e5) / 1e5,
      lat: Math.round(lat * 1e5) / 1e5,
      true_track_deg: Math.round(bearing(here, to) * 10) / 10,
      baro_altitude_ft: Math.round(altitude / 25) * 25,
      velocity_kt: Math.round(climbing || descending ? cruiseKt * 0.72 : cruiseKt),
      vertical_rate_fpm: climbing ? 1_900 : descending ? -1_500 : 0,
      on_ground: false,
      interval_start_utc: new Date(at).toISOString(),
      node: icao24,
      node_type: "AIRCRAFT",
      collected_at_utc: new Date(at + 1_000).toISOString(),
    });
  }

  return rows;
}

export function isMockDataset(ref: string | undefined): boolean {
  return schemaFor(ref)?.availability === "mock";
}

/**
 * The same envelope `/api/workspace/data` returns for the live feed, so nothing
 * downstream — shim, app, agent — needs to know which kind it got.
 */
export function mockRows(input: {
  dataset: string;
  node?: string | string[] | undefined;
  start?: string;
  end?: string;
  limit: number;
}): Record<string, unknown>[] {
  const schema = schemaFor(input.dataset);
  if (!schema) return [];

  const step = schema.cadence.seconds * 1000;

  /*
    A moving fleet is a position per reading, not a value per place, so it does
    not go through the per-entity generator below. `limit` walks backwards in
    time the same way, which is what gives a tracker its trails.
  */
  if (schema.motion) {
    const end = input.end ? Date.parse(input.end) : Date.now();
    const latest = Math.floor(end / step) * step;
    const startMs = input.start ? Date.parse(input.start) : latest - 3_600_000;

    const out: Record<string, unknown>[] = [];
    for (let i = 0; i < input.limit; i++) {
      const t = latest - i * step;
      if (Number.isFinite(startMs) && t < startMs) break;
      out.push(...flightRows(t, schema.entities.count));
    }
    return out;
  }
  const available = entities(schema);
  const asked = (Array.isArray(input.node) ? input.node : [input.node]).filter(
    (n): n is string => typeof n === "string" && n.length > 0,
  );
  const nodes = asked.length ? asked : available;

  const end = input.end ? Date.parse(input.end) : Date.now();
  const startMs = input.start ? Date.parse(input.start) : end - 24 * 3_600_000;
  const latest = Math.floor(end / step) * step;

  const rows: Record<string, unknown>[] = [];
  for (const node of nodes) {
    // Newest first, matching the live query, and capped per node the same way.
    for (let i = 0; i < input.limit; i++) {
      const at = latest - i * step;
      if (Number.isFinite(startMs) && at < startMs) break;
      const row: Record<string, unknown> = {
        interval_start_utc: new Date(at).toISOString(),
        node,
        node_type: schema.entities.label.replace(/s$/, "").toUpperCase().replace(/ /g, "_"),
      };
      for (const v of schema.variables) {
        row[v.key] = v.mock ? value(v.mock, node, at, v.key, step) : null;
      }
      row.collected_at_utc = new Date(at + 20_000).toISOString();
      rows.push(row);
    }
  }
  return rows;
}
