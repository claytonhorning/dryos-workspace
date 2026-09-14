"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Empty } from "@/components/ui";
import { ScreenSkeleton } from "@/components/Skeleton";
import { Runner } from "@/components/workspace/Runner";
import type { CommunitySpace } from "@/lib/workspace/communitySpaces";

/**
 * A page of a community workspace, looked at.
 *
 * The publisher's own page, live, edge to edge the way a launched page of your
 * own is — and nothing else: no panel, no edit mode, nothing that writes. The
 * frame loads it by id through the cookie-less bundle route, which already
 * serves any page, and its tiles query through the data route like any other
 * screen's. The copy, when somebody wants one, is the nav's button.
 */
export default function CommunityPage() {
  const params = useParams<{ space: string; page: string }>();
  const [space, setSpace] = useState<CommunitySpace | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    fetch("/api/workspace/community")
      .then((r) => (r.ok ? r.json() : { spaces: [] }))
      .then((d) => {
        if (!live) return;
        setSpace(((d.spaces ?? []) as CommunitySpace[]).find((s) => s.id === params.space) ?? null);
      })
      .catch(() => live && setSpace(null));
    return () => {
      live = false;
    };
  }, [params.space]);

  if (space === undefined) return <ScreenSkeleton withPanel={false} />;

  const page = space?.pages.find((p) => p.id === params.page);
  if (!space || !page) {
    return (
      <div className="mx-auto max-w-[1240px] px-6 py-12">
        <Empty
          title="Not a community workspace"
          body="It may have been taken off the shelf. The Community tab on the workspace page lists what is published."
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-var(--nav-h))] flex-col">
      <div className="relative min-h-0 flex-1">
        <Runner key={`${page.id}:${page.updatedAt}`} appId={page.id} version={page.updatedAt} flush />
      </div>
    </div>
  );
}
