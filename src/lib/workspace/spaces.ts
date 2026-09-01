import { randomUUID } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { importLocalOnce } from "./import";
import { deleteApp, listAppIds } from "./store";

/**
 * Workspaces: collections of pages.
 *
 * A screen was never really the top of the tree. People work on a subject — a
 * desk, a book, a morning — and that subject is several pages they flip between,
 * not one canvas they keep rearranging. So the workspace is the container, the
 * pages are its tabs, and a page is the dashboard that already existed.
 *
 * Pages are referenced by id rather than nested, because a page is still a whole
 * app in the store with its own history and manifest. Nothing about that shape
 * changed when the rows moved from `.workspace/spaces.json` into Supabase; what
 * changed is that a workspace now has an owner, and RLS makes every read and
 * write scoped to that owner without this module ever filtering by user.
 */

export interface Space {
  id: string;
  name: string;
  /** App ids, in tab order. */
  pages: string[];
  createdAt: number;
  updatedAt: number;
}

interface Row {
  id: string;
  name: string;
  pages: string[];
  created_at: number;
  updated_at: number;
}

const fromRow = (r: Row): Space => ({
  id: r.id,
  name: r.name,
  pages: r.pages,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toRow = (s: Space) => ({
  id: s.id,
  name: s.name,
  pages: s.pages,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
});

async function readAll(): Promise<Space[]> {
  const supabase = await supabaseServer();
  // Newest first — createSpace used to unshift into the file, and the shelf
  // still expects the latest workspace on top.
  const { data } = await supabase
    .from("workspaces")
    .select("id, name, pages, created_at, updated_at")
    .order("created_at", { ascending: false });
  return (data ?? []).map(fromRow);
}

async function writeAll(spaces: Space[]): Promise<void> {
  const supabase = await supabaseServer();
  const { error } = await supabase.from("workspaces").upsert(spaces.map(toRow));
  if (error) throw new Error(`could not save the workspace (${error.message})`);
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
  await importLocalOnce();
  // The sweep only ever needs ids. Loading full summaries here cost every
  // space operation the whole apps listing, on top of the one its route
  // usually does anyway.
  const [spaces_, appIds] = await Promise.all([readAll(), listAppIds()]);
  let spaces = spaces_;
  const now = Date.now();

  if (spaces.length === 0) {
    // Seeding is a first touch of a signed-in account. Signed out, the empty
    // read was legitimately empty — there is nobody to seed for, and the
    // write would only bounce off RLS and turn a quiet [] into a 500.
    const supabase = await supabaseServer();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return [];

    spaces = [
      {
        id: randomUUID().slice(0, 8),
        name: "My workspace",
        pages: [...appIds],
        createdAt: now,
        updatedAt: now,
      },
    ];
    await writeAll(spaces);
    return spaces;
  }

  const known = new Set(spaces.flatMap((s) => s.pages));
  const orphans = appIds.filter((id) => !known.has(id));
  const missing = new Set(appIds);

  // Deleted apps leave dangling ids behind; a tab pointing at nothing is worse
  // than no tab.
  const changed: Space[] = [];
  for (const s of spaces) {
    const kept = s.pages.filter((p) => missing.has(p));
    if (kept.length !== s.pages.length) {
      s.pages = kept;
      changed.push(s);
    }
  }
  if (orphans.length) {
    spaces[0].pages.push(...orphans);
    if (!changed.includes(spaces[0])) changed.push(spaces[0]);
  }
  if (changed.length) await writeAll(changed);

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
  await importLocalOnce();
  const now = Date.now();
  const space: Space = {
    id: randomUUID().slice(0, 8),
    name: name.trim() || "New workspace",
    pages: [],
    createdAt: now,
    updatedAt: now,
  };
  await writeAll([space]);
  return space;
}

export async function renameSpace(
  id: string,
  name: string,
): Promise<Space | null> {
  const spaces = await listSpaces();
  const space = spaces.find((s) => s.id === id);
  if (!space) return null;
  space.name = name.trim() || space.name;
  space.updatedAt = Date.now();
  await writeAll([space]);
  return space;
}

export async function addPage(
  id: string,
  pageId: string,
  at?: number,
): Promise<Space | null> {
  const spaces = await listSpaces();
  const space = spaces.find((s) => s.id === id);
  if (!space) return null;
  // Filed here rather than anywhere else, so a page created inside a workspace
  // never has to be rescued by the orphan sweep above.
  space.pages = space.pages.filter((p) => p !== pageId);
  space.pages.splice(at ?? space.pages.length, 0, pageId);
  space.updatedAt = Date.now();
  await writeAll([space]);
  return space;
}

export async function removePage(
  id: string,
  pageId: string,
): Promise<Space | null> {
  const spaces = await listSpaces();
  const space = spaces.find((s) => s.id === id);
  if (!space) return null;
  space.pages = space.pages.filter((p) => p !== pageId);
  space.updatedAt = Date.now();
  await writeAll([space]);
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
export async function deleteSpace(
  id: string,
): Promise<{ pages: number } | null> {
  const spaces = await listSpaces();
  const space = spaces.find((s) => s.id === id);
  if (!space) return null;

  const pages = space.pages.length;
  for (const pageId of space.pages) await deleteApp(pageId);
  const supabase = await supabaseServer();
  await supabase.from("workspaces").delete().eq("id", id);
  return { pages };
}

/**
 * Put the pages in a given order.
 *
 * Ids that are not in the workspace are ignored and ones left out are kept at
 * the end, so a stale list from a client that has not caught up rearranges what
 * it knows about instead of dropping the rest.
 */
export async function reorderPages(
  id: string,
  order: string[],
): Promise<Space | null> {
  const spaces = await listSpaces();
  const space = spaces.find((s) => s.id === id);
  if (!space) return null;

  const known = new Set(space.pages);
  const wanted = order.filter((p) => known.has(p));
  space.pages = [...wanted, ...space.pages.filter((p) => !wanted.includes(p))];
  space.updatedAt = Date.now();
  await writeAll([space]);
  return space;
}
