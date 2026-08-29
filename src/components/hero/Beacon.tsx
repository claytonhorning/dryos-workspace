"use client";

import { useGSAP } from "@gsap/react";
import { useRef } from "react";
import { gsap, useReducedMotion } from "./anim";

/** A dot with a ring going out of it. Used wherever something is live. */
export function Beacon() {
  const ring = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      if (reduced || !ring.current) return;
      gsap.fromTo(
        ring.current,
        { scale: 1, opacity: 0.75 },
        { scale: 2.8, opacity: 0, duration: 2, ease: "power2.out", repeat: -1 },
      );
    },
    { dependencies: [reduced] },
  );

  return (
    <span className="relative flex h-1.5 w-1.5">
      <span ref={ring} className="absolute inset-0 rounded-full bg-accent" />
      <span className="relative h-1.5 w-1.5 rounded-full bg-accent" />
    </span>
  );
}
