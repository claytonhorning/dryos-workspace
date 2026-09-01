"use client";

import { Button } from "@/components/ui";
import { Thumbnail } from "@/components/workspace/Thumbnail";
import type { Template } from "@/lib/workspace/templates";

/**
 * The community's workspace, shown as one thing.
 *
 * These used to sit on the shelf as three separate cards, which put pages at the
 * same level as workspaces and made the hierarchy read as a lie. They are pages —
 * so they are a workspace, and taking it copies the set.
 *
 * The tile is its pages running, the same way any workspace card is: the first
 * fills it, the rest are slivers. What you are choosing between is what is
 * inside, not three blurbs of roughly equal length.
 */
export function CommunityStarter({
  templates,
  creating,
  onStart,
}: {
  templates: Template[];
  creating: boolean;
  onStart: (...slugs: string[]) => void;
}) {
  const [first, ...rest] = templates;
  if (!first) return null;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex aspect-[16/9] gap-px border-b border-line bg-line">
        <div className="relative flex-1 overflow-hidden bg-code">
          <Thumbnail src={`/api/workspace/templates/${first.slug}/bundle`} />
        </div>
        {rest.length > 0 && (
          <div className="flex w-[24%] flex-col gap-px">
            {rest.slice(0, 2).map((t) => (
              <div key={t.slug} className="relative flex-1 overflow-hidden bg-code">
                <Thumbnail src={`/api/workspace/templates/${t.slug}/bundle`} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[14.5px] font-semibold text-ink">
            ERCOT starters
          </span>
          <span className="shrink-0 font-mono text-[10px] text-faint">
            {templates.length} pages
          </span>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          {templates.map((t) => t.name).join(" · ")} — maintained by{" "}
          {first.author}, wired to the live feed.
        </p>

        <Button
          tone="primary"
          size="sm"
          className="mt-3 self-start"
          disabled={creating}
          onClick={() => onStart(...templates.map((t) => t.slug))}
        >
          {creating ? "Copying…" : "Take a copy"}
        </Button>
      </div>
    </div>
  );
}
