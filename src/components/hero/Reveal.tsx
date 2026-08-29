"use client";

import { useGSAP } from "@gsap/react";
import { useRef, type ReactNode } from "react";
import {
  DUR,
  EASE,
  STAGGER,
  SplitText,
  gsap,
  useAnimSetup,
  useReducedMotion,
  whenVisible,
} from "./anim";

/**
 * Entrance primitives.
 *
 * All three render their content as ordinary, visible markup and let GSAP set
 * the "from" state on the client. That ordering matters: nothing here is hidden
 * in the server HTML, so a visitor whose JavaScript never arrives reads a
 * finished page rather than a blank one.
 */

/**
 * A headline rising out of clipped lines.
 *
 * SplitText does the line measurement, which is the part worth having a library
 * for — lines depend on the final font and the final width, so the split has to
 * survive a webfont landing and the column changing size. `autoSplit` re-runs
 * it on both and replays through `onSplit`. `aria: "auto"` labels the heading
 * with its original text, so cutting it into per-line spans doesn't cost the
 * sentence to a screen reader.
 */
export function HeadlineReveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  useAnimSetup();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLHeadingElement>(null);

  useGSAP(
    () => {
      if (reduced || !ref.current) return;
      const el = ref.current;
      return whenVisible(() => {
        SplitText.create(el, {
          type: "lines",
          mask: "lines",
          aria: "auto",
          autoSplit: true,
          onSplit: (self) =>
            gsap.from(self.lines, {
              yPercent: 108,
              opacity: 0,
              duration: DUR.slow,
              ease: EASE,
              stagger: 0.09,
              delay,
            }),
        });
      });
    },
    { scope: ref, dependencies: [reduced, delay] },
  );

  return (
    <h1 ref={ref} className={className}>
      {children}
    </h1>
  );
}

/** A block that lifts into place — on mount, or when it scrolls into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 14,
  when = "mount",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  when?: "mount" | "view";
}) {
  useAnimSetup();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (reduced || !ref.current) return;
      const el = ref.current;
      return whenVisible(() =>
        gsap.from(el, {
          opacity: 0,
          y,
          duration: DUR.base,
          ease: EASE,
          delay: when === "mount" ? delay : 0,
          scrollTrigger:
            when === "view" ? { trigger: el, start: "top 88%", once: true } : undefined,
        }),
      );
    },
    { scope: ref, dependencies: [reduced, delay, y, when] },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/**
 * Staggers its own element children as the group scrolls in.
 *
 * The children stay plain markup — no per-item wrapper component — because GSAP
 * can address them directly and a list should not have to know it is being
 * animated.
 */
export function RevealGroup({
  children,
  className,
  y = 18,
}: {
  children: ReactNode;
  className?: string;
  y?: number;
}) {
  useAnimSetup();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (reduced || !ref.current) return;
      const el = ref.current;
      return whenVisible(() =>
        gsap.from(Array.from(el.children), {
          opacity: 0,
          y,
          duration: DUR.base,
          ease: EASE,
          stagger: STAGGER,
          scrollTrigger: { trigger: el, start: "top 86%", once: true },
        }),
      );
    },
    { scope: ref, dependencies: [reduced, y] },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
