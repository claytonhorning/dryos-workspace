"use client";

import { useSyncExternalStore } from "react";
import { categories, domains } from "@/lib/workspace/catalog";

/**
 * The domain you are working in — Energy, Weather, or everything at once.
 *
 * Chosen in the sidebar and kept per browser, the way the panel width is:
 * it is a setting about how you use the product, not a fact about your
 * account, and it has to be known before the shelf can say "your Energy
 * workspaces". `null` until it has been chosen, so the shelf can ask first
 * rather than guess. Nothing is filtered by it inside a page —
 * a page about energy is allowed to draw the weather.
 */

/** The value that means every domain at once. */
export const ALL = "all";

const KEY = "dryos.domain";

export type Subject = {
  id: string;
  label: string;
  blurb: string;
  /** Declared, not collected: shown as coming, never chosen. */
  next?: boolean;
};

/**
 * What can be chosen. The live domains come from the catalogue, each
 * described by its own categories so a card cannot promise a sector nobody
 * collects; Property is declared as next; Everything is the blend, stored as
 * `"all"` (the literal `spaces.ts` names `ALL_DOMAINS` — that module is
 * server-only).
 */
export const SUBJECTS: Subject[] = [
  ...domains().map((d) => ({ id: d, label: d, blurb: categories(d).join(" · ") })),
  {
    id: "Property",
    label: "Property",
    blurb: "Assessments · Transfers · Permits · Zoning",
    next: true,
  },
  {
    id: ALL,
    label: "Everything",
    blurb: "Every stream under one roof, for pages that cross domains.",
  },
];

export const CHOOSABLE = SUBJECTS.filter((s) => !s.next);

export function isDomain(d: string | null | undefined): d is string {
  return CHOOSABLE.some((s) => s.id === d);
}

/** "Energy", "Weather", or nothing at all for the blend — for a sentence. */
export function domainWord(d: string | null): string | null {
  return d && d !== ALL ? d : null;
}

/*
  A tiny external store rather than context + effect. The nav hydrates inside
  its own Suspense boundary, after the layout around it: a provider that
  read localStorage in an effect had already switched to "Energy" by the
  time the sidebar hydrated against HTML rendered for "unknown", and React
  threw the tree away. `useSyncExternalStore` is the mechanism for state
  the server cannot know — its server snapshot is what hydrates, and the
  client value arrives as an ordinary re-render afterwards.
*/
const listeners = new Set<() => void>();
/** `undefined` until localStorage has been read once. */
let cache: string | null | undefined;

function read(): string | null {
  if (cache === undefined) {
    try {
      const v = localStorage.getItem(KEY);
      cache = isDomain(v) ? v : null;
    } catch {
      cache = null;
    }
  }
  return cache;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = undefined;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function write(d: string) {
  if (!isDomain(d)) return;
  cache = d;
  try {
    localStorage.setItem(KEY, d);
  } catch {
    // Storage blocked: the choice lasts the tab.
  }
  listeners.forEach((l) => l());
}

const none = () => null;
const yes = () => true;
const no = () => false;

export function useDomain() {
  const domain = useSyncExternalStore(subscribe, read, none);
  /** False while hydrating — the server's answer — and true from the first
      client render, so a page can tell "unknown" from "not chosen". */
  const ready = useSyncExternalStore(subscribe, yes, no);
  return { domain, setDomain: write, ready };
}
