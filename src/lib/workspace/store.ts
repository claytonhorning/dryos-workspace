import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ComponentSpec } from "./components";
import type { App, AppSummary, Revision } from "./types";

/**
 * File-backed app storage.
 *
 * One JSON file per app under `.workspace/`. A database would be more correct
 * and less useful right now — the whole point of this proof of concept is to
 * find out whether the loop feels right, and being able to open an app in an
 * editor, diff two of them, or delete the lot with `rm -rf` is worth more at
 * this stage than referential integrity.
 */

const ROOT = path.join(process.cwd(), ".workspace", "apps");

async function ensureRoot() {
  await fs.mkdir(ROOT, { recursive: true });
}

function file(id: string) {
  return path.join(ROOT, `${id}.json`);
}

export async function listApps(): Promise<AppSummary[]> {
  await ensureRoot();
  const names = (await fs.readdir(ROOT)).filter((n) => n.endsWith(".json"));
  const apps = await Promise.all(
    names.map(async (n) => {
      const app = JSON.parse(await fs.readFile(path.join(ROOT, n), "utf8")) as App;
      return {
        id: app.id,
        name: app.name,
        template: app.template,
        updatedAt: app.updatedAt,
        revisions: app.history.length,
        authors: [...new Set(app.history.map((r) => r.author))],
        forkedFrom: app.forkedFrom,
        sharedBy: app.sharedBy,
      };
    }),
  );
  return apps.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getApp(id: string): Promise<App | null> {
  await ensureRoot();
  try {
    return JSON.parse(await fs.readFile(file(id), "utf8")) as App;
  } catch {
    return null;
  }
}

async function write(app: App) {
  await ensureRoot();
  await fs.writeFile(file(app.id), JSON.stringify(app, null, 2), "utf8");
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
export async function revertTo(id: string, revisionId: string): Promise<App | null> {
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
  try {
    await fs.unlink(file(id));
    return true;
  } catch {
    return false;
  }
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
  from: number,
  to: number,
  compose: (manifest: ComponentSpec[]) => string,
  build?: Build,
): Promise<App | null> {
  const app = await getApp(id);
  if (!app?.manifest?.[from]) return null;

  const manifest = [...app.manifest];
  const [moved] = manifest.splice(from, 1);
  // Removing the tile shifts everything after it down one, so a destination
  // past the origin has to come back by one to land where it was aimed.
  manifest.splice(to > from ? to - 1 : to, 0, moved);

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

  return regenerate(
    app,
    app.manifest.map((c, i) => (i === index ? { ...c, layout } : c)),
    compose,
    build,
  );
}
