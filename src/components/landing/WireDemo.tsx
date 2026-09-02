"use client";

import { useGSAP } from "@gsap/react";
import { useRef } from "react";
import { gsap, useAnimSetup, useReducedMotion, whenVisible } from "@/components/hero/anim";
import { ThemedShot } from "./ThemedShot";

/**
 * A wire firing, replayed from two real captures.
 *
 * Both frames are the same page a few seconds apart: before and after a click
 * on one node of the map. Nothing here is drawn to look like the product — the
 * popup, the retitled chart and the ticker changing hands are what the page
 * did — so the animation is only the crossfade between the two, a ring where
 * the click landed, and a line from the node to the chart it drives. The line
 * is landing-page chrome, deliberately: the product refuses to draw one (it
 * would be spaghetti on a screen meant to carry nothing), but here it is the
 * whole explanation. It is drawn in the info blue rather than the accent: the
 * nodes underneath are priced in yellow, and a yellow line over a yellow map
 * was invisible exactly where it started.
 *
 * The ring sits at the node that was clicked, as a fraction of the map crop —
 * the capture is fixed, so the position is too.
 */
const NODE = { x: 62, y: 41.5 };

export function WireDemo() {
  useAnimSetup();
  const reduced = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const pickedMap = useRef<HTMLDivElement>(null);
  const pickedCol = useRef<HTMLDivElement>(null);
  const col = useRef<HTMLDivElement>(null);
  const wire = useRef<SVGPathElement>(null);

  useGSAP(
    () => {
      const els = [stage, ring, pickedMap, pickedCol, col, wire].map((r) => r.current);
      if (els.some((e) => !e)) return;
      const [st, rg, pm, pc, cl, wr] = els as [
        HTMLDivElement,
        HTMLSpanElement,
        HTMLDivElement,
        HTMLDivElement,
        HTMLDivElement,
        SVGPathElement,
      ];

      // Reduced motion: the picked state, standing still. It is the more
      // informative of the two frames and the popup says what happened.
      if (reduced) {
        gsap.set([pm, pc], { opacity: 1 });
        return;
      }

      // The path runs from the ring to the chart's left edge, measured against
      // the stage because both ends move with the column widths.
      const route = () => {
        const s = st.getBoundingClientRect();
        const a = rg.getBoundingClientRect();
        const b = cl.getBoundingClientRect();
        const x1 = a.left + a.width / 2 - s.left;
        const y1 = a.top + a.height / 2 - s.top;
        const x2 = b.left - s.left + 2;
        const y2 = b.top - s.top + b.height * 0.17;
        const cx = (x1 + x2) / 2;
        wr.setAttribute("d", `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`);
        const len = wr.getTotalLength();
        gsap.set(wr, { strokeDasharray: len, strokeDashoffset: len, opacity: 1 });
      };

      const tl = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.9, onRepeat: route });
      tl.set([pm, pc], { opacity: 0 })
        .set(rg, { opacity: 0, scale: 0.4 })
        .to(rg, { opacity: 1, scale: 1, duration: 0.3, ease: "power3.out" })
        .to(rg, { scale: 2.1, opacity: 0, duration: 0.7, ease: "power2.out" }, "+=0.1")
        .to(wr, { strokeDashoffset: 0, duration: 0.55, ease: "power2.inOut" }, "<-0.3")
        .to(pm, { opacity: 1, duration: 0.3 }, "<0.05")
        .to(pc, { opacity: 1, duration: 0.35 }, "<0.3")
        .to({}, { duration: 2.6 })
        .to([pm, pc], { opacity: 0, duration: 0.45 })
        .to(wr, { opacity: 0, duration: 0.3 }, "<");

      const trig = gsap
        .timeline({ scrollTrigger: { trigger: st, start: "top 80%", once: true } })
        .call(() => whenVisible(() => { route(); tl.play(0); }));

      const onResize = () => route();
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
        trig.kill();
        tl.kill();
      };
    },
    { scope: stage, dependencies: [reduced] },
  );

  return (
    <div
      ref={stage}
      className="relative grid grid-cols-[minmax(0,1.41fr)_minmax(0,1fr)] gap-3"
    >
      <div className="relative overflow-hidden rounded-md border border-line">
        <ThemedShot name="map" alt="A map of every ERCOT settlement point, coloured by price" ratio="3266/1757" sizes="(min-width: 1024px) 40vw, 60vw" />
        <div ref={pickedMap} className="absolute inset-0 opacity-0">
          <ThemedShot name="map-picked" alt="" ratio="3266/1757" sizes="(min-width: 1024px) 40vw, 60vw" />
        </div>
        <span
          ref={ring}
          aria-hidden
          className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-info opacity-0 shadow-[0_0_0_3px_var(--color-info-dim)]"
          style={{ left: `${NODE.x}%`, top: `${NODE.y}%` }}
        />
      </div>

      <div ref={col} className="relative overflow-hidden rounded-md border border-line">
        <ThemedShot name="col" alt="A price chart and a live ticker for the hub the map has selected" ratio="2316/1757" sizes="(min-width: 1024px) 28vw, 40vw" />
        <div ref={pickedCol} className="absolute inset-0 opacity-0">
          <ThemedShot name="col-picked" alt="" ratio="2316/1757" sizes="(min-width: 1024px) 28vw, 40vw" />
        </div>
      </div>

      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <path
          ref={wire}
          fill="none"
          stroke="var(--color-info)"
          strokeWidth={2.5}
          strokeLinecap="round"
          className="opacity-0"
        />
      </svg>
    </div>
  );
}
