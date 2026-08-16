/**
 * Display time.
 *
 * Rows are stored and served in UTC — that is the contract, and the ISOs'
 * local-time-with-a-DST-flag publishing is exactly what the collector exists to
 * clean up. But UTC is not what anyone reads a dashboard in, so everything
 * shown on screen is converted here.
 *
 * The zone is passed explicitly rather than taken from the browser, so the
 * server render and the client render agree and hydration stays quiet.
 */
export const DISPLAY_TZ = "America/Denver";
export const DISPLAY_TZ_LABEL = "MT";

const hhmm = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const hhmmss = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dayTime = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TZ,
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 14:35 */
export function clock(ms: number): string {
  return hhmm.format(new Date(ms));
}

/** 14:35:21 */
export function clockSeconds(ms: number): string {
  return hhmmss.format(new Date(ms));
}

/** Aug 15, 14:35 */
export function stamp(ms: number): string {
  return dayTime.format(new Date(ms));
}
