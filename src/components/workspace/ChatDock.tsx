"use client";

import { useEffect, useRef, useState } from "react";
import { Button, cx } from "@/components/ui";
import { AttachedChip } from "@/components/workspace/DataChip";
import type { DataRef } from "@/lib/workspace/catalog";
import { readNdjson } from "@/lib/workspace/ndjson";
import type { App } from "@/lib/workspace/types";

/**
 * The conversation under the dashboard, in two modes.
 *
 * **Ask** is just chat: the data guide (`dataAgent.ts` behind
 * `/api/workspace/ask`) answers questions about what exists and what it says,
 * and hands back the same `DataRef` chips a click in the explorer produces —
 * nothing on the screen changes. **Agent** is the build mode: the sentence goes
 * down the edit route's agent path with the explorer's selection attached, and
 * the change lands on the dashboard above, gated by the same compile step as
 * everything else.
 *
 * The two are one window because they are one posture — you are talking about
 * the dashboard in front of you — and the mode is the only thing that decides
 * whether the answer is words or a change to the screen. It fills whatever the
 * letterboxed canvas leaves below it: a conversation is the one thing here that
 * genuinely wants more height than a bar.
 */

type Mode = "ask" | "agent";

interface Msg {
  role: "you" | "dryos";
  text: string;
  /** Chips: attached to a request, or found by the ask agent. */
  refs?: DataRef[];
  /** Live progress while an answer streams; null once it has finished. */
  phase?: string | null;
  error?: boolean;
}

export function ChatDock({
  appId,
  refs,
  onApp,
  onPick,
}: {
  appId: string;
  /** The explorer's selection, attached to agent requests as chips. */
  refs: DataRef[];
  /** The agent rebuilt the dashboard — the new app, already saved. */
  onApp: (app: App) => void;
  /** Toggle a reference the ask agent found into the selection. */
  onPick: (ref: DataRef) => void;
}) {
  const [mode, setMode] = useState<Mode>("ask");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // Follow the conversation: everything new lands at the bottom.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  /** Update the message being streamed into — always the last one. */
  const patch = (fn: (m: Msg) => Msg) =>
    setMessages((ms) => ms.map((m, i) => (i === ms.length - 1 ? fn(m) : m)));

  async function askData(question: string) {
    const res = await fetch("/api/workspace/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) throw new Error("The data guide is unavailable right now.");
    let text = "";
    const found: DataRef[] = [];
    await readNdjson(res, (e) => {
      const ev = e as
        | { type: "text"; text: string }
        | { type: "ref"; ref: DataRef }
        | { type: "tool"; name: string; summary: string }
        | { type: "error"; message: string };
      if (ev.type === "text") {
        text += ev.text;
        patch((m) => ({ ...m, phase: null, text: text.trim() }));
      } else if (ev.type === "ref") {
        found.push(ev.ref);
        patch((m) => ({ ...m, refs: [...found] }));
      } else if (ev.type === "error") {
        patch((m) => ({ ...m, phase: null, error: true, text: ev.message }));
      }
    });
  }

  async function buildOnPage(intent: string) {
    const res = await fetch(`/api/workspace/apps/${appId}/edit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent, refs }),
    });
    if (!res.ok && !res.headers.get("content-type")?.includes("ndjson")) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? `The server returned ${res.status}.`);
    }
    await readNdjson(res, (e) => {
      switch (e.type) {
        case "phase":
          patch((m) => ({ ...m, phase: `${e.phase}…` }));
          break;
        case "note":
          patch((m) => ({ ...m, text: String(e.text) }));
          break;
        case "done":
          onApp(e.app as App);
          // The tile changing above is the real report; this line only closes
          // the exchange the sentence opened.
          patch((m) => ({
            ...m,
            phase: null,
            text: m.text || "Done — the change is on the screen.",
          }));
          break;
        case "failed":
        case "error":
          patch((m) => ({
            ...m,
            phase: null,
            error: true,
            text: String(e.message),
          }));
          break;
      }
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");
    setMessages((ms) => [
      ...ms,
      {
        role: "you",
        text,
        // An agent request goes out with the selection attached, so the
        // transcript shows what the sentence was armed with.
        refs: mode === "agent" && refs.length ? [...refs] : undefined,
      },
      { role: "dryos", text: "", phase: mode === "ask" ? "thinking…" : "starting…" },
    ]);
    try {
      if (mode === "ask") await askData(text);
      else await buildOnPage(text);
    } catch (err) {
      patch((m) => ({
        ...m,
        phase: null,
        error: true,
        text:
          m.text ||
          (err instanceof Error ? err.message : "That did not go through."),
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-line bg-surface">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
        <div className="flex gap-0.5 rounded-md border border-line bg-surface-2 p-0.5">
          {(["ask", "agent"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cx(
                "rounded px-2.5 py-0.5 text-[11.5px] transition-colors",
                mode === m ? "bg-surface-3 text-ink" : "text-muted hover:text-ink",
              )}
            >
              {m === "ask" ? "Ask" : "Agent"}
            </button>
          ))}
        </div>
        <span className="min-w-0 truncate font-mono text-[9.5px] text-faint">
          {mode === "ask"
            ? "chat about the data — nothing on the screen changes"
            : "describe a change and the agent builds it on this screen"}
        </span>
      </div>

      <div ref={scroller} className="dr-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <p className="text-[12px] leading-relaxed text-faint">
            {mode === "ask"
              ? "Ask about the data — which node is the Austin one, what a stream holds, what a number has been doing. Anything it finds arrives as chips you can select."
              : "Describe a change to this dashboard and the agent makes it — every change is compiled before it lands, and reverting it lives in History."}
          </p>
        ) : (
          <ol className="flex flex-col gap-2.5">
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
                  <p className="mt-0.5 font-mono text-[11px] text-accent">{m.phase}</p>
                )}
                {m.refs && m.refs.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {m.refs.map((r, n) =>
                      // The guide's finds are selectable; the chips a request
                      // went out with are a record, not a control.
                      m.role === "dryos" ? (
                        <button
                          key={`${r.snippet}-${n}`}
                          onClick={() => onPick(r)}
                          title="Click to select"
                          className="opacity-80 hover:opacity-100"
                        >
                          <AttachedChip refr={r} />
                        </button>
                      ) : (
                        <AttachedChip key={`${r.snippet}-${n}`} refr={r} />
                      ),
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="flex shrink-0 items-end gap-2 border-t border-line px-3 py-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder={
            mode === "ask"
              ? "Ask about the data…"
              : "Describe a change to this dashboard…"
          }
          className="min-h-0 w-full flex-1 resize-none rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
        />
        <Button
          tone="primary"
          size="sm"
          disabled={busy || !input.trim()}
          onClick={send}
        >
          {busy ? "Working…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
