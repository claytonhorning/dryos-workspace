import { supabaseServer } from "@/lib/supabase/server";
import type { ComponentSpec } from "./components";

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
