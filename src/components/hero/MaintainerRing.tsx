"use client";

import { useEffect, useRef, useState } from "react";
import {
  gsap,
  useAnimSetup,
  useReducedMotion,
} from "./anim";
import { cx } from "@/components/ui";

/**
 * The hero panel: the people, revolving.
 *
 * It replaced a running dashboard. The product is the marketplace before it is
 * the workspace, and a marketplace is people — the maintainers whose time the
 * invoice pays for, the economist whose argument the invoice is, and the two
 * who wrote the cheque. Six portraits on a ring; the ring turns one place every
 * few seconds and whoever is at the top is named in the middle.
 *
 * Every arm on the ring is rotated statically to its own angle, the ring is
 * the one thing GSAP turns, and each portrait is counter-rotated by the sum so
 * it stays upright. The rotation is cumulative rather than modular so a step
 * from the last person to the first is one more sixth of a turn forward, never
 * a spin back through five.
 *
 * The three maintainers are placeholders with placeholder portraits. An entry
 * without a `src` shows initials; that is the only fallback, because a missing
 * file cannot fall back at runtime — the image errors before React hydrates,
 * so an `onError` handler is attached to a failure that has already happened.
 */
type Person = {
  name: string;
  role: string;
  blurb: string;
  /** Absent until there is a photograph; initials stand in. */
  src?: string;
  initials: string;
};

const PEOPLE: Person[] = [
  {
    name: "Marcus Delgado",
    role: "Energy data maintainer",
    blurb:
      "ERCOT prices, ancillary services and load. Knows which report drops its repeated-hour flag.",
    src: "/landing/people/energy.jpg",
    initials: "MD",
  },
  {
    name: "Hannah Okafor",
    role: "Weather data maintainer",
    blurb:
      "NWS observations and forecasts. Knows which null means the station said nothing.",
    src: "/landing/people/weather.jpg",
    initials: "HO",
  },
  {
    name: "Tomás Rivera",
    role: "Property data maintainer",
    blurb:
      "County rolls, transfers and permits, one schema per county. Coming next.",
    src: "/landing/people/property.jpg",
    initials: "TR",
  },
  {
    name: "Adam Smith",
    role: "Pioneer of free markets",
    blurb: "Not a maintainer. But a hell of a guy.",
    src: "/landing/people/adam-smith.jpg",
    initials: "AS",
  },
  {
    name: "Zach Hay",
    role: "Investor and account manager",
    blurb:
      "Your call about the broken feed goes to the maintainer. Your call about anything else goes here.",
    src: "/landing/people/zach-hay.png",
    initials: "ZH",
  },
  {
    name: "Cameron Horning",
    role: "Investor and account manager",
    blurb: "Pictured. Will pick up.",
    src: "/landing/people/cameron-horning.png",
    initials: "CH",
  },
];

const N = PEOPLE.length;
const STEP = 360 / N;
/** Distance from the ring's centre to a portrait's centre, in px. */
const RADIUS = 118;
const DWELL = 3400;

export function MaintainerRing() {
  useAnimSetup();
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const ring = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const faces = useRef<(HTMLButtonElement | null)[]>([]);
  const angle = useRef(0);
  const prev = useRef(0);

  useEffect(() => {
    if (paused || reduced) return;
    const t = setInterval(
      () => setI((n) => (n + 1) % N),
      DWELL,
    );
    return () => clearInterval(t);
  }, [paused, reduced]);

  useEffect(() => {
    // Always forward: a jump of k places is k sixths of a turn the same way.
    const steps = (i - prev.current + N) % N;
    prev.current = i;
    angle.current -= steps * STEP;
    const a = angle.current;
    const dur = reduced ? 0 : 0.9;
    const ease = "power3.inOut";

    if (ring.current)
      gsap.to(ring.current, {
        rotate: a,
        duration: dur,
        ease,
      });
    faces.current.forEach((el, k) => {
      if (!el) return;
      const active = k === i;
      gsap.to(el, {
        rotate: -(a + k * STEP),
        scale: active ? 1.35 : 1,
        opacity: active ? 1 : 0.55,
        duration: dur,
        ease,
      });
    });
    if (card.current) {
      gsap.fromTo(
        card.current,
        { opacity: 0, y: 6 },
        {
          opacity: 1,
          y: 0,
          duration: reduced ? 0 : 0.45,
          ease: "power3.out",
          delay: reduced ? 0 : 0.25,
        },
      );
    }
  }, [i, reduced]);

  const p = PEOPLE[i];

  return (
    // No card around it. The dashboard it replaced needed a frame to read as
    // a screen; people on a ring read as themselves, and a box would only say
    // "widget" about something that is not one.
    <div
      className="flex flex-col items-center"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative aspect-square w-full max-w-[360px]">
        <div ref={ring} className="absolute inset-0">
          {PEOPLE.map((person, k) => (
            <div
              key={person.name}
              className="absolute top-1/2 left-1/2"
              style={{
                transform: `rotate(${k * STEP}deg) translateY(-${RADIUS}px)`,
              }}
            >
              <button
                ref={(el) => {
                  faces.current[k] = el;
                }}
                type="button"
                aria-label={`${person.name}, ${person.role}`}
                aria-pressed={k === i}
                onClick={() => setI(k)}
                className={cx(
                  "-mt-8 -ml-8 block h-16 w-16 rounded-full border-2 bg-surface-2 transition-colors",
                  k === i
                    ? "border-accent"
                    : "border-line-strong hover:border-muted",
                )}
              >
                <Face person={person} />
              </button>
            </div>
          ))}
        </div>

        {/* Whoever is at the top, named in the middle. */}
        <div
          ref={card}
          className="absolute inset-0 flex flex-col items-center justify-center px-14 text-center"
        >
          <div className="font-mono text-[10px] tracking-[0.14em] text-accent uppercase">
            {p.role}
          </div>
          <div className="mt-1.5 text-[17px] leading-tight font-semibold text-ink">
            {p.name}
          </div>
        </div>
      </div>

      <p className="mt-2 min-h-[3lh] max-w-[36ch] text-center text-[12.5px] leading-relaxed text-muted">
        {p.blurb}
      </p>
    </div>
  );
}

/** A portrait, or initials until there is one. */
function Face({ person }: { person: Person }) {
  if (!person.src) {
    return (
      <span className="flex h-full w-full items-center justify-center rounded-full font-mono text-[15px] font-semibold tracking-tight text-muted">
        {person.initials}
      </span>
    );
  }
  return (
    // A plain `img`: six 64px circles are not worth the optimiser's srcset, and
    // a portrait that arrives later should only need a file and a `src`.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={person.src}
      alt=""
      draggable={false}
      className="h-full w-full rounded-full object-cover"
    />
  );
}
