import { randomUUID } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { importLocalOnce } from "./import";
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
 * One row per component with the spec as jsonb, owned by its author via RLS —
 * the library is personal, which is also what makes it shareable later: a
 * shared component would be someone else's row made visible, not a merge of
 * two files.
 */

export interface SavedComponent extends ComponentSpec {
  id: string;
  name: string;
  author: string;
  at: number;
}

export async function listSaved(): Promise<SavedComponent[]> {
  await importLocalOnce();
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("components")
    .select("data")
    .order("at", { ascending: false });
  return (data ?? []).map((r) => r.data as SavedComponent);
}

/** One saved component, for the preview route that runs it by id. */
export async function getSaved(id: string): Promise<SavedComponent | null> {
  await importLocalOnce();
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("components")
    .select("data")
    .eq("id", id)
    .maybeSingle();
  return (data?.data as SavedComponent) ?? null;
}

export async function saveComponent(
  spec: ComponentSpec,
  name: string,
): Promise<SavedComponent> {
  const saved: SavedComponent = {
    ...spec,
    id: randomUUID().slice(0, 8),
    name,
    author: "you",
    at: Date.now(),
  };
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("components")
    .upsert({ id: saved.id, data: saved, at: saved.at });
  if (error) throw new Error(`could not save the component (${error.message})`);
  return saved;
}

export async function deleteSaved(id: string): Promise<boolean> {
  const supabase = await supabaseServer();
  const { count } = await supabase
    .from("components")
    .delete({ count: "exact" })
    .eq("id", id);
  return (count ?? 0) > 0;
}
