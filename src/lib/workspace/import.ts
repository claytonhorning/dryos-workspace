import { promises as fs } from "node:fs";
import path from "node:path";
import { supabaseServer } from "@/lib/supabase/server";
import type { App } from "./types";

/**
 * The one-time adoption of `.workspace/` into an account.
 *
 * Everything built before accounts existed lives in local JSON files that
 * belong to "this machine". The first time a signed-in user touches the store,
 * whatever those files hold becomes theirs — apps, workspaces, saved
 * components, the usage ledger — and a marker file records that this user has
 * had their import, so emptying the account later does not resurrect it.
 *
 * The files are read, never deleted: they stay as the on-disk backup they
 * always were, and a second account on the same machine gets its own copy —
 * composite (user_id, id) keys mean the ids never collide.
 *
 * Every failure here is swallowed after a console line. Import is a courtesy;
 * a request must never fail because a three-week-old JSON file went stale.
 */

const ROOT = path.join(process.cwd(), ".workspace");
const MARKERS = path.join(ROOT, ".imported");

/** Users this process has already settled, so the check costs one query ever. */
const settled = new Set<string>();
const inFlight = new Map<string, Promise<void>>();

export async function importLocalOnce(): Promise<void> {
  try {
    const supabase = await supabaseServer();
    // getSession, not getUser: this runs on every store call, and reading the
    // cookie locally is free where getUser is a round trip to the auth
    // server. The identity is only deciding whether to *attempt* an import —
    // the writes themselves are still RLS-checked against a verified token.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user.id;
    if (!userId || settled.has(userId)) return;

    const running = inFlight.get(userId) ?? run(userId);
    inFlight.set(userId, running);
    await running;
  } catch {
    // Signed out, or Supabase unreachable — nothing to adopt into.
  }
}

async function run(userId: string): Promise<void> {
  try {
    // No seed directory — a deployed instance, or a fresh clone. Nothing to
    // adopt, and a deployed filesystem is read-only, so the marker write below
    // would only ever log a warning per user.
    if (!(await exists(ROOT))) return;

    const marker = path.join(MARKERS, userId);
    if (await exists(marker)) return;

    const supabase = await supabaseServer();
    // Anything already in the account means this is not a first touch — a
    // user who deleted their imported pages must not get them back.
    // A failed count is not an empty account: the upsert below would write
    // the local files' filings over the account's own.
    const { count, error } = await supabase
      .from("workspaces")
      .select("id", { count: "exact", head: true });
    if (error || (count ?? 0) > 0) return;

    const apps = await readApps();
    const spaces = await readJson<
      {
        id: string;
        name: string;
        pages: string[];
        createdAt: number;
        updatedAt: number;
      }[]
    >(path.join(ROOT, "spaces.json"));
    const components = await readJson<{ id: string; at?: number }[]>(
      path.join(ROOT, "components.json"),
    );
    const usage = await readUsage();

    if (apps.length) {
      await supabase
        .from("apps")
        .upsert(
          apps.map((a) => ({ id: a.id, data: a, updated_at: a.updatedAt })),
        );
    }
    if (spaces?.length) {
      await supabase.from("workspaces").upsert(
        spaces.map((s) => ({
          id: s.id,
          name: s.name,
          pages: s.pages,
          created_at: s.createdAt,
          updated_at: s.updatedAt,
        })),
      );
    }
    if (components?.length) {
      await supabase
        .from("components")
        .upsert(
          components.map((c) => ({
            id: c.id,
            data: c,
            at: c.at ?? Date.now(),
          })),
        );
    }
    if (usage.length) {
      await supabase.from("usage_entries").upsert(usage);
    }

    await fs.mkdir(MARKERS, { recursive: true });
    await fs.writeFile(marker, new Date().toISOString(), "utf8");
    if (apps.length || spaces?.length) {
      console.log(
        `[workspace] adopted local files into account ${userId}: ` +
          `${apps.length} pages, ${spaces?.length ?? 0} workspaces`,
      );
    }
  } catch (err) {
    console.warn(`[workspace] local import skipped:`, err);
  } finally {
    settled.add(userId);
    inFlight.delete(userId);
  }
}

async function readApps(): Promise<App[]> {
  try {
    const dir = path.join(ROOT, "apps");
    const names = (await fs.readdir(dir)).filter((n) => n.endsWith(".json"));
    const apps = await Promise.all(
      names.map(
        async (n) =>
          JSON.parse(await fs.readFile(path.join(dir, n), "utf8")) as App,
      ),
    );
    return apps;
  } catch {
    return [];
  }
}

/** The ledger file, in either of its historical shapes, as table rows. */
async function readUsage() {
  interface Entry {
    queries: number;
    rows: number;
    tokens: number;
  }
  const raw = await readJson<{
    days?: Record<string, Record<string, Entry | Record<string, Entry>>>;
  }>(path.join(ROOT, "usage.json"));

  // Summed into a map first: a day recorded under both historical shapes
  // would otherwise put the same (day, screen, schema) key into one upsert
  // batch twice, which PostgREST refuses whole.
  const merged = new Map<
    string,
    { day: string; app_id: string; schema_id: string } & Entry
  >();
  for (const [day, contents] of Object.entries(raw?.days ?? {})) {
    for (const [key, value] of Object.entries(contents)) {
      const isEntry = typeof (value as Entry).queries === "number";
      // Pre-attribution rows were day → schema with no screen between; they
      // are real spending and land under the unattributed screen.
      const perSchema = isEntry
        ? { [key]: value as Entry }
        : (value as Record<string, Entry>);
      const appId = isEntry ? "-" : key;
      for (const [schemaId, e] of Object.entries(perSchema)) {
        const k = `${day}|${appId}|${schemaId}`;
        const row = merged.get(k) ?? {
          day,
          app_id: appId,
          schema_id: schemaId,
          queries: 0,
          rows: 0,
          tokens: 0,
        };
        row.queries += e.queries;
        row.rows += e.rows;
        row.tokens += e.tokens;
        merged.set(k, row);
      }
    }
  }
  return [...merged.values()];
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
