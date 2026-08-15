import type { Cadence, SourceBasis } from "./types";

export function compactNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n >= 10_000_000_000 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

export function usd(n: number, dp = 2): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })}`;
}

export function pct(n: number, dp = 1): string {
  return `${(n * 100).toFixed(dp)}%`;
}

export const CADENCE_LABEL: Record<Cadence, string> = {
  "5min": "Every 5 min",
  "15min": "Every 15 min",
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export const SOURCE_BASIS_LABEL: Record<SourceBasis, string> = {
  iso_public: "ISO public data",
  public_government: "Public government record",
  tos_reviewed: "Public site, terms reviewed",
  licensed: "Licensed for redistribution",
};

/** Renders an SLA window in the largest unit that stays readable. */
export function formatWindow(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 48) {
    const h = minutes / 60;
    return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
  }
  const d = minutes / (60 * 24);
  return `${Number.isInteger(d) ? d : d.toFixed(1)} days`;
}

export function relativeFromIso(iso: string, now = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / (60 * 24))} days ago`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
