import Link from "next/link";
import { sortTiers, tierDef } from "@/lib/tiers";
import { LIVE_SCHEMA, pathLabel, tokenLabel } from "@/lib/workspace/catalog";
import type { Dataset } from "@/lib/types";
import { ButtonLink } from "./ui";

/**
 * What this dataset costs, and the one thing to do with it.
 *
 * This used to collect early-access requests, which made sense when there was
 * nothing to hand anyone. There is now: the workspace runs on this feed today,
 * so the panel points at it rather than at a waiting list. Asking someone to
 * queue for a product they can open in a click is worse than not asking.
 *
 * The tier prices stay because they are the delivery contract. What was added
 * beneath them is the workspace rate — the same number the build box and the
 * usage page quote, so a buyer never meets two prices for one thing.
 */
export function AccessPanel({ dataset }: { dataset: Dataset }) {
  const tiers = sortTiers(dataset.availableTiers);
  const inWorkspace = dataset.slug === LIVE_SCHEMA.dataset;

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
          Pricing
        </div>
        <ul className="mt-3 space-y-3">
          {tiers.map((id) => {
            const t = tierDef(id);
            const price = dataset.pricing[id];
            return (
              <li key={id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-ink">{t.name}</span>
                  {price && (
                    <span className="font-mono text-[13px] text-accent tabular-nums">
                      ${price.unitPriceUsd.toFixed(2)}
                      <span className="text-[11px] text-faint"> / {price.unit}</span>
                    </span>
                  )}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-faint">{t.latencySlo}</div>
                {price && (
                  <div className="mt-0.5 text-[11.5px] text-muted">{price.freeAllowance} free</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {inWorkspace && (
        <div className="border-b border-line px-5 py-4">
          <div className="font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
            In the workspace
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-[13px] text-muted">{pathLabel(LIVE_SCHEMA)}</span>
            <span className="font-mono text-[13px] text-accent tabular-nums">
              {tokenLabel(LIVE_SCHEMA.tokens)}
              <span className="text-[11px] text-faint"> / query</span>
            </span>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-faint">
            Metered per call.{" "}
            <Link href="/usage" className="text-muted underline-offset-2 hover:underline">
              What you have used
            </Link>
            .
          </p>
        </div>
      )}

      <div className="p-5">
        <ButtonLink href="/workspace" tone="primary" size="md" className="w-full">
          {inWorkspace ? "Build on this" : "Open the workspace"}
        </ButtonLink>
        <p className="mt-2.5 text-center text-[12px] text-faint">
          {inWorkspace
            ? "Templates open already running against this feed"
            : "This collector is still in development"}
        </p>
      </div>
    </div>
  );
}
