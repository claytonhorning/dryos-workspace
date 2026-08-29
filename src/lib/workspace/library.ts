import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ComponentSpec } from "./components";

/**
 * Components someone built and kept.
 *
 * A saved component is a whole spec — shape, data, settings, and the finished
 * source if it was refined — so adding it to a second dashboard produces exactly
 * what was seen in the editor. Storing the source rather than the recipe is the
 * only way that holds once a refinement is involved: nothing can reproduce an
 * agent's rewrite from `kind` and `options`.
 *
 * One JSON file, for the same reason the apps are files.
 */

const FILE = path.join(process.cwd(), ".workspace", "components.json");

export interface SavedComponent extends ComponentSpec {
  id: string;
  name: string;
  author: string;
  at: number;
}

export async function listSaved(): Promise<SavedComponent[]> {
  try {
    const all = JSON.parse(await fs.readFile(FILE, "utf8")) as SavedComponent[];
    return all.sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export async function saveComponent(
  spec: ComponentSpec,
  name: string,
): Promise<SavedComponent> {
  const all = await listSaved();
  const saved: SavedComponent = {
    ...spec,
    id: randomUUID().slice(0, 8),
    name,
    author: "you",
    at: Date.now(),
  };
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify([saved, ...all], null, 2), "utf8");
  return saved;
}

export async function deleteSaved(id: string): Promise<boolean> {
  const all = await listSaved();
  const next = all.filter((c) => c.id !== id);
  if (next.length === all.length) return false;
  await fs.writeFile(FILE, JSON.stringify(next, null, 2), "utf8");
  return true;
}
