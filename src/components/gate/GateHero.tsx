"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Palette } from "./Scene";

/**
 * Wrapper around the three.js scene.
 *
 * The scene is loaded lazily with ssr:false so ~200 kB of WebGL never blocks
 * first paint — the panel renders immediately and the visual fades in behind
 * it. Labels stay in the DOM rather than the scene: crisp text at any DPI,
 * translatable, and readable by a screen reader.
 */
const Scene = dynamic(() => import("./Scene"), {
  ssr: false,
  loading: () => <div className="h-[400px] w-full" />,
});

const APPS = ["AI agents", "RAG pipelines", "trading models", "dashboards", "data feeds"];

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, fallback: string) => cs.getPropertyValue(n).trim() || fallback;
  return {
    accent: v("--color-accent", "#e8ff3d"),
    warn: v("--color-warn", "#fbbf24"),
    dim: v("--color-line-strong", "#3d4b5c"),
  };
}

export function GateHero({ apiUrl, slug }: { apiUrl: string | null; slug: string }) {
  const [palette, setPalette] = useState<Palette | null>(null);
  const [reduced, setReduced] = useState(false);
  const liveQueue = useRef(0);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setPalette(readPalette());
    // Re-read on the theme toggle so the scene follows it rather than carrying
    // its own palette.
    const mo = new MutationObserver(() => setPalette(readPalette()));
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => mo.disconnect();
  }, []);

  // A real collection fires a brighter batch than the ambient loop, so the hero
  // doubles as a live indicator rather than pure decoration.
  useEffect(() => {
    if (!apiUrl || reduced) return;
    let seen: string | null = null;
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`${apiUrl}/v1/datasets/${slug}/preview?hours=24`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const b = await r.json();
        const latest = b.intervals?.[b.intervals.length - 1]?.t ?? null;
        if (cancelled || !latest) return;
        if (seen && latest !== seen) liveQueue.current += 1;
        seen = latest;
      } catch {
        /* a dropped poll just means no live beat this cycle */
      }
    };
    poll();
    const id = setInterval(poll, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [apiUrl, slug, reduced]);

  return (
    <div className="relative">
      <div className="h-[400px] w-full">
        {palette && !reduced && <Scene palette={palette} liveQueue={liveQueue} />}
      </div>

      {/* Column labels live in the DOM: crisp at any DPI, and actually readable. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-5">
        <span className="rounded bg-surface/60 px-1.5 py-0.5 font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase backdrop-blur-sm">
          maintainers
        </span>
        <span className="rounded bg-surface/60 px-1.5 py-0.5 font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase backdrop-blur-sm">
          applications
        </span>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-wrap justify-center gap-1.5 px-5">
        {APPS.map((a) => (
          <span
            key={a}
            className="rounded border border-line bg-surface/70 px-2 py-[3px] font-mono text-[10.5px] text-faint backdrop-blur-sm"
          >
            {a}
          </span>
        ))}
      </div>

      {reduced && (
        <div className="absolute inset-0 grid place-items-center px-8 text-center">
          <p className="text-[13px] leading-relaxed text-muted">
            Maintainers publish batches. Dryos validates each one and delivers it to
            your applications; a batch that fails the check stops at the centre.
          </p>
        </div>
      )}
    </div>
  );
}
