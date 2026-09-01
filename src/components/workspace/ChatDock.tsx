"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { AttachedChip } from "@/components/workspace/DataChip";
import type { DataRef } from "@/lib/workspace/catalog";
import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  EFFORTS,
  chatModel,
  effortOf,
} from "@/lib/workspace/models";
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
 * whether the answer is words or a change to the screen. It lives as a tab of
 * the panel column, because a conversation reads top-down: it spent a spell as
 * a wide strip under the canvas, and two lines of transcript across a metre of
 * width was the worst shape a chat can take.
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
  /*
    Which model answers, and at what effort — remembered per machine, like the
    panel width: a preference about how you work, not a fact about any page.
    The chip renders from the roster in models.ts, the same list the server
    validates against, so the picker can never offer what the call would
    refuse. Effort is hidden entirely for a model that rejects it (Haiku),
    because a select that 400s is worse than no select.
  */
  const [modelId, setModelId] = useState(DEFAULT_CHAT_MODEL);
  const [effort, setEffort] = useState<string>("high");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null);

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

  // The account menu's idiom: close on a click outside, or Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!picker.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPickerOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  const model = chatModel(modelId);

  function pickModel(id: string) {
    setModelId(id);
    setPickerOpen(false);
    try {
      localStorage.setItem("dryos:chatModel", id);
    } catch {}
  }

  function pickEffort(level: string) {
    setEffort(level);
    setEffortOpen(false);
    try {
      localStorage.setItem("dryos:chatEffort", level);
    } catch {}
  }

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
      body: JSON.stringify({ question, model: modelId, effort }),
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
      body: JSON.stringify({ intent, refs, model: modelId, effort }),
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

      {/*
        One composer box, the way a chat expects it: the text spans the whole
        column and the controls live inside the box on their own row beneath
        it, rather than beside the text stealing its width. The border belongs
        to the box, so the textarea inside it is naked — two nested borders
        read as a form inside a form.
      */}
      <div className="shrink-0 border-t border-line px-3 py-2">
        {/*
          The active state belongs to the box, not the field inside it. The
          global `*:focus-visible` outline is UNLAYERED css, so it beats any
          Tailwind utility on the textarea regardless of specificity — the
          inline style is the only thing that outranks it. The box then wears
          the same accent ring the global rule would have drawn, as a
          box-shadow ring (no unlayered outline rule competes with those).
        */}
        <div className="rounded-md border border-line bg-surface-2 transition-colors focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-surface">
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
            style={{ outline: "none" }}
            className="block w-full resize-none bg-transparent px-2.5 pt-2 pb-0.5 text-[12.5px] text-ink placeholder:text-faint"
          />

          <div className="flex items-center justify-end gap-1.5 px-1.5 pb-1.5">
            {/*
              The model chip, and the menu above it. The chip states both
              choices ("Opus 5 · High") because a hidden effort is a bill
              nobody agreed to; the menu opens upward — the composer sits at
              the bottom of its column and a menu that opens off-screen is
              not a menu.
            */}
            <div ref={picker} className="relative shrink-0">
              <button
                onClick={() => {
                  setPickerOpen((v) => !v);
                  setEffortOpen(false);
                }}
                aria-expanded={pickerOpen}
                aria-label="Choose the model"
                className="rounded-md border border-line px-2 py-1 text-[11px] whitespace-nowrap text-muted transition-colors hover:bg-surface-3 hover:text-ink"
              >
                {model.name}
                {model.effort && (
                  <span className="ml-1 text-faint capitalize">
                    {effortOf(effort)}
                  </span>
                )}
              </button>

              {pickerOpen && (
                <div className="absolute right-0 bottom-full z-30 mb-1.5 w-60 rounded-lg border border-line-strong bg-surface p-1 shadow-2xl shadow-black/50">
                  {CHAT_MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => pickModel(m.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] text-ink">
                          {m.name}
                        </span>
                        <span className="block truncate text-[10.5px] text-faint">
                          {m.blurb}
                        </span>
                      </span>
                      {m.id === modelId && (
                        <span
                          aria-hidden
                          className="shrink-0 text-[12px] text-accent"
                        >
                          ✓
                        </span>
                      )}
                    </button>
                  ))}

                  {/* Only where the model honours it — a select that 400s is
                      worse than no select. */}
                  {model.effort && (
                    <>
                      <div className="mx-1 my-1 border-t border-line" />
                      <button
                        onClick={() => setEffortOpen((v) => !v)}
                        aria-expanded={effortOpen}
                        className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink transition-colors hover:bg-surface-2"
                      >
                        Effort
                        <span className="ml-auto text-[11px] text-faint capitalize">
                          {effortOf(effort)} {effortOpen ? "▾" : "›"}
                        </span>
                      </button>
                      {effortOpen && (
                        <div className="flex flex-wrap gap-1 px-2 pt-0.5 pb-1.5">
                          {EFFORTS.map((level) => (
                            <button
                              key={level}
                              onClick={() => pickEffort(level)}
                              aria-pressed={effortOf(effort) === level}
                              className={cx(
                                "rounded border px-1.5 py-0.5 text-[10.5px] capitalize transition-colors",
                                effortOf(effort) === level
                                  ? "border-accent-line bg-accent-dim text-accent"
                                  : "border-line text-muted hover:text-ink",
                              )}
                            >
                              {level}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={send}
              disabled={busy || !input.trim()}
              title="Submit (Enter)"
              className="shrink-0 rounded-md border border-accent-line bg-accent-dim px-2.5 py-1 text-[11px] whitespace-nowrap text-accent transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "…" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
