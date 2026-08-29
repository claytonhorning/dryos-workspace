"use client";

import { useState } from "react";
import { cx } from "./ui";

export interface Tab {
  id: string;
  label: string;
  /** Small count shown beside the label, e.g. number of schema fields. */
  badge?: string | number;
  content: React.ReactNode;
}

/**
 * All panels render; the inactive ones are hidden rather than unmounted.
 *
 * That matters here because one of the tabs polls the API on an interval —
 * unmounting it on every tab change would restart the poll and drop the
 * countdown's state each time you looked at the schema.
 */
export function Tabs({
  tabs,
  initial,
  action,
}: {
  tabs: Tab[];
  initial?: string;
  /** Rendered at the right end of the tab row — the action for the active rail. */
  action?: React.ReactNode;
}) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);

  return (
    <div>
      <div
        role="tablist"
        className="dr-scroll flex items-center gap-1 overflow-x-auto border-b border-line"
      >
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.id)}
              className={cx(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13.5px] transition-colors",
                on
                  ? "border-accent text-ink"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
              {t.badge !== undefined && (
                <span
                  className={cx(
                    "rounded px-1.5 py-[1px] font-mono text-[10.5px]",
                    on ? "bg-accent-dim text-accent" : "bg-surface-2 text-faint",
                  )}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
        {action && <div className="ml-auto pb-1 pl-3">{action}</div>}
      </div>

      {tabs.map((t) => (
        <div key={t.id} hidden={t.id !== active} className="mt-4">
          {t.content}
        </div>
      ))}
    </div>
  );
}
