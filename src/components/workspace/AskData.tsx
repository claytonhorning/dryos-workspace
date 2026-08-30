"use client";

import { useState } from "react";
import { cx } from "@/components/ui";
import { AttachedChip } from "@/components/workspace/DataChip";
import type { DataRef } from "@/lib/workspace/catalog";
import { readNdjson } from "@/lib/workspace/ndjson";

/**
 * The data guide: describe what you want, get references back to select.
 *
 * This is the one thing browsing cannot do — look inside a schema at the
 * actual entities and answer "which node is the Austin one?" in a sentence.
 * The agent behind it (`dataAgent.ts`) was built for exactly this and then
 * sat unreachable when the whole-page chat was removed; it lives as the AI
 * mode of the explorer's search bar now — the same intent as searching, one
 * level deeper. Every result is the same `DataRef` a click in the explorer
 * produces — clicking one selects it, nothing is pasted as text.
 */
export function AskData({
  chosen,
  onPick,
}: {
  /** Selection keys, `${snippet}::${label}`, so results show what is taken. */
  chosen: Set<string>;
  onPick: (ref: DataRef) => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [narration, setNarration] = useState<string | null>(null);
  const [found, setFound] = useState<DataRef[]>([]);

  async function ask() {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    setNarration(null);
    setFound([]);
    try {
      const res = await fetch("/api/workspace/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) {
        setNarration("The data guide is unavailable right now.");
        return;
      }
      let text = "";
      const refs: DataRef[] = [];
      await readNdjson(res, (e) => {
        const ev = e as
          | { type: "text"; text: string }
          | { type: "ref"; ref: DataRef }
          | { type: "error"; message: string }
          | { type: "tool"; name: string; summary: string };
        if (ev.type === "text") {
          text += ev.text;
          setNarration(text.trim());
        } else if (ev.type === "ref") {
          refs.push(ev.ref);
          setFound([...refs]);
        } else if (ev.type === "error") {
          setNarration(ev.message);
        }
      });
    } catch {
      setNarration("The data guide is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Describe the data you want…"
          className="w-full rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
        />
        <button
          onClick={ask}
          disabled={busy || !q.trim()}
          className={cx(
            "shrink-0 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors",
            busy || !q.trim()
              ? "border-line text-faint"
              : "border-accent-line text-accent hover:bg-accent-dim",
          )}
        >
          {busy ? "Looking…" : "Find"}
        </button>
      </div>

      {narration && (
        <p className="max-h-20 overflow-y-auto text-[11.5px] leading-snug text-muted">
          {narration}
        </p>
      )}
      {found.length > 0 && (
        <div className="dr-scroll flex gap-1.5 overflow-x-auto pb-0.5">
          {found.map((r) => {
            const key = `${r.snippet}::${r.label}`;
            const taken = chosen.has(key);
            return (
              <button
                key={key}
                onClick={() => onPick(r)}
                title={taken ? "Selected — click to remove" : "Click to select"}
                className={cx("shrink-0", taken ? "opacity-100" : "opacity-80 hover:opacity-100")}
              >
                <AttachedChip refr={r} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
