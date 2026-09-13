// Seeds a composed page into somebody's Dryos account, for testing a dashboard
// or a component on live data without a browser session. The workflow — which
// user, how to check it and clean up — is .claude/skills/seed-page/SKILL.md.
// Run through ./run.sh, never directly.
//
// It does what the edit route's group branch does onto an empty page: the
// recipe's references rebuilt from today's catalogue, wires resolved to slots,
// packed, composed and compiled. Nothing is written unless the compile passes.
// Writes go through PostgREST with `SUPABASE_SECRET_KEY` from backend/.env —
// the only credential that can write another user's rows, so `user_id` is set
// explicitly (its default is `auth.uid()`, which the secret key has none of).
// Without the key, `--sql` writes the statements to a file instead.
import { communityComponents, communityGroups, groupMembers, type RecipePiece } from "../../src/lib/workspace/community";
import { composeApp } from "../../src/lib/workspace/compose";
import { compile } from "../../src/lib/workspace/runtime";
import { GRID, packLayout, type ComponentSpec } from "../../src/lib/workspace/components";
import type { PublishedGroupMember } from "../../src/lib/workspace/community";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const USAGE = `usage:
  run.sh --user <uuid|email> <source> [--space <id> | --name <workspace>] [--page <name>] [--domain <Energy|Weather|Property|all>] [--sql <file.sql>]
  run.sh --user <uuid|email> --remove <pageId>        delete a page and take it off its workspace
  run.sh --user <uuid|email> --remove-space <spaceId> delete a workspace and every page in it
source, one of:
  --group <slug>         a published group (community.ts PUBLISHED_GROUPS)
  --component <slug>     a published component (community.ts PUBLISHED)
  --recipe <file.json>   {"name", "members": [...]} in the PUBLISHED_GROUPS piece format
  --manifest <file.json> a ComponentSpec[] as stored on a page (another page's data.manifest)`;

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function parse(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k?.startsWith("--") || argv[i + 1] === undefined) die(USAGE);
    out[k.slice(2)] = argv[i + 1];
  }
  return out;
}

/* ── Supabase, as the service ──────────────────────────────────────────── */

/** Only these two are read from backend/.env; nothing else there is wanted. */
function credentials(): { url: string; key: string } | null {
  const file = join(process.cwd(), "../backend/.env");
  if (!existsSync(file)) return null;
  const env: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^(SUPABASE_URL|SUPABASE_SECRET_KEY)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env.SUPABASE_URL && env.SUPABASE_SECRET_KEY
    ? { url: env.SUPABASE_URL, key: env.SUPABASE_SECRET_KEY }
    : null;
}

type Creds = NonNullable<ReturnType<typeof credentials>>;

async function rest(c: Creds, method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${c.url}${path}`, {
    method,
    // A `sb_secret_` key answers on `apikey` alone; it is not a JWT to bear.
    headers: { apikey: c.key, "content-type": "application/json", prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** A uuid as given; an email looked up in the auth admin API. */
async function resolveUser(c: Creds | null, who: string): Promise<string> {
  if (/^[0-9a-f-]{36}$/.test(who)) return who;
  if (!who.includes("@")) die(`--user takes a uuid or an email, not "${who}"`);
  if (!c) die("an email needs SUPABASE_SECRET_KEY in backend/.env to look up; pass the uuid instead");
  for (let page = 1; ; page++) {
    const r = (await rest(c, "GET", `/auth/v1/admin/users?per_page=1000&page=${page}`)) as {
      users: { id: string; email?: string }[];
    };
    const hit = r.users.find((u) => u.email?.toLowerCase() === who.toLowerCase());
    if (hit) return hit.id;
    if (r.users.length < 1000) die(`no account with the email ${who}`);
  }
}

/* ── The page ──────────────────────────────────────────────────────────── */

/** Group members as the edit route lands them at anchor (0, 0) on an empty page. */
function place(members: PublishedGroupMember[]): ComponentSpec[] {
  let down = 0;
  return members.map((m) => {
    const at = m.at ?? { x: 0, y: down };
    if (!m.at) down += m.layout.h + GRID.gap;
    return {
      kind: m.kind,
      refs: m.refs,
      // An empty page is base 0, so a group-relative wire is the slot itself.
      options:
        m.wireTo !== undefined
          ? { ...(m.options ?? {}), follow: String(m.wireTo), wireColor: "1" }
          : { ...(m.options ?? {}) },
      layout: { x: at.x, y: at.y, w: m.layout.w, h: m.layout.h },
    };
  });
}

function source(a: Record<string, string>): { name: string; manifest: ComponentSpec[] } {
  if (a.group) {
    const g = communityGroups().find((x) => x.id === a.group);
    if (!g) die(`no group "${a.group}"; published: ${communityGroups().map((x) => x.id).join(", ")}`);
    return { name: g.name, manifest: place(g.members) };
  }
  if (a.component) {
    const c = communityComponents().find((x) => x.id === a.component);
    if (!c) die(`no component "${a.component}"; published: ${communityComponents().map((x) => x.id).join(", ")}`);
    return {
      name: c.name,
      manifest: [{ kind: c.kind, refs: c.refs, options: { ...(c.options ?? {}) }, layout: { x: 0, y: 0, w: c.layout!.w, h: c.layout!.h } }],
    };
  }
  if (a.recipe) {
    const r = JSON.parse(readFileSync(a.recipe, "utf8")) as { name?: string; members: RecipePiece[] };
    const members = groupMembers(r.members);
    if (!members) die("the recipe names a stream the catalogue does not have (check every schemaId)");
    return { name: r.name ?? "Seeded page", manifest: place(members) };
  }
  if (a.manifest) {
    return { name: "Seeded page", manifest: JSON.parse(readFileSync(a.manifest, "utf8")) as ComponentSpec[] };
  }
  die(USAGE);
}

/** What the stored source reads until the first layout save writes the whole file. */
const STUB =
  "// Composed from the manifest when the page loads; the first layout save writes the full source.\nexport default function App() { return null; }\n";

type SpaceRow = { id: string; pages: string[] };

async function remove(c: Creds, user: string, a: Record<string, string>) {
  const u = `user_id=eq.${user}`;
  if (a["remove-space"]) {
    const [s] = (await rest(c, "GET", `/rest/v1/workspaces?select=id,pages&id=eq.${a["remove-space"]}&${u}`)) as SpaceRow[];
    if (!s) die(`no workspace ${a["remove-space"]} for that user`);
    if (s.pages.length) await rest(c, "DELETE", `/rest/v1/apps?id=in.(${s.pages.join(",")})&${u}`);
    await rest(c, "DELETE", `/rest/v1/workspaces?id=eq.${s.id}&${u}`);
    console.log(JSON.stringify({ removedSpace: s.id, removedPages: s.pages }));
    return;
  }
  const page = a.remove;
  const gone = (await rest(c, "DELETE", `/rest/v1/apps?id=eq.${page}&${u}`)) as unknown[];
  if (!gone.length) die(`no page ${page} for that user`);
  const spaces = (await rest(c, "GET", `/rest/v1/workspaces?select=id,pages&${u}&pages=cs.${encodeURIComponent(JSON.stringify([page]))}`)) as SpaceRow[];
  for (const s of spaces)
    await rest(c, "PATCH", `/rest/v1/workspaces?id=eq.${s.id}&${u}`, { pages: s.pages.filter((p) => p !== page), updated_at: Date.now() });
  console.log(JSON.stringify({ removedPage: page, from: spaces.map((s) => s.id) }));
}

async function main() {
  const a = parse(process.argv.slice(2));
  if (!a.user) die(`--user is required\n${USAGE}`);
  const creds = a.sql ? null : credentials();
  const user = await resolveUser(creds ?? credentials(), a.user);

  if (a.remove || a["remove-space"]) {
    if (!creds) die("removing needs SUPABASE_SECRET_KEY in backend/.env");
    return remove(creds, user, a);
  }
  if (a.space && a.name) die("--space files into an existing workspace; --name makes a new one. Not both.");
  if (!creds && !a.sql) die("no SUPABASE_SECRET_KEY in backend/.env — pass --sql <file> to write the statements instead");

  const { name, manifest } = source(a);
  const placed = packLayout(manifest);
  // The gate the edit route applies: a page that does not build is not saved.
  const built = await compile(composeApp(placed));
  if (!built.js) die(`did not compile:\n${built.error}`);

  const now = Date.now();
  const pageName = a.page ?? name;
  const app = {
    id: randomUUID().slice(0, 8),
    name: pageName,
    template: "compose",
    source: STUB,
    manifest: placed,
    createdAt: now,
    updatedAt: now,
    history: [
      { id: randomUUID().slice(0, 8), intent: `Seeded ${pageName} for testing`, manifest: placed, source: STUB, author: "you", at: now },
    ],
  };
  const space = a.space ?? randomUUID().slice(0, 8);
  const workspace = { id: space, user_id: user, name: a.name ?? pageName, domain: a.domain ?? "Energy", pages: [app.id], created_at: now, updated_at: now };
  const report = { page: app.id, space, newSpace: !a.space, tiles: placed.length, url: `/workspace/${space}/${app.id}` };

  if (!creds) {
    const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
    const filing = a.space
      ? `update workspaces set pages = pages || ${q(JSON.stringify([app.id]))}::jsonb, updated_at = ${now} where id = ${q(space)} and user_id = ${q(user)};\n`
      : `insert into workspaces (id, user_id, name, domain, pages, created_at, updated_at) values (${q(space)}, ${q(user)}, ${q(workspace.name)}, ${q(workspace.domain)}, ${q(JSON.stringify([app.id]))}::jsonb, ${now}, ${now});\n`;
    writeFileSync(
      a.sql,
      `begin;\ninsert into apps (id, user_id, data, updated_at) values (${q(app.id)}, ${q(user)}, ${q(JSON.stringify(app))}::jsonb, ${now});\n${filing}commit;\n`,
    );
    console.log(JSON.stringify({ ...report, sql: a.sql }, null, 2));
    return;
  }

  // Filed the moment it exists: a page in no workspace is swept into the
  // user's first one by `listSpaces`, which is not where anybody would look.
  // Two tables and no transaction over REST, so a failed filing takes the
  // page back out rather than leaving it to the sweep.
  if (a.space) {
    const [s] = (await rest(creds, "GET", `/rest/v1/workspaces?select=id,pages&id=eq.${space}&user_id=eq.${user}`)) as SpaceRow[];
    if (!s) die(`no workspace ${space} for that user`);
    await rest(creds, "POST", "/rest/v1/apps", { id: app.id, user_id: user, data: app, updated_at: now });
    try {
      await rest(creds, "PATCH", `/rest/v1/workspaces?id=eq.${space}&user_id=eq.${user}`, { pages: [...s.pages, app.id], updated_at: now });
    } catch (e) {
      await rest(creds, "DELETE", `/rest/v1/apps?id=eq.${app.id}&user_id=eq.${user}`);
      throw e;
    }
  } else {
    await rest(creds, "POST", "/rest/v1/apps", { id: app.id, user_id: user, data: app, updated_at: now });
    try {
      await rest(creds, "POST", "/rest/v1/workspaces", workspace);
    } catch (e) {
      await rest(creds, "DELETE", `/rest/v1/apps?id=eq.${app.id}&user_id=eq.${user}`);
      throw e;
    }
  }
  console.log(JSON.stringify(report, null, 2));
}
main().catch((e) => die(e instanceof Error ? e.message : String(e)));
