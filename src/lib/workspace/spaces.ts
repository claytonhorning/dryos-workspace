import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { deleteApp, listApps } from "./store";

/**
 * Workspaces: collections of pages.
 *
 * A screen was never really the top of the tree. People work on a subject — a
 * desk, a book, a morning — and that subject is several pages they flip between,
 * not one canvas they keep rearranging. So the workspace is the container, the
 * pages are its tabs, and a page is the dashboard that already existed.
 *
 * Pages are referenced by id rather than nested, because a page is still a whole
 * app on disk with its own history and manifest. Nothing about the file format
 * changed; what changed is that something now knows the order they belong in.
 */

const FILE = path.join(process.cwd(), ".workspace", "spaces.json");

export interface Space {
  id: string;
  name: string;
  /** App ids, in tab order. */
  pages: string[];
  createdAt: number;
  updatedAt: number;
}

async function readFile(): Promise<Space[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Space[];
  } catch {
    return [];
  }
}

async function writeFile(spaces: Space[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(spaces, null, 2), "utf8");
}

/**
 * Every workspace, with orphans adopted.
 *
 * Screens made before workspaces existed have no home, and so would a screen
 * created by any path that forgets to file it. Rather than let those become
 * unreachable, anything unclaimed joins the first workspace — a page in an
 * unexpected place is recoverable, a page nothing links to is not.
 */
export async function listSpaces(): Promise<Space[]> {
  let spaces = await readFile();
  const apps = await listApps();
  const now = Date.now();

  if (spaces.length === 0) {
    spaces = [
      {
        id: randomUUID().slice(0, 8),
        name: "My workspace",
        pages: apps.map((a) => a.id),
        createdAt: now,
        updatedAt: now,
      },
    ];
    await writeFile(spaces);
    return spaces;
  }

  const known = new Set(spaces.flatMap((s) => s.pages));
  const orphans = apps.filter((a) => !known.has(a.id)).map((a) => a.id);
  const missing = new Set(apps.map((a) => a.id));

  // Deleted apps leave dangling ids behind; a tab pointing at nothing is worse
  // than no tab.
  let changed = orphans.length > 0;
  for (const s of spaces) {
    const kept = s.pages.filter((p) => missing.has(p));
    if (kept.length !== s.pages.length) {
      s.pages = kept;
      changed = true;
    }
  }
  if (orphans.length) spaces[0].pages.push(...orphans);
  if (changed) await writeFile(spaces);

  return spaces;
}

export async function getSpace(id: string): Promise<Space | null> {
  return (await listSpaces()).find((s) => s.id === id) ?? null;
}

/** The workspace a page belongs to, for resolving a bare page link. */
export async function spaceOfPage(pageId: string): Promise<Space | null> {
  return (await listSpaces()).find((s) => s.pages.includes(pageId)) ?? null;
}

export async function createSpace(name: string): Promise<Space> {
  const spaces = await listSpaces();
  const now = Date.now();
  const space: Space = {
    id: randomUUID().slice(0, 8),
    name: name.trim() || "New workspace",
    pages: [],
    createdAt: now,
    updatedAt: now,
  };
  await writeFile([space, ...spaces]);
  return space;
}

export async function renameSpace(id: string, name: string): Promise<Space | null> {
  const spaces = await listSpaces();
  const space = spaces.find((s) => s.id === id);
  if (!space) return null;
  space.name = name.trim() || space.name;
  space.updatedAt = Date.now();
  await writeFile(spaces);
  return space;
}

export async function addPage(id: string, pageId: string, at?: number): Promise<Space | null> {
  const spaces = await listSpaces();
  const space = spaces.find((s) => s.id === id);
  if (!space) return null;
  // Filed here rather than anywhere else, so a page created inside a workspace
  // never has to be rescued by the orphan sweep above.
  space.pages = space.pages.filter((p) => p !== pageId);
  space.pages.splice(at ?? space.pages.length, 0, pageId);
  space.updatedAt = Date.now();
  await writeFile(spaces);
  return space;
}

export async function removePage(id: string, pageId: string): Promise<Space | null> {
  const spaces = await listSpaces();
  const space = spaces.find((s) => s.id === id);
  if (!space) return null;
  space.pages = space.pages.filter((p) => p !== pageId);
  space.updatedAt = Date.now();
  await writeFile(spaces);
  return space;
}

/**
 * Delete a workspace, and the pages in it.
 *
 * The pages go too, and that is the only honest option: they exist nowhere else,
 * and leaving them behind would mean the orphan sweep quietly filing someone's
 * deleted work into a different workspace. So the caller has to say how many
 * pages are about to go, and the dialog does.
 */
export async function deleteSpace(id: string): Promise<{ pages: number } | null> {
  const spaces = await listSpaces();
  const space = spaces.find((s) => s.id === id);
  if (!space) return null;

  const pages = space.pages.length;
  for (const pageId of space.pages) await deleteApp(pageId);
  await writeFile(spaces.filter((s) => s.id !== id));
  return { pages };
}


/**
 * Put the pages in a given order.
 *
 * Ids that are not in the workspace are ignored and ones left out are kept at
 * the end, so a stale list from a client that has not caught up rearranges what
 * it knows about instead of dropping the rest.
 */
export async function reorderPages(id: string, order: string[]): Promise<Space | null> {
  const spaces = await listSpaces();
  const space = spaces.find((s) => s.id === id);
  if (!space) return null;

  const known = new Set(space.pages);
  const wanted = order.filter((p) => known.has(p));
  space.pages = [...wanted, ...space.pages.filter((p) => !wanted.includes(p))];
  space.updatedAt = Date.now();
  await writeFile(spaces);
  return space;
}
