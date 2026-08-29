"use client";

import { useGSAP } from "@gsap/react";
import { useRef } from "react";
import { gsap, useReducedMotion } from "./anim";

/**
 * The ground the hero sits on.
 *
 * Four layers, none of them literal: film grain, a ruled grid that fades out
 * before it reaches an edge, two slow-drifting pools of light, and a spotlight
 * that trails the cursor. The grid gives the section a floor, the pools keep it
 * from looking printed, and the spotlight makes the whole panel feel lit rather
 * than filled.
 *
 * Everything animates transform or a gradient position, so none of it costs
 * layout.
 */
export function Atmosphere() {
  const reduced = useReducedMotion();
  const host = useRef<HTMLDivElement>(null);
  const warm = useRef<HTMLDivElement>(null);
  const cool = useRef<HTMLDivElement>(null);
  const spot = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (reduced) return;

      // Long, mismatched periods so the two pools never resolve into a loop you
      // can count.
      gsap.to(warm.current, {
        keyframes: {
          "0%": { x: 0, y: 0, scale: 1 },
          "34%": { x: 70, y: 44, scale: 1.08 },
          "68%": { x: -30, y: 14, scale: 0.96 },
          "100%": { x: 0, y: 0, scale: 1 },
        },
        duration: 34,
        ease: "sine.inOut",
        repeat: -1,
      });
      gsap.to(cool.current, {
        keyframes: {
          "0%": { x: 0, y: 0, scale: 1 },
          "30%": { x: -56, y: -34, scale: 1.1 },
          "70%": { x: 22, y: -8, scale: 0.98 },
          "100%": { x: 0, y: 0, scale: 1 },
        },
        duration: 43,
        ease: "sine.inOut",
        repeat: -1,
      });

      const section = host.current?.parentElement;
      if (!section || !spot.current) return;

      // `quickTo` keeps a single tween alive and re-targets it, which is what
      // makes the light lag the pointer with weight instead of snapping to it.
      const toX = gsap.quickTo(spot.current, "--spot-x", {
        duration: 0.55,
        ease: "power3.out",
      });
      const toY = gsap.quickTo(spot.current, "--spot-y", {
        duration: 0.55,
        ease: "power3.out",
      });

      const onMove = (e: PointerEvent) => {
        const r = section.getBoundingClientRect();
        toX(((e.clientX - r.left) / r.width) * 100);
        toY(((e.clientY - r.top) / r.height) * 100);
      };
      section.addEventListener("pointermove", onMove);
      return () => section.removeEventListener("pointermove", onMove);
    },
    { scope: host, dependencies: [reduced] },
  );

  return (
    <div ref={host} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Grain. The section paints its own opaque ground so the page-wide
          contour rings stop crossing the hero — this puts the tactility back
          without the interference pattern. */}
      <div
        className="absolute inset-0 opacity-[0.22] dr-when-light:opacity-[0.5]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23g)' opacity='0.15'/%3E%3C/svg%3E\")",
          backgroundSize: "180px 180px",
        }}
      />

      {/* Ruled floor. Masked to nothing at the edges so it never meets a border. */}
      <div
        className="absolute inset-0 opacity-[0.5] dr-when-light:opacity-[0.6]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--color-line) 1px, transparent 1px), linear-gradient(to bottom, var(--color-line) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(90% 75% at 62% 42%, black 0%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(90% 75% at 62% 42%, black 0%, transparent 72%)",
        }}
      />

      <div
        ref={warm}
        className="absolute -top-[26%] -left-[12%] h-[68vw] max-h-[760px] w-[68vw] max-w-[760px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--color-accent) 11%, transparent) 0%, transparent 62%)",
          filter: "blur(60px)",
        }}
      />
      <div
        ref={cool}
        className="absolute -right-[18%] -bottom-[34%] h-[62vw] max-h-[700px] w-[62vw] max-w-[700px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--color-info) 12%, transparent) 0%, transparent 64%)",
          filter: "blur(70px)",
        }}
      />

      {/* Cursor spotlight. The centre is two custom properties so GSAP can tween
          numbers rather than rebuilding a gradient string every frame. */}
      {!reduced && (
        <div
          ref={spot}
          className="absolute inset-0 mix-blend-plus-lighter dr-when-light:mix-blend-multiply"
          style={
            {
              "--spot-x": "50",
              "--spot-y": "35",
              background:
                "radial-gradient(420px circle at calc(var(--spot-x) * 1%) calc(var(--spot-y) * 1%), color-mix(in oklab, var(--color-accent) 9%, transparent), transparent 70%)",
            } as React.CSSProperties
          }
        />
      )}

      {/* Sinks the bottom edge into the section below. */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
    </div>
  );
}
