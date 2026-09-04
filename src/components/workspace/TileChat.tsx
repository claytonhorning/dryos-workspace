"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { type AskTurn, type TileAsk, pointCaption } from "@/lib/workspace/ask";
import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  chatModel,
  effortOf,
} from "@/lib/workspace/models";
import { readNdjson } from "@/lib/workspace/ndjson";

/**
 * The chat a double click on a tile opens.
 *
 * A small window at the click, not a panel: the question is about the number
 * under the pointer, so the answer belongs beside it rather than in a column
 * the eye has to leave the tile for. It carries what the frame packed at the
 * click — the point, the tile's rows, a digest of the screen — and sends all
 * of it with every turn, so the route keeps nothing and a follow-up still
 * knows what it is about.
 *
 * Placed by the click: to its lower right where there is room, mirrored
 * where there is not, and anchored by its bottom edge when it opens upward
 * so it grows away from the point rather than over it. It sits inside the
 * canvas box, in the box's own pixels — the frame's coordinates were scaled
 * back out on the way here.
 */

const W = 336;
const GAP = 10;
const EDGE = 8;

interface Msg {
  role: "you" | "dryos";
  text: string;
  /** Live progress while an answer streams; null once it has finished. */
  phase?: string | null;
  error?: boolean;
}

/** Enough to start with; the point is already in the header. */
const STARTERS = [
  "What am I looking at?",
  "Is this unusual?",
  "How does it compare to the rest of the screen?",
];

export function TileChat({
  ask,
  at,
  box,
  page,
  tz,
  onClose,
}: {
  ask: TileAsk;
  /** Where the click landed, in the canvas box's pixels. */
  at: { x: number; y: number };
  /** The canvas box, so the window stays inside it. */
  box: { w: number; h: number };
  /** The page's name, for the model's context. */
  page: string;
  /** The display timezone preference — "source" or an IANA name. */
  tz: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // The model the composer chose, so a preference set there carries here —
  // there is no room for a picker in a window this size.
  const [modelId, setModelId] = useState(DEFAULT_CHAT_MODEL);
  const [effort, setEffort] = useState("high");
  useEffect(() => {
    try {
      const m = localStorage.getItem("dryos:chatModel");
      const e = localStorage.getItem("dryos:chatEffort");
      if (m && CHAT_MODELS.some((x) => x.id === m)) setModelId(m);
      if (e) setEffort(effortOf(e));
    } catch {
      // A machine that will not keep the preference still gets the default.
    }
  }, []);

  // Escape closes; so does a press anywhere else on the host document. A
  // press inside the frame arrives as a message and the page closes it there.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  // Follow the conversation: everything new lands at the bottom.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // A callback ref rather than autoFocus: the window mounts on a click that
  // happened in another document, and autoFocus loses that race often enough
  // to notice.
  const focusOnMount = useCallback((el: HTMLTextAreaElement | null) => {
    el?.focus();
  }, []);

  /** Update the message being streamed into — always the last one. */
  const patch = (fn: (m: Msg) => Msg) =>
    setMessages((ms) => ms.map((m, i) => (i === ms.length - 1 ? fn(m) : m)));

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setBusy(true);
    setInput("");
    // The turns so far, as the route wants them — before this question is
    // added, so the transcript sent is exactly what is on screen.
    const history: AskTurn[] = messages
      .filter((m) => !m.error && m.text)
      .map((m) => ({ role: m.role === "you" ? "user" : "assistant", text: m.text }));
    setMessages((ms) => [
      ...ms,
      { role: "you", text: question },
      { role: "dryos", text: "", phase: "reading the screen…" },
    ]);
    try {
      const res = await fetch("/api/workspace/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          ask,
          page,
          tz,
          history,
          model: modelId,
          effort,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `The server returned ${res.status}.`);
      }
      let answer = "";
      await readNdjson(res, (e) => {
        const ev = e as
          | { type: "text"; text: string }
          | { type: "tool"; name: string; summary: string }
          | { type: "error"; message: string };
        if (ev.type === "text") {
          answer += ev.text;
          patch((m) => ({ ...m, phase: null, text: answer.trim() }));
        } else if (ev.type === "tool") {
          patch((m) => ({ ...m, phase: ev.summary }));
        } else if (ev.type === "error") {
          patch((m) => ({ ...m, phase: null, error: true, text: m.text || ev.message }));
        }
      });
      patch((m) => ({ ...m, phase: null }));
    } catch (err) {
      patch((m) => ({
        ...m,
        phase: null,
        error: true,
        text: m.text || (err instanceof Error ? err.message : "That did not go through."),
      }));
    } finally {
      setBusy(false);
    }
  }

  // Lower right of the click where there is room, mirrored where there is
  // not. Opening upward anchors the bottom edge so the window grows away
  // from the point instead of over it.
  const right = at.x + GAP + W <= box.w - EDGE;
  const left = Math.max(
    EDGE,
    Math.min(box.w - W - EDGE, right ? at.x + GAP : at.x - GAP - W),
  );
  const below = at.y < box.h * 0.55;
  const room = below ? box.h - (at.y + GAP) - EDGE : at.y - GAP - EDGE;
  const maxH = Math.max(160, Math.min(380, room));

  const caption = pointCaption(ask.point);
  const model = chatModel(modelId);

  return (
    <div
      ref={root}
      role="dialog"
      aria-label={`Ask about ${ask.tile.title ?? "this tile"}`}
      className="absolute z-30 flex flex-col overflow-hidden rounded-lg border border-line-strong bg-surface shadow-2xl shadow-black/50"
      style={{
        left,
        width: W,
        maxHeight: maxH,
        ...(below ? { top: at.y + GAP } : { bottom: box.h - (at.y - GAP) }),
      }}
    >
      <div className="flex shrink-0 items-start gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[9px] tracking-[0.13em] text-faint uppercase">
            ask · {ask.tile.title ?? `tile ${ask.index + 1}`}
          </p>
          {caption && (
            <p
              className="mt-0.5 truncate font-mono text-[10.5px] text-ink"
              title={caption}
            >
              {caption}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close"
          className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] leading-none text-faint transition-colors hover:text-ink"
        >
          ✕
        </button>
      </div>

      <div ref={scroller} className="dr-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {messages.map((m, i) => (
              <li key={i}>
                <p className="font-mono text-[9px] tracking-[0.13em] text-faint uppercase">
                  {m.role}
                </p>
                {m.text && (
                  <p
                    className={cx(
                      "mt-0.5 text-[12.5px] leading-relaxed whitespace-pre-wrap",
                      m.error ? "text-fail" : m.role === "you" ? "text-ink" : "text-muted",
                    )}
                  >
                    {m.text}
                  </p>
                )}
                {m.phase && (
                  <p className="mt-0.5 font-mono text-[10.5px] text-accent">{m.phase}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="shrink-0 border-t border-line px-2 py-1.5">
        <div className="rounded-md border border-line bg-surface-2 transition-colors focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-surface">
          <textarea
            ref={focusOnMount}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask about this…"
            // The global focus outline is unlayered CSS and beats any utility
            // on the field; the box above wears the ring instead.
            style={{ outline: "none" }}
            className="block w-full resize-none bg-transparent px-2 pt-1.5 pb-0.5 text-[12.5px] text-ink placeholder:text-faint"
          />
          <div className="flex items-center justify-between gap-2 px-1.5 pb-1">
            <span className="truncate font-mono text-[9.5px] text-faint">
              {model.name}
              {model.effort ? ` · ${effortOf(effort)}` : ""}
            </span>
            <button
              onClick={() => send(input)}
              disabled={busy || !input.trim()}
              title="Send (Enter)"
              className="shrink-0 rounded border border-accent-line bg-accent-dim px-2 py-0.5 text-[10.5px] text-accent transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "…" : "Ask"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
