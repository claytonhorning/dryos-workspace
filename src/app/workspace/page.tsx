"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Empty } from "@/components/ui";
import { CardGridSkeleton } from "@/components/Skeleton";
import { Tabs } from "@/components/Tabs";
import { SpaceCard, type SpaceSummary } from "@/components/workspace/SpaceCard";
import { CommunityPanel } from "@/components/workspace/CommunityPanel";
import { AvailabilityBadge } from "@/components/workspace/DataChip";
import { CommunityStarter } from "@/components/workspace/CommunityStarter";
import {
  LIVE_SCHEMA,
  SCHEMAS,
  pathLabel,
  tokenLabel,
} from "@/lib/workspace/catalog";
import type { Template } from "@/lib/workspace/templates";

const mockCount = SCHEMAS.filter((s) => s.availability === "mock").length;

/**
 * The workspace: what you have built, what you can start from, what reached you.
 *
 * Three shelves rather than one scrolling page, because they answer different
 * questions — "where was I", "what could I make", "what did someone send me" —
 * and stacking them buries whichever one you did not come for. Every tile is a
 * live thumbnail, so choosing between them is a visual decision in all three.
 */
export default function WorkspacePage() {
  const router = useRouter();
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [creating, setCreating] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/workspace/spaces")
      .then((r) => r.json())
      .then((d) => setSpaces(d.spaces ?? []))
      .catch(() => {});
    fetch("/api/workspace/apps")
      .then((r) => r.json())
      .then((d) => {
        setTemplates(d.templates);
        setLoaded(true);
      });
  }, []);

  /** An empty workspace with one empty page, opened straight away. */
  async function newSpace() {
    await create("compose");
  }

  /**
   * Take a copy of a community workspace.
   *
   * `templates` are pages, and a page cannot live on its own any more — so
   * taking one makes the workspace it needs and lands you in it, which is where
   * you were going anyway. Passing several copies the whole set into one.
   */
  async function create(...slugs: string[]) {
    setCreating(slugs[0] ?? "all");
    const made = await fetch("/api/workspace/spaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: slugs.length > 1 ? "ERCOT starters" : "New workspace",
      }),
    }).then((r) => r.json());

    let first: string | undefined;
    for (const template of slugs) {
      const { page } = await fetch(
        `/api/workspace/spaces/${made.space.id}/pages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ template }),
        },
      ).then((r) => r.json());
      first ??= page?.id;
    }

    router.push(`/workspace/${made.space.id}/${first}`);
  }

  const grid = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-12">
      <header className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-[11px] tracking-[0.16em] text-faint uppercase">
              Workspace
            </p>
            <span className="text-[12.5px] text-muted">
              {pathLabel(LIVE_SCHEMA)}
            </span>
            <AvailabilityBadge availability="live" />
          </div>
          <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.02em] text-ink">
            Your workspaces, on live data
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Every screen here is wired to the live feed —{" "}
            {LIVE_SCHEMA.entities.count.toLocaleString()}{" "}
            {LIVE_SCHEMA.entities.label ?? "entities"}, repriced {LIVE_SCHEMA.cadence.label}{" "}
            at {tokenLabel(LIVE_SCHEMA.tokens)} a query. A workspace is a set of
            pages; a page is components you arrange the way you want them.
          </p>
          {/*
          The rest of the tree, said plainly. Someone should learn what is real
          here rather than in the middle of building on it.
        */}
          <p className="mt-2 text-[13.5px] leading-relaxed text-faint">
            {mockCount} more {mockCount === 1 ? "schema is" : "schemas are"}{" "}
            declared and marked mock — same shape, generated numbers, so you can
            build against them before the collector exists.
          </p>
        </div>

        {/*
          Who is behind the shelf, beside the shelf. Both halves of the product
          are people — someone keeps a feed correct, someone else builds on it —
          and a workspace that never says whose work you are standing on reads
          like a folder of files.
        */}
        <CommunityPanel
          apps={spaces.flatMap((sp) => sp.pageList)}
          templates={templates}
        />
      </header>

      {/*
        Community leads, always: what other people have published is the reason
        to come back, and your own workspaces are one click away when you already
        know what is in them. Still held back until the list arrives, because `Tabs`
        picks its initial tab at mount and the badges would flash empty.
      */}
      <div className="mt-10">
        {!loaded ? (
          <div className="mt-4">
            <CardGridSkeleton count={3} ratio="aspect-[16/9]" />
          </div>
        ) : (
          <Tabs
            action={
              <Button
                tone="primary"
                size="sm"
                disabled={creating !== null}
                onClick={newSpace}
              >
                {creating === "compose" ? "Creating…" : "Create new"}
              </Button>
            }
            initial="mine"
            tabs={[
              {
                id: "mine",
                label: "My workspaces",
                badge: spaces.length,
                content:
                  spaces.length > 0 ? (
                    <div className={grid}>
                      {spaces.map((sp) => (
                        <SpaceCard key={sp.id} space={sp} />
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title="No workspaces yet"
                      body="A workspace is a set of pages you flip between. Press Create new for an empty one, or start from something in Community."
                    />
                  ),
              },
              {
                id: "community",
                label: "Community workspaces",
                badge: 1,
                content: (
                  <div className={grid}>
                    <CommunityStarter
                      templates={templates}
                      creating={creating !== null}
                      onStart={create}
                    />
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
