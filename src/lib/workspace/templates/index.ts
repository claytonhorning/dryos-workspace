import { promises as fs } from "node:fs";
import path from "node:path";
import { composeApp } from "../compose";

/**
 * Starting points.
 *
 * Kept as `.txt` beside this file rather than as importable modules, because
 * they are *content* — text an agent rewrites — not code this app runs. Naming
 * them `.tsx` would put them in the type-check and lint passes for a project
 * they are never compiled into.
 */

export interface Template {
  slug: string;
  name: string;
  blurb: string;
  /** Absent on a composed start, which has no file to read. */
  file?: string;
  /** Who published it. Dryos for now; the shelf is meant to take others. */
  author: string;
  /**
   * Starts in composed mode: an empty manifest, so typed components can be
   * added to it without a model. The hand-written templates cannot, because
   * nothing can describe their source as a list of components.
   */
  composed?: boolean;
}

/**
 * An empty screen, started from nothing.
 *
 * Not on the shelf — starting blank is an action, not a thing to browse past
 * three times a day — so it lives on the "Create new" button instead and is
 * looked up by slug when that button is pressed.
 */
export const BLANK: Template = {
  slug: "compose",
  name: "Untitled screen",
  blurb: "Empty. Pick data, drop a shape, arrange it.",
  author: "you",
  composed: true,
};

export const TEMPLATES: Template[] = [
  {
    slug: "hub-monitor",
    name: "Hub monitor",
    blurb: "Live prices at every ERCOT trading hub, ranked, with the spread to the average.",
    file: "hub-monitor.tsx.txt",
    author: "Dryos",
  },
  {
    slug: "hub-spread",
    name: "Hub spread",
    blurb: "The spread between any two settlement points over 12 hours, with an alert threshold.",
    file: "hub-spread.tsx.txt",
    author: "Dryos",
  },
  {
    slug: "price-shape",
    name: "Price shape",
    blurb: "A day of prices at one node, with the cheapest and dearest windows called out.",
    file: "price-shape.tsx.txt",
    author: "Dryos",
  },
];

export async function templateSource(slug: string): Promise<string | null> {
  const t = slug === BLANK.slug ? BLANK : TEMPLATES.find((x) => x.slug === slug);
  if (!t) return null;
  if (t.composed || !t.file) return composeApp([]);
  const p = path.join(process.cwd(), "src", "lib", "workspace", "templates", t.file);
  return fs.readFile(p, "utf8");
}
