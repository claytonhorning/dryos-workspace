"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Empty } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { CardGridSkeleton } from "@/components/Skeleton";
import { UsageDock } from "@/components/workspace/UsageDock";
import { Thumbnail } from "@/components/workspace/Thumbnail";
import type { AppSummary } from "@/lib/workspace/types";
import { useSelectOnMount } from "@/lib/useSelectOnMount";

/**
 * A workspace, shown as what it contains.
 *
 * The tabs in the navbar are for moving between pages you already know; this is
 * for seeing what you have. So it is thumbnails rather than a list — a page is
 * recognised by its shape long before its name, and a column of names makes you
 * open three to find one.
 *
 * Two ways out of every tile, because they are different intentions: open it to
 * read, or edit it to change. Sending both through the same click would make the
 * common one — looking — carry the cost of the rare one.
 */
interface Space {
  id: string;
  name: string;
  pageList: AppSummary[];
}

export function SpaceView({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const [space, setSpace] = useState<Space | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const nameField = useSelectOnMount();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch(`/api/workspace/spaces/${spaceId}`)
      .then((r) => r.json())
      .then((d) => d.space && setSpace(d.space))
      .catch(() => {});
  }, [spaceId]);

  async function addPage() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/workspace/spaces/${spaceId}/pages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "New page" }),
      });
      const { page } = await res.json();
      // Straight into edit mode: a page that has just been created is empty,
      // and nobody makes one in order to look at nothing.
      if (page) router.push(`/workspace/${spaceId}/${page.id}?edit=1`);
    } finally {
      setCreating(false);
    }
  }

  /**
   * Remove a page, and its history with it.
   *
   * The page is deleted outright rather than unfiled: a page belongs to exactly
   * one workspace, so "take it out" and "delete it" are the same act, and
   * pretending otherwise would leave something nothing links to.
   */
  async function deletePage(id: string) {
    await fetch(`/api/workspace/apps/${id}`, { method: "DELETE" });
    setSpace((prev) =>
      prev
        ? { ...prev, pageList: prev.pageList.filter((p) => p.id !== id) }
        : prev,
    );
  }

  async function deleteSpace() {
    setDeleting(true);
    try {
      await fetch(`/api/workspace/spaces/${spaceId}`, { method: "DELETE" });
      router.push("/workspace");
    } finally {
      setDeleting(false);
    }
  }

  async function rename() {
    setEditing(false);
    const name = draft.trim();
    if (!space || !name || name === space.name) return;
    setSpace({ ...space, name });
    await fetch(`/api/workspace/spaces/${spaceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-10">
      <Link
        href="/workspace"
        className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase hover:text-ink"
      >
        ← All workspaces
      </Link>

      <div className="mt-1 flex flex-wrap items-center gap-3">
        {editing ? (
          <input
            ref={nameField}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === "Enter") void rename();
              if (e.key === "Escape") setEditing(false);
            }}
            size={Math.max(10, draft.length)}
            className="rounded border border-line-strong bg-surface-2 px-2 py-0.5 text-[26px] font-semibold tracking-[-0.02em] text-ink outline-none"
          />
        ) : space ? (
          <button
            onClick={() => {
              setDraft(space.name);
              setEditing(true);
            }}
            title="Click to rename this workspace"
            className="rounded border border-transparent px-2 py-0.5 text-[26px] font-semibold tracking-[-0.02em] text-ink transition-colors hover:border-line hover:bg-surface-2"
          >
            {space.name}
          </button>
        ) : (
          // Sized like the heading it replaces, so the row does not jump.
          <span className="my-1 block h-8 w-64 animate-pulse rounded bg-surface-2" />
        )}

        <span className="font-mono text-[10.5px] text-faint">
          {space
            ? `${space.pageList.length} ${space.pageList.length === 1 ? "page" : "pages"}`
            : ""}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            tone="danger"
            onClick={() => setConfirmDelete(true)}
          >
            Delete workspace
          </Button>
          <Button
            tone="primary"
            size="sm"
            disabled={creating}
            onClick={addPage}
          >
            {creating ? "Creating…" : "New page"}
          </Button>
        </div>
      </div>

      {!space ? (
        <div className="mt-8">
          <CardGridSkeleton count={6} />
        </div>
      ) : space.pageList.length === 0 ? (
        <div className="mt-8">
          <Empty
            title="No pages yet"
            body="A page is a screen of components wired to live data. Press New page and it opens empty, ready to arrange."
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {space.pageList.map((p) => (
            <PageCard
              key={p.id}
              spaceId={spaceId}
              page={p}
              onDelete={() => deletePage(p.id)}
            />
          ))}
        </div>
      )}

      <UsageDock spaceId={spaceId} name={space?.name} />

      {/*
        Named, counted and irreversible. A workspace's pages exist nowhere else,
        so the number of them is the part of this sentence that matters — and it
        is the part someone will check before they press the red button.
      */}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete “${space?.name ?? ""}”?`}
        subtitle="This cannot be undone."
        footer={
          <>
            <Button tone="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button tone="danger" disabled={deleting} onClick={deleteSpace}>
              {deleting ? "Deleting…" : "Delete workspace"}
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-muted">
          {space?.pageList.length === 0 ? (
            "This workspace is empty."
          ) : (
            <>
              Its{" "}
              <strong className="text-ink">
                {space?.pageList.length}{" "}
                {space?.pageList.length === 1 ? "page" : "pages"}
              </strong>{" "}
              go with it, along with every change recorded on them:
            </>
          )}
        </p>
        {space && space.pageList.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1">
            {space.pageList.map((p) => (
              <li key={p.id} className="font-mono text-[12px] text-faint">
                · {p.name}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}

function PageCard({
  spaceId,
  page,
  onDelete,
}: {
  spaceId: string;
  page: AppSummary;
  onDelete: () => void;
}) {
  // Two steps rather than a dialog: the blast radius is one page, and the
  // confirmation belongs on the thing being deleted rather than over it.
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="group overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-line-strong">
      <Link
        href={`/workspace/${spaceId}/${page.id}`}
        className="relative block aspect-[16/10] overflow-hidden border-b border-line bg-code"
      >
        <Thumbnail
          src={`/api/workspace/apps/${page.id}/bundle/${page.updatedAt}`}
        />
      </Link>

      <div className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <Link
            href={`/workspace/${spaceId}/${page.id}`}
            className="block truncate text-[14px] font-medium text-ink hover:text-accent"
          >
            {page.name}
          </Link>
          <p className="mt-0.5 font-mono text-[10px] text-faint">
            {page.revisions} {page.revisions === 1 ? "change" : "changes"} ·{" "}
            {new Date(page.updatedAt).toLocaleDateString()}
          </p>
        </div>

        {confirming ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={onDelete}
              className="rounded border border-fail-line bg-fail-dim px-2 py-1 font-mono text-[10px] tracking-[0.1em] text-fail uppercase"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="font-mono text-[10px] text-faint hover:text-ink"
            >
              cancel
            </button>
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5">
            <Link
              href={`/workspace/${spaceId}/${page.id}?edit=1`}
              aria-label={`Edit ${page.name}`}
              title="Edit this page"
              className="rounded border border-transparent p-1.5 text-faint transition-colors hover:border-accent-line hover:text-accent"
            >
              <PencilGlyph />
            </Link>
            <button
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${page.name}`}
              title="Delete this page"
              className="rounded border border-transparent p-1.5 text-faint transition-colors hover:border-fail-line hover:text-fail"
            >
              <TrashGlyph />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

/** A bin, drawn rather than lettered — an × means "close" everywhere else here. */
function TrashGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.5 3.5h9M5.5 3.5V2.4a.9.9 0 0 1 .9-.9h1.2a.9.9 0 0 1 .9.9v1.1M3.6 3.5l.5 7.6a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.5-7.6"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 6v3.5M8 6v3.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A pencil. Paired with the bin beside it, so both actions read as icons. */
function PencilGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M9.4 2.1a1.3 1.3 0 0 1 1.9 0l.6.6a1.3 1.3 0 0 1 0 1.9L5.3 11.2l-3 .5.5-3z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M8.6 3l2.4 2.4"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
