/**
 * Relative times, resolved on the server.
 *
 * Apps say `start: "-6h"` because that is what someone means. Resolving it here
 * rather than in the frame keeps every app agreeing on what "now" is, and keeps
 * a wrong clock in someone's browser from quietly shifting their data.
 */
const RELATIVE = /^-(\d+)([mhd])$/;

export function resolveTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = RELATIVE.exec(value.trim());
  if (!m) return value;
  const n = Number(m[1]);
  const ms = m[2] === "m" ? n * 60_000 : m[2] === "h" ? n * 3_600_000 : n * 86_400_000;
  return new Date(Date.now() - ms).toISOString();
}

/**
 * The API returns `2026-08-28 13:45:16+00:00`. Safari and older engines will not
 * parse that reliably, so it becomes proper ISO before an app ever sees it.
 */
export function normaliseRow(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] =
      typeof v === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v)
        ? v.replace(" ", "T")
        : v;
  }
  return out;
}
