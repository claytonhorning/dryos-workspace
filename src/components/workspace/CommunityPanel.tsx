"use client";

import { cx } from "@/components/ui";
import { SCHEMAS, pathLabel } from "@/lib/workspace/catalog";
import type { AppSummary } from "@/lib/workspace/types";
import type { Template } from "@/lib/workspace/templates";

/**
 * Who is behind what.
 *
 * Two roles, and the difference between them is the shape of the whole product:
 * a **maintainer** is a named expert accountable for one source staying correct,
 * a **builder** makes pages out of what they publish. Everything on this shelf
 * came from one or the other, so the shelf says which — and says it in words
 * rather than leaving two lists to be inferred from.
 *
 * Both counts are derived, never asserted. Maintainers come from the catalogue —
 * a schema with nobody attached is shown as open rather than quietly omitted,
 * because six unclaimed sources is the honest state and it is also the pitch.
 * Builders come from the revision history of the screens that actually exist.
 */
export function CommunityPanel({
  apps,
  templates,
}: {
  apps: AppSummary[];
  templates: Template[];
}) {
  const maintained = SCHEMAS.filter((s) => s.maintainer);
  const open = SCHEMAS.length - maintained.length;

  // Whoever has touched a revision, plus whoever published a starting point.
  const builders = new Map<string, number>();
  for (const a of apps) {
    for (const name of a.authors ?? []) {
      builders.set(name, (builders.get(name) ?? 0) + 1);
    }
  }
  for (const t of templates) {
    builders.set(t.author, (builders.get(t.author) ?? 0) + 1);
  }

  return (
    <div className="w-full rounded-lg border border-line bg-surface p-4 lg:w-[300px]">
      <p className="mb-3 text-[11.5px] leading-relaxed text-muted">
        The data is kept by named experts — one person per source, accountable
        for it staying right. The pages built on top of it come from the
        community.
      </p>

      <Row
        label="Data maintainers"
        note={`${maintained.length} claimed · ${open} open`}
        people={maintained.map((s) => ({
          name: s.maintainer!.name,
          detail: pathLabel(s),
        }))}
        empty="Nobody has claimed a source yet."
      />

      <div className="my-3 border-t border-line" />

      <Row
        label="Community builders"
        note={`${builders.size} ${builders.size === 1 ? "person" : "people"}`}
        people={[...builders.entries()].map(([name, n]) => ({
          name,
          detail: `${n} ${n === 1 ? "page" : "pages"}`,
        }))}
        empty="No pages here yet."
      />

      {open > 0 && (
        <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
          {open} schemas are declared but unclaimed — they serve generated rows until an
          expert takes one on.
        </p>
      )}
    </div>
  );
}

function Row({
  label,
  note,
  people,
  empty,
}: {
  label: string;
  note: string;
  people: { name: string; detail: string }[];
  empty: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
          {label}
        </span>
        <span className="font-mono text-[9.5px] text-muted">{note}</span>
      </div>

      {people.length === 0 ? (
        <p className="mt-2 text-[12px] text-faint">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {people.slice(0, 4).map((p) => (
            <li key={`${p.name}-${p.detail}`} className="flex items-center gap-2">
              <Avatar name={p.name} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{p.name}</span>
              <span className="shrink-0 truncate font-mono text-[9.5px] text-faint">
                {p.detail}
              </span>
            </li>
          ))}
          {people.length > 4 && (
            <li className="font-mono text-[9.5px] text-faint">
              +{people.length - 4} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Initial in a ring. No photos to fetch and nothing to go stale. */
function Avatar({ name }: { name: string }) {
  return (
    <span
      className={cx(
        "grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line-strong",
        "bg-surface-2 font-mono text-[9px] text-muted uppercase",
      )}
    >
      {name.slice(0, 1)}
    </span>
  );
}
