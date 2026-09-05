"use client";

import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_DRYOS_API_URL ?? null;

/**
 * The delivery API's event stream: which dataset just landed rows.
 *
 * Opened from the browser straight to the API, the way the feeds menu calls
 * it, because a Vercel function cannot hold a connection open. The stream
 * carries a dataset name and a time and nothing else — the same facts the
 * status page publishes to anyone — so it is a public route and a bare
 * `EventSource` serves: no header to set, and the browser's own reconnect
 * kept. Rows never ride on it; a tile that hears its dataset refetches
 * through the metered query path it already uses.
 *
 * It stays open in a hidden tab on purpose. One idle socket is cheaper than
 * the polling it lets the tiles slow down, and closing it would put every
 * tile back on full cadence exactly while nobody is looking.
 *
 * "Up" is watched, not assumed. The tiles stop polling entirely while this
 * says the stream is connected, so a socket that has gone half-open — a
 * laptop lid, a proxy that dropped the connection without a FIN — must not
 * count. The server sends a `ping` event every twenty seconds; a minute
 * without one or any other event closes the socket, reopens it, and reports
 * not streaming until the new one speaks.
 *
 * Returns whether the stream is up. Absent `NEXT_PUBLIC_DRYOS_API_URL` it
 * never is, and every tile simply polls as it always has.
 */
const STALE_MS = 60_000;
/** The server's keepalive interval — `PING_SECONDS` in events.py. */
const PING_MS = 20_000;

export function useFeedEvents(
  onAdvanced: (datasets: string[] | null) => void,
): boolean {
  const [connected, setConnected] = useState(false);
  const cb = useRef(onAdvanced);
  cb.current = onAdvanced;

  useEffect(() => {
    if (!API) return;
    const url = `${API.replace(/\/$/, "")}/v1/events`;
    let es: EventSource | null = null;
    let heard = Date.now();
    const open = () => {
      es?.close();
      es = new EventSource(url);
      heard = Date.now();
      es.onopen = () => {
        heard = Date.now();
        setConnected(true);
      };
      // EventSource retries on its own after an error; `connected` only says
      // whether the tiles may lean on it right now.
      es.onerror = () => setConnected(false);
      es.onmessage = (e) => {
        heard = Date.now();
        try {
          const d = JSON.parse(e.data) as { dataset?: string };
          if (d.dataset) cb.current([d.dataset]);
        } catch {
          // A frame that is not JSON is not ours to act on.
        }
      };
      es.addEventListener("ping", () => {
        heard = Date.now();
      });
      // The server's ring no longer reaches back to where this client was, so
      // it cannot say what was missed: everything refetches once.
      es.addEventListener("resync", () => {
        heard = Date.now();
        cb.current(null);
      });
    };
    open();
    const stale = (ms: number) => {
      if (Date.now() - heard <= ms) return;
      setConnected(false);
      open();
    };
    const watchdog = setInterval(() => stale(STALE_MS), STALE_MS / 4);
    // Coming back from sleep or from offline, do not wait the minute: a
    // missed beat is enough to reopen, so the tiles hear about the present
    // as soon as anyone is looking again.
    const back = () => {
      if (document.visibilityState === "visible") stale(PING_MS * 1.5);
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("online", back);
    return () => {
      clearInterval(watchdog);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("online", back);
      es?.close();
      setConnected(false);
    };
  }, []);

  return connected;
}
