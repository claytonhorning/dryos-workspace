"use client";

import Link from "next/link";
import { Thumbnail } from "@/components/workspace/Thumbnail";
import type { CommunitySpace } from "@/lib/workspace/communitySpaces";

/**
 * A community workspace on the shelf.
 *
 * One target with one meaning, the same as `SpaceCard`: open it. It opens
 * the publisher's pages to look at, and the copy is offered from inside,
 * once somebody has seen what they would be copying — a card that copied on
 * a click made a workspace nobody had looked into.
 *
 * The tile is its pages running: the first fills it, the next two are
 * slivers. Their names are listed under it, because a sliver is too small to
 * read and "what is on the other pages" is the question.
 */
export function CommunityStarter({ space }: { space: CommunitySpace }) {
  const [first, ...rest] = space.pages;
  const src = (p: CommunitySpace["pages"][number]) =>
    `/api/workspace/apps/${p.id}/bundle/${p.updatedAt}`;
  const into = first ? `/workspace/community/${space.id}/${first.id}` : "/workspace";

  return (
    <Link
      href={into}
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-line-strong"
    >
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
          <span className="truncate text-[14.5px] font-semibold text-ink transition-colors group-hover:text-accent">
            {space.name}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-faint">
            {space.pages.length} {space.pages.length === 1 ? "page" : "pages"}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          {space.pages.map((p) => p.name).join(" · ")} — maintained by Dryos, wired to the
          live feed.
        </p>
      </div>
    </Link>
  );
}
