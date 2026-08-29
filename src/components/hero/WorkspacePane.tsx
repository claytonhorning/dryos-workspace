"use client";

import { LIVE_SCHEMA, pathLabel, tokenLabel } from "@/lib/workspace/catalog";

/**
 * The hero panel: the workspace, actually running.
 *
 * It used to be a code snippet, which was the right evidence for a different
 * offer — back when the thing being sold was an integration. What is being sold
 * now is the workspace, so the panel is the workspace: a real template, compiled
 * and served through the same sandboxed route the product uses.
 *
 * It runs on sample rows rather than the live feed, and says so. A landing page
 * cannot depend on a collector being healthy to render, and it should not bill a
 * query for every visitor either. That is also why there is no LIVE badge here:
 * the badge means "these numbers came from the source", and on this panel they
 * did not.
 *
 * The strip underneath is the real build box with its real placeholder, not a
 * scripted demo instruction. Nothing here claims a change was made that wasn't —
 * a landing page that stages an interaction the product cannot reproduce is a
 * promise the first click breaks.
 */
export function WorkspacePane() {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-2xl shadow-black/40">
      {/* ── Chrome ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
          Hub monitor
        </span>
        <span className="ml-auto truncate text-[10.5px] text-muted">
          {pathLabel(LIVE_SCHEMA)}
        </span>
      </div>

      {/* ── The app ─────────────────────────────────────────────────── */}
      <div className="relative h-[268px] overflow-hidden bg-code sm:h-[300px]">
        <iframe
          src="/api/workspace/templates/hub-monitor/bundle?preview=1"
          sandbox="allow-scripts"
          title="A workspace app running against the live ERCOT feed"
          tabIndex={-1}
          // Rendered wide and scaled down: the table needs the width to keep its
          // columns, and reflowing it into the pane would show a shape the real
          // workspace never renders.
          className="pointer-events-none absolute top-0 left-0 h-[152%] w-[152%] origin-top-left scale-[0.658] border-0"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface to-transparent" />
        <span className="pointer-events-none absolute top-2 right-2 rounded-sm border border-dashed border-info-line bg-bg/80 px-1.5 py-px font-mono text-[9px] tracking-[0.1em] text-info uppercase backdrop-blur">
          Sample data
        </span>
      </div>

      {/* ── The build box ───────────────────────────────────────────── */}
      <div className="border-t border-line px-3 py-2.5">
        <div className="font-mono text-[9.5px] tracking-[0.14em] text-faint uppercase">Build</div>
        <p className="mt-1.5 flex items-center gap-1 text-[13px] text-faint">
          Add a column for the spread to HB_NORTH…
          <span className="dr-pulse inline-block h-[13px] w-px bg-accent" aria-hidden />
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line px-3 py-2 font-mono text-[9.5px] text-faint">
        <span>live, updates {LIVE_SCHEMA.cadence.label}</span>
        <span className="text-line-strong">·</span>
        <span className="text-muted">{tokenLabel(LIVE_SCHEMA.tokens)} per query</span>
        <span className="text-line-strong">·</span>
        <span>mock schemas free</span>
      </div>
    </div>
  );
}
