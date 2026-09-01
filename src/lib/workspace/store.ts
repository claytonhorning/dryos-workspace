import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { importLocalOnce } from "./import";
import { type ComponentSpec, packLayout } from "./components";
import type { App, AppSummary, Revision } from "./types";

/**
 * App storage, in Supabase.
 *
 * This replaced one JSON file per app under `.workspace/`. The files were the
 * right call while the question was whether the loop feels right; the moment
 * accounts existed, "whose workspace is this?" had no answer a filesystem
 * could give. The shape survived the move intact: each row's `data` column is
 * the whole App object, verbatim — the file went into a column, not into a
 * schema — so everything downstream still reads and writes complete apps.
 *
 * Row-level security does the scoping. Every query runs with the caller's own
 * session token, so this module never filters by user: a user who asks for an
 * app they do not own gets nothing, enforced in the database rather than in
 * whichever of these functions remembered to check.
 */

async function db() {
  await importLocalOnce();
  return supabaseServer();
}

export async function listApps(): Promise<AppSummary[]> {
  const supabase = await db();
  // `app_summaries` computes these fields in Postgres (security_invoker, so the
  // apps table's RLS still decides what exists). Selecting `data` here shipped
  // every app's full source and revision history — most of a megabyte for a
  // shelf that renders eight fields per card — on every list, and the list is
  // under every space operation.
  const { data } = await supabase
    .from("app_summaries")
    .select("id, name, template, updatedAt, revisions, authors, forkedFrom, sharedBy")
    .order("updated_at", { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    template: r.template as string,
    updatedAt: r.updatedAt as number,
    revisions: r.revisions as number,
    authors: (r.authors ?? []) as string[],
    forkedFrom: (r.forkedFrom ?? undefined) as AppSummary["forkedFrom"],
    sharedBy: (r.sharedBy ?? undefined) as AppSummary["sharedBy"],
  }));
}

/** Just the ids — all the orphan sweep needs to know about the store. */
export async function listAppIds(): Promise<string[]> {
  const supabase = await db();
  const { data } = await supabase.from("apps").select("id");
  return (data ?? []).map((r) => r.id as string);
}

/**
 * An app for the sandbox frame, which cannot say who it is.
 *
 * The frame runs in an opaque origin, so its document and script requests
 * carry no cookies and RLS sees nobody. This reads through the `app_bundle`
 * function instead — security definer, exact id only — which keeps the bundle
 * URL what it always was: a capability held by whoever has the link. Every
 * other read in this file stays owner-scoped.
 */
export async function getAppForFrame(id: string): Promise<App | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  const { data } = await supabase.rpc("app_bundle", { p_id: id });
  return (data as App | null) ?? null;
}

export async function getApp(id: string): Promise<App | null> {
  const supabase = await db();
  const { data } = await supabase
    .from("apps")
    .select("data")
    .eq("id", id)
    .maybeSingle();
  return (data?.data as App) ?? null;
}

async function write(app: App) {
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("apps")
    .upsert({ id: app.id, data: app, updated_at: app.updatedAt });
  // Signed out (or RLS refusing) must fail loudly: pretending a save happened
  // and returning the app would lose work the moment the tab closed.
  if (error) throw new Error(`could not save the page (${error.message})`);
  return app;
}

export async function createApp(input: {
  name: string;
  template: string;
  source: string;
  manifest?: ComponentSpec[];
  forkedFrom?: App;
}): Promise<App> {
  const now = Date.now();
  const app: App = {
    id: randomUUID().slice(0, 8),
    name: input.name,
    template: input.template,
    source: input.source,
    manifest: input.manifest,
    createdAt: now,
    updatedAt: now,
    forkedFrom: input.forkedFrom
      ? { appId: input.forkedFrom.id, appName: input.forkedFrom.name }
      : undefined,
    history: [
      {
        id: randomUUID().slice(0, 8),
        intent: input.forkedFrom
          ? `Forked from ${input.forkedFrom.name}`
          : `Started from the ${input.template} template`,
        source: input.source,
        manifest: input.manifest,
        author: "you",
        at: now,
      },
    ],
  };
  await db();
  return write(app);
}

export async function addRevision(
  id: string,
  revision: Omit<Revision, "id" | "at">,
): Promise<App | null> {
  const app = await getApp(id);
  if (!app) return null;
  const now = Date.now();
  app.history.unshift({ ...revision, id: randomUUID().slice(0, 8), at: now });
  app.source = revision.source;
  // Absent means "a model wrote this" — the app leaves composed mode and stays
  // out of it, because nothing can reconstruct a manifest from edited source.
  app.manifest = revision.manifest;
  app.updatedAt = now;
  return write(app);
}

/**
 * Rewind to a revision.
 *
 * Recorded as a new revision rather than by truncating history — an agent will
 * break something eventually, and the way back has to be as inspectable as the
 * way forward.
 */
export async function revertTo(
  id: string,
  revisionId: string,
): Promise<App | null> {
  const app = await getApp(id);
  if (!app) return null;
  const target = app.history.find((r) => r.id === revisionId);
  if (!target) return null;
  return addRevision(id, {
    intent: `Reverted to “${target.intent}”`,
    source: target.source,
    // Rewinding restores the manifest that produced that source, so an app can
    // return to composed mode by going back to a revision that was composed.
    manifest: target.manifest,
    author: "you",
  });
}

export async function renameApp(id: string, name: string): Promise<App | null> {
  const app = await getApp(id);
  if (!app) return null;
  app.name = name;
  app.updatedAt = Date.now();
  return write(app);
}

export async function deleteApp(id: string): Promise<boolean> {
  const supabase = await db();
  const { count } = await supabase
    .from("apps")
    .delete({ count: "exact" })
    .eq("id", id);
  return (count ?? 0) > 0;
}

/**
 * Move a tile, without writing a revision.
 *
 * Same reasoning as a resize: arranging a dashboard is a dozen small gestures
 * and none of them is a change anyone wants to read back later. `updatedAt` is
 * deliberately untouched so the frame does not remount mid-arrangement.
 */
export async function moveTile(
  id: string,
  index: number,
  to: { x: number; y: number },
  swap: { index: number; x: number; y: number } | null,
  compose: (manifest: ComponentSpec[]) => string,
  build?: Build,
): Promise<App | null> {
  const app = await getApp(id);
  if (!app?.manifest?.[index]) return null;

  // Freeze everyone's place before moving one. That is what makes a move a
  // move: from here on no tile's position is implied by another's, so the ones
  // nobody dragged stay exactly where they were and the hole left behind is
  // allowed to stay a hole.
  const packed = packLayout(app.manifest);
  const at = (i: number, p: { x: number; y: number }) => ({
    ...packed[i],
    layout: { ...packed[i].layout!, x: p.x, y: p.y },
  });

  const manifest = packed.map((spec, i) =>
    i === index ? at(i, to) : swap && i === swap.index ? at(i, swap) : spec,
  );

  return regenerate(app, manifest, compose, build);
}

/** How a caller compiles. Kept as a parameter so this file imports no esbuild. */
type Build = (source: string) => Promise<{ js?: string; error?: string }>;

/**
 * Rewrite the source from the manifest, and refuse to save it if it will not run.
 *
 * The manifest built once, which is what made it tempting to skip the gate here —
 * but the *generator* changes between writes, and a rearrangement is the moment
 * a stale one gets baked into someone's page. It shipped broken exactly that way.
 * Everything else in this codebase stages, validates and promotes; so does this.
 */
async function regenerate(
  app: App,
  manifest: ComponentSpec[],
  compose: (manifest: ComponentSpec[]) => string,
  build?: Build,
): Promise<App | null> {
  const source = compose(manifest);

  if (build) {
    const built = await build(source);
    if (!built.js) return null;
  }

  app.manifest = manifest;
  app.source = source;
  if (app.history[0]) {
    app.history[0].manifest = manifest;
    app.history[0].source = source;
  }
  return write(app);
}

/**
 * Resize a tile, without writing a revision.
 *
 * Dragging a corner is not a change worth recording — a dozen of them while
 * someone settles on a size would bury the history that matters under noise. So
 * the head revision is amended in place and `updatedAt` is deliberately left
 * alone, which also keeps the preview frame from remounting under the cursor
 * mid-drag.
 */
export async function setLayout(
  id: string,
  index: number,
  layout: { w: number; h: number },
  compose: (manifest: ComponentSpec[]) => string,
  build?: Build,
): Promise<App | null> {
  const app = await getApp(id);
  if (!app?.manifest?.[index]) return null;

  // Same freeze as a move, and for the same reason: a resize must not be the
  // thing that decides where anybody else sits.
  const packed = packLayout(app.manifest);

  return regenerate(
    app,
    packed.map((c, i) => (i === index ? { ...c, layout: { ...c.layout!, ...layout } } : c)),
    compose,
    build,
  );
}

/**
 * Remove a tile, as a revision.
 *
 * Unlike a resize this is destructive, so it goes into history the way any
 * other change does — revert is the undo, and the history line says what left
 * the page. Only a composed app can do it: nothing can splice one section out
 * of source a model rewrote.
 */
export async function removeTile(
  id: string,
  index: number,
  intent: string,
  compose: (manifest: ComponentSpec[]) => string,
  build?: Build,
): Promise<App | null> {
  const app = await getApp(id);
  if (!app?.manifest?.[index]) return null;

  const manifest = app.manifest.filter((_, i) => i !== index);
  const source = compose(manifest);
  if (build) {
    const built = await build(source);
    if (!built.js) return null;
  }
  return addRevision(id, { intent, source, manifest, author: "you" });
}
