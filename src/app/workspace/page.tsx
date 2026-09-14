"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Empty } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { CardGridSkeleton } from "@/components/Skeleton";
import { Tabs } from "@/components/Tabs";
import { SpaceCard, type SpaceSummary } from "@/components/workspace/SpaceCard";
import { DeleteSpaceBody } from "@/components/workspace/DeleteSpaceBody";
import { CommunityPanel } from "@/components/workspace/CommunityPanel";
import { CommunityStarter } from "@/components/workspace/CommunityStarter";
import { ALL, SUBJECTS, domainWord, useDomain } from "@/lib/domain";
import type { CommunitySpace } from "@/lib/workspace/communitySpaces";

/** What the pages route is asked for, one call per page of a new workspace. */
type PageBody = { template: string };

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
  /** Every workspace Dryos has published, whatever the domain. */
  const [community, setCommunity] = useState<CommunitySpace[]>([]);
  /** What is being made — "compose", the one thing the shelf creates. */
  const [creating, setCreating] = useState<string | null>(null);
  const { domain, setDomain, ready } = useDomain();
  const [loaded, setLoaded] = useState(false);
  /** The workspace the bin was pressed on, while its dialog is up. */
  const [condemned, setCondemned] = useState<SpaceSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    // A failed community read is an empty tab, never an error on the shelf:
    // your own workspaces are what somebody came back for.
    Promise.all([
      fetch("/api/workspace/spaces")
        .then((r) => r.json())
        .then((d) => setSpaces(d.spaces ?? []))
        .catch(() => {}),
      fetch("/api/workspace/community")
        .then((r) => (r.ok ? r.json() : { spaces: [] }))
        .then((d) => setCommunity(d.spaces ?? []))
        .catch(() => {}),
    ]).finally(() => setLoaded(true));
  }, []);

  /**
   * An empty workspace with one empty page, opened straight away. It is
   * about whatever the sidebar says — that is the frame you are already in —
   * and the name is asked for next, in the nav, where the subject is the one
   * thing already in your head.
   */
  async function newSpace() {
    await make("compose", "New workspace", domain ?? undefined, [{ template: "compose" }]);
  }

  /**
   * Delete a workspace, and its pages with it — same act as the workspace's
   * own page, but the shelf stays put, so this one clears its own busy state
   * and takes the card out of the grid rather than navigating away.
   */
  async function deleteSpace() {
    if (!condemned) return;
    setDeleting(true);
    try {
      await fetch(`/api/workspace/spaces/${condemned.id}`, { method: "DELETE" });
      setSpaces((prev) => prev.filter((sp) => sp.id !== condemned.id));
      setCondemned(null);
    } finally {
      setDeleting(false);
    }
  }

  async function make(key: string, name: string, domain: string | undefined, pages: PageBody[]) {
    setCreating(key);
    const made = await fetch("/api/workspace/spaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, domain }),
    }).then((r) => r.json());

    let first: string | undefined;
    for (const body of pages) {
      const { page } = await fetch(
        `/api/workspace/spaces/${made.space.id}/pages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ).then((r) => r.json());
      first ??= page?.id;
    }

    // A new workspace's one page is empty, and nobody makes one in order to
    // look at nothing — so it opens in edit mode, the same way a new page
    // does. A blank one also arrives with its name armed in the nav (`?name=1`) —
    // the subject is the one thing already in your head when you press
    // Create, and "New workspace" names nothing. Typing over the selected
    // default or ignoring it are both one gesture.
    const blank = key === "compose";
    router.push(
      `/workspace/${made.space.id}/${first}${blank ? "?edit=1&name=1" : ""}`,
    );
  }

  const grid = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

  /*
    The shelf is scoped to the sidebar's domain. A workspace made before the
    choice existed has none, and belongs everywhere rather than nowhere.
  */
  const visible = spaces.filter(
    (sp) => domain === ALL || !sp.domain || sp.domain === domain,
  );
  const published = community.filter(
    (ws) => domain === ALL || !ws.domain || ws.domain === domain,
  );
  const word = domainWord(domain);

  /*
    Nothing is known until the domain is: the shelf's title, its list, the
    panel's people and what Create makes all read from it. So the first visit
    asks, full width, and the answer goes to the sidebar where it stays.
  */
  if (ready && !domain) {
    return (
      <div className="mx-auto max-w-[1240px] px-6 py-12">
        <p className="font-mono text-[11px] tracking-[0.16em] text-faint uppercase">
          Workspace
        </p>
        <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.02em] text-ink">
          What are you working on?
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
          Pick a domain and the workspace opens on it: its streams in the
          explorer, its maintainers on the shelf, your workspaces about it.
          Change it any time from the sidebar.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SUBJECTS.map((sub) => (
            <button
              key={sub.id}
              type="button"
              disabled={sub.next}
              onClick={() => setDomain(sub.id)}
              className={
                sub.next
                  ? "rounded-lg border border-dashed border-line bg-surface/50 p-4 text-left opacity-70"
                  : "rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:border-accent-line hover:bg-accent-dim/40"
              }
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[16px] font-semibold text-ink">{sub.label}</span>
                {sub.next && (
                  <span className="rounded border border-line bg-surface-2 px-1.5 py-[1px] font-mono text-[9px] tracking-[0.12em] text-faint uppercase">
                    next
                  </span>
                )}
              </span>
              <span className="mt-1.5 block text-[12.5px] leading-relaxed text-muted">
                {sub.blurb}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-12">
      <header className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] tracking-[0.16em] text-faint uppercase">
            Workspace
          </p>
          <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.02em] text-ink">
            {word ? `Your ${word} workspaces` : "Your workspaces"}
          </h1>
          {/*
            What one is, in the words someone arriving needs: a dashboard of
            their own, on their data, that they can start from someone else's.
            Nothing here about the feed being live — everything on this site
            is, and a claim that is true of everything says nothing.
          */}
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            A workspace is a set of dashboards about one subject — the streams
            you choose, arranged the way you want them, as many pages as it
            takes. Start one empty and say what it is about, or take a copy of
            a community workspace and make it yours.
          </p>
        </div>

        {/*
          Who is behind the shelf, beside the shelf. Both halves of the product
          are people — someone keeps a feed correct, someone else builds on it —
          and a workspace that never says whose work you are standing on reads
          like a folder of files.
        */}
        <CommunityPanel domain={domain ?? undefined} />
      </header>

      {/*
        Community leads, always: what other people have published is the reason
        to come back, and your own workspaces are one click away when you already
        know what is in them. Still held back until the list arrives, because `Tabs`
        picks its initial tab at mount and the badges would flash empty.
      */}
      <div className="mt-10">
        {!loaded || !ready ? (
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
                label: word ? `My ${word} workspaces` : "My workspaces",
                badge: visible.length,
                content:
                  visible.length > 0 ? (
                    <div className={grid}>
                      {visible.map((sp) => (
                        <SpaceCard
                          key={sp.id}
                          space={sp}
                          onDelete={() => setCondemned(sp)}
                        />
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title={word ? `No ${word} workspaces yet` : "No workspaces yet"}
                      body="A workspace is a set of pages you flip between. Press Create new for an empty one, or start from something in Community."
                    />
                  ),
              },
              {
                id: "community",
                label: "Community workspaces",
                badge: published.length,
                content:
                  published.length > 0 ? (
                    <div className={grid}>
                      {published.map((ws) => (
                        <CommunityStarter key={ws.id} space={ws} />
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title={`No ${word} workspaces published yet`}
                      body="What the community publishes for this domain will show up here."
                    />
                  ),
              },
            ]}
          />
        )}
      </div>

      {/*
        Named, counted and irreversible — the same dialog the workspace's own
        page shows, because the same red button deserves the same sentence.
        The count and the list are the part someone checks before pressing it.
      */}
      <Modal
        open={condemned !== null}
        onClose={() => setCondemned(null)}
        title={`Delete “${condemned?.name ?? ""}”?`}
        subtitle="This cannot be undone."
        footer={
          <>
            <Button tone="ghost" onClick={() => setCondemned(null)}>
              Cancel
            </Button>
            <Button tone="danger" disabled={deleting} onClick={deleteSpace}>
              {deleting ? "Deleting…" : "Delete workspace"}
            </Button>
          </>
        }
      >
        {condemned && (
          <DeleteSpaceBody pageList={condemned.pageList} shared={condemned.shared} />
        )}
      </Modal>
    </div>
  );
}
