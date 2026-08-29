"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { cx } from "@/components/ui";
import { Thumbnail } from "@/components/workspace/Thumbnail";
import type { AppSummary } from "@/lib/workspace/types";

/**
 * One screen on the shelf.
 *
 * Renaming happens in place on the title rather than behind a menu — a screen
 * arrives called "Hub monitor" and the first thing anyone does is say what
 * theirs is actually for.
 */
export function AppCard({
  app,
  onRename,
}: {
  app: AppSummary;
  onRename: (id: string, name: string) => Promise<void>;
}) {
  const router = useRouter();
  const shared = Boolean(app.sharedBy);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(app.name);
  const input = useRef<HTMLInputElement>(null);

  async function commit() {
    const name = draft.trim();
    setEditing(false);
    if (!name || name === app.name) {
      setDraft(app.name);
      return;
    }
    await onRename(app.id, name);
  }

  return (
    <div className="group overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-line-strong">
      <Link
        href={`/workspace/${app.id}`}
        className="relative block aspect-[16/10] overflow-hidden border-b border-line bg-code"
      >
        <Thumbnail src={`/api/workspace/apps/${app.id}/bundle/${app.updatedAt}`} />
      </Link>

      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0 flex-1">
          {editing && !shared ? (
            <input
              ref={input}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commit();
                if (e.key === "Escape") {
                  setDraft(app.name);
                  setEditing(false);
                }
              }}
              className="w-full rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 text-[14px] font-semibold text-ink outline-none"
            />
          ) : shared ? (
            // Not yours to rename. Fork it and the copy is.
            <span className="block max-w-full truncate text-[14.5px] font-semibold text-ink">
              {app.name}
            </span>
          ) : (
            <button
              onClick={() => setEditing(true)}
              title="Rename"
              className="block max-w-full truncate text-left text-[14.5px] font-semibold text-ink hover:text-accent"
            >
              {app.name}
            </button>
          )}
          <p className="mt-1 font-mono text-[10.5px] text-faint">
            {app.revisions} {app.revisions === 1 ? "change" : "changes"} ·{" "}
            {new Date(app.updatedAt).toLocaleDateString()}
          </p>
          {app.sharedBy && (
            <p className="mt-0.5 truncate font-mono text-[10px] text-info">
              shared by {app.sharedBy.name}
            </p>
          )}
          {app.forkedFrom && (
            <p className="mt-0.5 truncate font-mono text-[10px] text-accent">
              forked from {app.forkedFrom.appName}
            </p>
          )}
        </div>

        <button
          onClick={() => router.push(`/workspace/${app.id}`)}
          className={cx(
            "shrink-0 rounded border border-line px-2 py-1 font-mono text-[10px] tracking-[0.1em] text-faint uppercase transition-colors",
            "group-hover:border-accent-line group-hover:text-accent",
          )}
        >
          Open
        </button>
      </div>
    </div>
  );
}
