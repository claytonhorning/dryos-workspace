"use client";

import { useEffect, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

/**
 * One animation vocabulary for the whole page.
 *
 * Everything that moves — DOM and WebGL alike — pulls its timing from here, so
 * a section heading arriving and a batch crossing the ring are recognisably the
 * same hand. The rule for the scene is that a property has exactly one owner:
 * continuous motion (the globe's drift, a batch travelling its arc) stays in
 * three's frame loop, and anything discrete and authored (a spotlight move, a
 * node reacting to a hit, an entrance) is a GSAP tween. Both writing the same
 * property is the one way this arrangement breaks.
 */

let registered = false;
export function useAnimSetup() {
  if (typeof window !== "undefined" && !registered) {
    gsap.registerPlugin(ScrollTrigger, SplitText);
    registered = true;
  }
}

/** Entrances. Slightly overshooting, which is what reads as "sprung". */
export const EASE = "power3.out";
/** Anything that leaves, or travels a long way and settles. */
export const EASE_IO = "power3.inOut";

export const DUR = {
  quick: 0.34,
  base: 0.62,
  slow: 1.05,
  /** Camera and globe moves — long enough to follow with your eye. */
  travel: 1.5,
} as const;

/** Gap between staggered siblings. */
export const STAGGER = 0.07;

/**
 * Runs an entrance now, or when the page is first actually looked at.
 *
 * A `from` tween hides its target the instant it is created and only uncovers
 * it as the ticker runs — and the ticker is requestAnimationFrame, which a
 * browser starves in a background tab. Open the site in a new tab behind the
 * one you are reading and the hero would be sitting at opacity zero, waiting
 * for frames that are not coming.
 *
 * So nothing is hidden until there is somebody to hide it from. The entrance is
 * deferred to the first moment the document is visible, which is also the first
 * moment it could have been seen.
 */
export function whenVisible(run: () => void) {
  if (typeof document === "undefined") return () => {};
  if (!document.hidden) {
    run();
    return () => {};
  }
  const on = () => {
    if (document.hidden) return;
    document.removeEventListener("visibilitychange", on);
    run();
  };
  document.addEventListener("visibilitychange", on);
  return () => document.removeEventListener("visibilitychange", on);
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export { gsap, ScrollTrigger, SplitText };
