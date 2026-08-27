"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The gate.
 *
 * Sources emit batches that ride into Dryos; most pass validation and continue
 * out to buyers, and roughly one in eight fails and stops dead at the centre.
 * The rejection is the point — flow alone is every data company's hero, and the
 * thing that is actually ours is that bad data does not reach the far side.
 *
 * Zero dependencies: the paths are ordinary SVG, and packet positions come from
 * `getPointAtLength()` driven by one rAF loop. That keeps the marketing page
 * light and lets every colour come from the existing theme tokens, so it works
 * in light and dark without a second palette.
 */

const W = 560;
const H = 440;
const HUB = { x: 288, y: H / 2 };

const SOURCE_Y = [88, 164, 240, 316, 392];
const BUYER_Y = [128, 220, 312];
const SOURCE_X = 68;
const BUYER_X = 500;

/** Only the first source is real today; the rest are drawn but unlabelled. */
const LIVE_SOURCE = 0;

const REJECT_EVERY = 8;
const IN_MS = 1500;
const OUT_MS = 1250;
const SPAWN_MS = 620;

type Phase = "in" | "out" | "reject";

interface Packet {
  id: number;
  phase: Phase;
  lane: number;
  out: number;
  start: number;
  live: boolean;
}

function inPath(y: number) {
  return `M ${SOURCE_X} ${y} C ${SOURCE_X + 110} ${y}, ${HUB.x - 110} ${HUB.y}, ${HUB.x} ${HUB.y}`;
}
function outPath(y: number) {
  return `M ${HUB.x} ${HUB.y} C ${HUB.x + 110} ${HUB.y}, ${BUYER_X - 110} ${y}, ${BUYER_X} ${y}`;
}

export function GateAnimation({ apiUrl, slug }: { apiUrl: string | null; slug: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const inRefs = useRef<(SVGPathElement | null)[]>([]);
  const outRefs = useRef<(SVGPathElement | null)[]>([]);
  const dotRefs = useRef<Map<number, SVGCircleElement>>(new Map());

  const packets = useRef<Packet[]>([]);
  const nextId = useRef(0);
  const spawned = useRef(0);
  const lastSpawn = useRef(0);
  const rendered = useRef(0);
  const [, force] = useState(0);

  // Ring pulse + per-node flashes are DOM writes, not React state — at this
  // rate a re-render per event would be wasteful.
  const ringRef = useRef<SVGCircleElement>(null);
  const rejectRef = useRef<SVGGElement>(null);
  const buyerRefs = useRef<(SVGCircleElement | null)[]>([]);
  const sourceRefs = useRef<(SVGCircleElement | null)[]>([]);

  const [reduced, setReduced] = useState(false);
  const liveQueue = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // A real collection fires a brighter packet than the ambient loop, so the
  // hero doubles as a live indicator rather than pure decoration.
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

  // Reduced motion still gets the picture, just held still: a few batches frozen
  // mid-flight compose the same story without anything moving.
  useEffect(() => {
    if (!reduced) return;
    packets.current = [
      { id: -1, phase: "in", lane: 0, out: 0, start: 0, live: true },
      { id: -2, phase: "out", lane: 2, out: 1, start: 0, live: false },
      { id: -3, phase: "in", lane: 3, out: 2, start: 0, live: false },
    ];
    force((n) => n + 1);
    const t = window.setTimeout(() => {
      for (const p of packets.current) {
        const path = p.phase === "in" ? inRefs.current[p.lane] : outRefs.current[p.out];
        const dot = dotRefs.current.get(p.id);
        if (!path || !dot) continue;
        const pt = path.getPointAtLength(path.getTotalLength() * 0.55);
        dot.setAttribute("cx", String(pt.x));
        dot.setAttribute("cy", String(pt.y));
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let running = true;

    const flash = (el: Element | null, cls: string, ms: number) => {
      if (!el) return;
      el.classList.add(cls);
      window.setTimeout(() => el.classList.remove(cls), ms);
    };

    const step = (now: number) => {
      if (!running) return;

      if (now - lastSpawn.current > SPAWN_MS) {
        lastSpawn.current = now;
        const live = liveQueue.current > 0;
        if (live) liveQueue.current -= 1;
        const lane = live ? LIVE_SOURCE : Math.floor(Math.random() * SOURCE_Y.length);
        packets.current.push({
          id: nextId.current++,
          phase: "in",
          lane,
          out: Math.floor(Math.random() * BUYER_Y.length),
          start: now,
          live,
        });
        spawned.current += 1;
        flash(sourceRefs.current[lane], "dr-node-fire", 420);
      }

      for (const p of packets.current) {
        const path =
          p.phase === "in" ? inRefs.current[p.lane] : outRefs.current[p.out];
        const dot = dotRefs.current.get(p.id);
        if (!path || !dot) continue;

        const dur = p.phase === "in" ? IN_MS : OUT_MS;
        const t = Math.min(1, (now - p.start) / dur);
        const pt = path.getPointAtLength(path.getTotalLength() * ease(t));
        dot.setAttribute("cx", String(pt.x));
        dot.setAttribute("cy", String(pt.y));

        if (p.phase === "reject") {
          dot.setAttribute("opacity", String(Math.max(0, 1 - t * 2.2)));
        }

        if (t >= 1) {
          if (p.phase === "in") {
            // The gate. A live batch always passes — it really did.
            const fails = !p.live && spawned.current % REJECT_EVERY === 0;
            flash(ringRef.current, "dr-ring-pulse", 620);
            if (fails) {
              p.phase = "reject";
              p.start = now;
              dot.setAttribute("fill", "var(--color-warn)");
              flash(rejectRef.current, "dr-reject-show", 900);
            } else {
              p.phase = "out";
              p.start = now;
            }
          } else {
            if (p.phase === "out") flash(buyerRefs.current[p.out], "dr-node-fire", 420);
            packets.current = packets.current.filter((x) => x.id !== p.id);
            dotRefs.current.delete(p.id);
          }
        }
      }

      // React only needs waking when the set of elements changes, not per frame.
      if (packets.current.length !== rendered.current) {
        rendered.current = packets.current.length;
        force((n) => n + 1);
      }

      raf = requestAnimationFrame(step);
    };

    // Never burn frames on a hero nobody is looking at.
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !raf) {
          running = true;
          lastSpawn.current = performance.now();
          raf = requestAnimationFrame(step);
        } else if (!e.isIntersecting && raf) {
          running = false;
          cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { threshold: 0.15 },
    );
    if (svgRef.current) io.observe(svgRef.current);

    const onVis = () => {
      if (document.visibilityState === "hidden" && raf) {
        running = false;
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (document.visibilityState === "visible" && !raf) {
        running = true;
        lastSpawn.current = performance.now();
        raf = requestAnimationFrame(step);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reduced]);

  const live = packets.current;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Sources publish batches into Dryos, which validates each one before it reaches buyers. Batches that fail validation stop at the centre."
    >
      {/* routes */}
      <g fill="none" stroke="var(--color-line)" strokeWidth="1">
        {SOURCE_Y.map((y, i) => (
          <path
            key={`i${i}`}
            ref={(el) => {
              inRefs.current[i] = el;
            }}
            d={inPath(y)}
          />
        ))}
        {BUYER_Y.map((y, i) => (
          <path
            key={`o${i}`}
            ref={(el) => {
              outRefs.current[i] = el;
            }}
            d={outPath(y)}
          />
        ))}
      </g>

      {/* sources */}
      {SOURCE_Y.map((y, i) => (
        <g key={`s${i}`}>
          <circle
            ref={(el) => {
              sourceRefs.current[i] = el;
            }}
            cx={SOURCE_X}
            cy={y}
            r={i === LIVE_SOURCE ? 7 : 5}
            className="dr-node"
            fill={i === LIVE_SOURCE ? "var(--color-accent)" : "var(--color-surface-3)"}
            stroke="var(--color-line-strong)"
            strokeWidth="1"
          />
          {i === LIVE_SOURCE && (
            <text
              x={SOURCE_X}
              y={y - 16}
              textAnchor="middle"
              className="fill-[var(--color-muted)] font-mono text-[11px]"
            >
              ERCOT
            </text>
          )}
        </g>
      ))}

      {/* hub */}
      <g>
        <circle
          ref={ringRef}
          cx={HUB.x}
          cy={HUB.y}
          r="34"
          fill="none"
          stroke="var(--color-accent-line)"
          strokeWidth="1.5"
          className="dr-ring"
        />
        <circle
          cx={HUB.x}
          cy={HUB.y}
          r="22"
          fill="var(--color-surface-2)"
          stroke="var(--color-line-strong)"
          strokeWidth="1"
        />
        <text
          x={HUB.x}
          y={HUB.y + 4}
          textAnchor="middle"
          className="fill-[var(--color-ink)] font-mono text-[10px]"
        >
          validate
        </text>
        <g ref={rejectRef} className="dr-reject">
          <text
            x={HUB.x}
            y={HUB.y + 58}
            textAnchor="middle"
            className="fill-[var(--color-warn)] font-mono text-[10.5px]"
          >
            batch rejected
          </text>
        </g>
      </g>

      {/* buyers */}
      {BUYER_Y.map((y, i) => (
        <g key={`b${i}`}>
          <circle
            ref={(el) => {
              buyerRefs.current[i] = el;
            }}
            cx={BUYER_X}
            cy={y}
            r="6"
            className="dr-node"
            fill="var(--color-surface-3)"
            stroke="var(--color-line-strong)"
            strokeWidth="1"
          />
        </g>
      ))}
      <text
        x={BUYER_X}
        y={BUYER_Y[0] - 20}
        textAnchor="middle"
        className="fill-[var(--color-muted)] font-mono text-[11px]"
      >
        buyers
      </text>

      {/* packets */}
      {/*
        No cx/cy/fill props here on purpose. The loop writes those attributes
        directly, and anything React also controls gets reset to its prop value
        on the next render — which snapped every packet back to its source the
        moment a new one spawned. React owns the element; the loop owns its
        position.
      */}
      {live.map((p) => (
        <circle
          key={p.id}
          ref={(el) => {
            if (!el) {
              dotRefs.current.delete(p.id);
              return;
            }
            dotRefs.current.set(p.id, el);
            if (!el.hasAttribute("cx")) {
              el.setAttribute("cx", String(SOURCE_X));
              el.setAttribute("cy", String(SOURCE_Y[p.lane]));
              el.setAttribute("fill", "var(--color-accent)");
            }
          }}
          r={p.live ? 5 : 3.5}
          className={p.live ? "dr-packet-live" : undefined}
        />
      ))}
    </svg>
  );
}

/** easeInOutCubic — batches accelerate away and settle on arrival. */
function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
