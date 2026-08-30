"use client";

import { useEffect, useRef } from "react";

/**
 * A host for one preview frame.
 *
 * A sandboxed app can only reach data by posting a message to its parent, and
 * a frame mounted outside `Runner` posts into the void — thirty seconds later
 * it reads "Dryos request timed out". This is the missing parent, extracted:
 * attach the returned ref to a preview iframe and its queries are answered
 * through `/api/workspace/data` like any other frame's. No `appId` is stamped,
 * so preview queries land under `-` in the ledger — honest about belonging to
 * no screen.
 */
export function usePreviewHost() {
  const frame = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const m = e.data as {
        __dryos?: string;
        id?: number;
        op?: string;
        payload?: unknown;
      };
      if (!m || m.__dryos !== "call") return;
      const win = e.source as Window;
      try {
        if (m.op !== "query") throw new Error(`Unknown operation "${m.op}"`);
        const res = await fetch("/api/workspace/data", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(m.payload ?? {}),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Query failed");
        win.postMessage({ __dryos: "result", id: m.id, data: json }, "*");
      } catch (err) {
        win.postMessage(
          {
            __dryos: "result",
            id: m.id,
            error: err instanceof Error ? err.message : "Query failed",
          },
          "*",
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return frame;
}
