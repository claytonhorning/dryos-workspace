"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Logo";
import { Button, cx } from "@/components/ui";
import type { CommunitySpace } from "@/lib/workspace/communitySpaces";
import { copyCommunitySpace } from "@/lib/workspace/copyCommunity";
import { AccountButton } from "./AccountButton";
import { TimeSelect } from "./TimeSelect";

/**
 * The navbar over a community workspace somebody is looking at.
 *
 * The same shape as `SpaceNav` — the workspace's pages are the chrome — minus
 * everything that changes it: no `+`, no rename, no Edit. The pages are the
 * publisher's, live, so the one act on offer is the copy, and it is in the bar
 * where the owner's Edit would be. Looking comes first: nothing is copied
 * until it is asked for.
 */
export function CommunityNav({ pathname }: { pathname: string }) {
  const router = useRouter();
  const [, , , spaceId, pageId] = pathname.split("/");
  const [space, setSpace] = useState<CommunitySpace | null>(null);
  const [copying, setCopying] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/workspace/community")
      .then((r) => (r.ok ? r.json() : { spaces: [] }))
      .then((d) => {
        if (!live) return;
        setSpace(((d.spaces ?? []) as CommunitySpace[]).find((s) => s.id === spaceId) ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [spaceId]);

  async function copy() {
    if (!space || copying) return;
    setCopying(true);
    setFailed(null);
    try {
      // Left pending through the navigation on purpose: `router.push`
      // returns before the new route renders, and a button back to "Make a
      // copy" while the old screen is still up invites a second press — each
      // of which makes a whole workspace.
      router.push(await copyCommunitySpace(space));
    } catch (e) {
      setFailed((e as Error).message);
      setCopying(false);
    }
  }

  return (
    <div className="flex h-14 items-stretch gap-3 px-4">
      <Link href="/workspace" title="All workspaces" className="flex shrink-0 items-center">
        <Wordmark size={17} />
      </Link>

      <span className="flex items-center text-line-strong">/</span>
      <Link
        href="/workspace"
        title="Community workspaces"
        className="flex shrink-0 items-center text-[13.5px] text-muted transition-colors hover:text-ink"
      >
        Community
      </Link>
      <span className="flex items-center text-line-strong">/</span>

      {space ? (
        <span className="flex shrink-0 items-center text-[13.5px] font-medium text-ink">
          {space.name}
        </span>
      ) : (
        <span className="flex shrink-0 items-center">
          <span className="h-[13px] w-24 animate-pulse rounded bg-surface-2" />
        </span>
      )}

      <div className="dr-scroll -mb-px flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto">
        {space?.pages.map((p) => (
          <Link
            key={p.id}
            href={`/workspace/community/${spaceId}/${p.id}`}
            className={cx(
              "flex shrink-0 items-center border-b-2 px-3 text-[13px] whitespace-nowrap transition-colors",
              p.id === pageId
                ? "border-accent text-ink"
                : "border-transparent text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {p.name}
          </Link>
        ))}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        {failed && <span className="text-[12px] text-fail">{failed}</span>}
        <span
          title="A community workspace: you are looking at the publisher's pages. Copy it to change anything."
          className="rounded border border-line bg-surface-2 px-1.5 py-[1px] font-mono text-[9px] tracking-[0.1em] text-faint uppercase"
        >
          view only
        </span>
        <Button tone="primary" size="sm" disabled={!space || copying} onClick={copy}>
          {copying ? "Copying…" : "Make a copy"}
        </Button>
        <TimeSelect />
        <AccountButton />
      </div>
    </div>
  );
}
