import { supabaseServer } from "@/lib/supabase/server";
import { packLayout, type ComponentSpec } from "./components";
import { composeApp } from "./compose";
import { compile } from "./runtime";
import { addPage, createSpace } from "./spaces";
import { createApp } from "./store";
import { BLANK } from "./templates";

/**
 * Community workspaces: ordinary workspaces with `community` set.
 *
 * The flag is a column on `workspaces`, and only Dryos sets it — a trigger
 * refuses it from a signed-in owner, because a flag any owner could set would
 * put anyone's workspace on everyone's shelf. What is published is the live
 * workspace, not a snapshot of it: an edit to one of its pages is what the
 * next copy takes.
 *
 * Both reads are security-definer functions in the database
 * (`community_workspaces`, `community_page`, migration `workspaces_community`),
 * since RLS keeps every other row to its owner. They hand out names and
 * manifests, never a page's source or its history.
 */

export interface CommunitySpace {
  id: string;
  name: string;
  domain?: string;
  pages: { id: string; name: string; updatedAt: number }[];
}

export async function listCommunitySpaces(): Promise<CommunitySpace[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("community_workspaces");
  if (error) throw new Error(error.message);
  return (data as CommunitySpace[] | null) ?? [];
}

/** A page of a community workspace — null for a page in none. */
export async function getCommunityPage(
  id: string,
): Promise<{ name: string; manifest?: ComponentSpec[] } | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("community_page", { p_id: id });
  if (error) throw new Error(error.message);
  return (data as { name: string; manifest?: ComponentSpec[] } | null) ?? null;
}

/** Why a copy was refused, with the status the pages route answers it with. */
export class CommunityCopyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * One page of a community workspace, copied into one of the user's own: its
 * manifest — the tiles, not the source or the history, which stay the
 * publisher's — composed fresh, so it runs today's generator and passes
 * today's compile gate. A page that does not build is not saved.
 */
export async function copyCommunityPage(
  spaceId: string,
  pageId: string,
  opts: { name?: string; at?: number } = {},
) {
  const shared = await getCommunityPage(pageId);
  if (!shared) throw new CommunityCopyError("No such community page.", 404);
  if (!shared.manifest) {
    throw new CommunityCopyError("That page was edited by a model and cannot be copied.", 422);
  }
  const placed = packLayout(shared.manifest);
  const source = composeApp(placed);
  const built = await compile(source);
  if (!built.js) throw new CommunityCopyError(`The page did not compile: ${built.error}`, 500);
  const app = await createApp({ name: opts.name ?? shared.name, template: BLANK.slug, source, manifest: placed });
  await addPage(spaceId, app.id, opts.at);
  return app;
}

/**
 * A whole community workspace, copied: a workspace of the user's own under its
 * name (or the one given) and domain, holding a copy of every page in order.
 * What the workspace MCP server's `copy_community` does; the shelf's Make a
 * copy is the same thing driven page by page from the browser.
 */
export async function copyCommunityWorkspace(id: string, name?: string) {
  const shared = (await listCommunitySpaces()).find((s) => s.id === id);
  if (!shared) throw new CommunityCopyError(`No community workspace "${id}".`, 404);
  const space = await createSpace(name?.trim() || shared.name, shared.domain);
  const pages: Awaited<ReturnType<typeof copyCommunityPage>>[] = [];
  for (const p of shared.pages) pages.push(await copyCommunityPage(space.id, p.id));
  return { space, pages };
}
