import { sortTiers, tierDef } from "@/lib/tiers";
import type { ServingTier } from "@/lib/tiers";
import { cx } from "./ui";

/**
 * Tier is a commitment, not a category, so it reads as a spec line rather than
 * a decorative pill: engine on the left, latency SLO on the right.
 */
const TIER_STYLE: Record<ServingTier, string> = {
  archive: "border-line bg-surface-2 text-muted",
  standard: "border-line-strong bg-surface-3 text-ink",
  realtime: "border-accent-line bg-accent-dim text-accent",
  share: "border-info-line bg-info-dim text-info",
};

export function TierBadge({
  tier,
  size = "md",
  withLatency = false,
}: {
  tier: ServingTier;
  size?: "sm" | "md";
  withLatency?: boolean;
}) {
  const t = tierDef(tier);
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded border font-medium",
        TIER_STYLE[tier],
        size === "sm" ? "px-1.5 py-[2px] text-[10.5px]" : "px-2 py-[3px] text-[11.5px]",
      )}
      title={`${t.engine} · ${t.latencySlo}`}
    >
      {t.name}
      {withLatency && (
        <span className="font-mono text-[10px] opacity-70">{t.latencySlo}</span>
      )}
    </span>
  );
}

/**
 * Every tier this listing offers, cheapest first — the menu the buyer chooses
 * from. One row per tier so the trade-off (latency vs. price) is readable at a
 * glance rather than requiring them to click through each option.
 */
export function TierSpec({
  tiers,
  defaultTier,
}: {
  tiers: ServingTier[];
  defaultTier: ServingTier;
}) {
  return (
    <div className="divide-y divide-line">
      {sortTiers(tiers).map((id) => {
        const t = tierDef(id);
        return (
          <div key={id} className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <TierBadge tier={id} />
              {id === defaultTier && tiers.length > 1 && (
                <span className="font-mono text-[10px] tracking-[0.1em] text-faint uppercase">
                  default
                </span>
              )}
            </div>

            <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-[140px_1fr]">
              <dt className="font-mono text-[11px] tracking-[0.1em] text-faint uppercase">
                Engine
              </dt>
              <dd className="font-mono text-[12.5px] text-ink">{t.engine}</dd>

              <dt className="font-mono text-[11px] tracking-[0.1em] text-faint uppercase">
                Latency SLO
              </dt>
              <dd className="font-mono text-[12.5px] text-ink">{t.latencySlo}</dd>

              <dt className="font-mono text-[11px] tracking-[0.1em] text-faint uppercase">
                Surfaces
              </dt>
              <dd className="flex flex-wrap gap-1.5">
                {t.surfaces.map((s) => (
                  <span
                    key={s}
                    className="rounded border border-line bg-surface-2 px-2 py-[2px] font-mono text-[11.5px] text-muted"
                  >
                    {s}
                  </span>
                ))}
              </dd>

              <dt className="font-mono text-[11px] tracking-[0.1em] text-faint uppercase">
                Why
              </dt>
              <dd className="text-[13px] leading-relaxed text-muted">{t.rationale}</dd>
            </dl>
          </div>
        );
      })}
    </div>
  );
}
