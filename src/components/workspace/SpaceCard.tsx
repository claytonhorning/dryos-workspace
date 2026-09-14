"use client";

import Link from "next/link";
import { TrashGlyph } from "@/components/Glyphs";
import { Thumbnail } from "@/components/workspace/Thumbnail";
import type { AppSummary } from "@/lib/workspace/types";

export interface SpaceSummary {
  id: string;
  name: string;
  domain?: string;
  pages: string[];
  updatedAt: number;
  pageList: AppSummary[];
  /** Pages another workspace also lists; deleting this one keeps them. */
  shared?: string[];
}

/**
 * One workspace on the shelf.
 *
 * Shown as its pages rather than as a folder icon: the first page fills the
 * tile, the next two sit beside it as slivers, and the rest are a count. What
 * someone recognises a workspace by is what is in it, and a directory row of
 * names makes you open three to find one.
 *
 * One target, one meaning: open it. Asking someone to choose between launching
 * and editing before they have seen what is inside is asking a question they
 * cannot answer yet — so the card just opens, and the decision to change
 * something is made from inside, where there is something to change.
 */
export function SpaceCard({
  space,
  onDelete,
}: {
  space: SpaceSummary;
  /** Opens the shelf's named-and-counted confirm — deleting a workspace takes
      its pages with it, so this is never fired directly. */
  onDelete?: () => void;
}) {
  const [first, ...rest] = space.pageList;
  const into = first ? `/workspace/${space.id}/${first.id}` : `/workspace/${space.id}`;

  return (
    <Link
      href={into}
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-line-strong"
    >
      <div className="flex aspect-[16/9] gap-px border-b border-line bg-line">
        {first ? (
          <>
            <div className="relative flex-1 overflow-hidden bg-code">
              <Thumbnail src={`/api/workspace/apps/${first.id}/bundle/${first.updatedAt}`} />
            </div>
            {rest.slice(0, 2).length > 0 && (
              <div className="flex w-[24%] flex-col gap-px">
                {rest.slice(0, 2).map((p) => (
                  <div key={p.id} className="relative flex-1 overflow-hidden bg-code">
                    <Thumbnail
                      src={`/api/workspace/apps/${p.id}/bundle/${p.updatedAt}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="grid flex-1 place-items-center bg-code">
            <span className="font-mono text-[10.5px] text-faint">no pages yet</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 p-3">
        <span className="truncate text-[14.5px] font-semibold text-ink transition-colors group-hover:text-accent">
          {space.name}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {space.domain && (
            <span className="rounded border border-line bg-surface-2 px-1.5 py-[1px] font-mono text-[9px] tracking-[0.1em] text-faint uppercase">
              {space.domain === "all" ? "everything" : space.domain}
            </span>
          )}
          <span className="font-mono text-[10px] text-faint">
            {space.pages.length} {space.pages.length === 1 ? "page" : "pages"}
          </span>
          {onDelete && (
            <button
              onClick={(e) => {
                // The whole card is a link; the bin must not also open it.
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}
              aria-label={`Delete ${space.name}`}
              title="Delete this workspace"
              className="rounded border border-transparent p-1 text-faint transition-colors hover:border-fail-line hover:text-fail"
            >
              <TrashGlyph />
            </button>
          )}
        </span>
      </div>
    </Link>
  );
}
