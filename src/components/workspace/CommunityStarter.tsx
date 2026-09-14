"use client";

import { Button } from "@/components/ui";
import { Thumbnail } from "@/components/workspace/Thumbnail";
import type { CommunitySpace } from "@/lib/workspace/communitySpaces";

/**
 * A community workspace, shown as one thing.
 *
 * The tile is its pages running, the same way any workspace card is: the first
 * fills it, the next two are slivers. The pages are the publisher's own, live,
 * so the card is what a copy will hold. Their names are listed under it,
 * because a sliver is too small to read and "what is on the other pages" is
 * the question.
 *
 * Taking it copies the whole set into a workspace of your own, named for it.
 */
export function CommunityStarter({
  space,
  creating,
  busy,
  onStart,
}: {
  space: CommunitySpace;
  /** This one is being copied. */
  creating: boolean;
  /** Something is being copied — this or another — so none can start. */
  busy: boolean;
  onStart: () => void;
}) {
  const [first, ...rest] = space.pages;
  const src = (p: CommunitySpace["pages"][number]) =>
    `/api/workspace/apps/${p.id}/bundle/${p.updatedAt}`;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex aspect-[16/9] gap-px border-b border-line bg-line">
        <div className="relative flex-1 overflow-hidden bg-code">
          {first && <Thumbnail src={src(first)} />}
        </div>
        {rest.length > 0 && (
          <div className="flex w-[24%] flex-col gap-px">
            {rest.slice(0, 2).map((p) => (
              <div key={p.id} className="relative flex-1 overflow-hidden bg-code">
                <Thumbnail src={src(p)} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[14.5px] font-semibold text-ink">{space.name}</span>
          <span className="shrink-0 font-mono text-[10px] text-faint">
            {space.pages.length} {space.pages.length === 1 ? "page" : "pages"}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          {space.pages.map((p) => p.name).join(" · ")} — maintained by Dryos, wired to the
          live feed.
        </p>

        <Button
          tone="primary"
          size="sm"
          className="mt-3 self-start"
          disabled={busy}
          onClick={onStart}
        >
          {creating ? "Copying…" : "Take a copy"}
        </Button>
      </div>
    </div>
  );
}
