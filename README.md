# Dryos workspace

The front end of [Dryos](https://www.dryos.ai) — a marketplace for live energy,
weather and property data. Maintainers collect the data and are paid for it;
this is the part people consume it with.

It is three things in one Next.js app:

- **The workspace** — dashboards built out of typed components, arranged on a
  twelve-column grid, wired to each other, and running against live data in a
  sandboxed frame. No code required to build one, and no model in the loop for
  the ordinary cases.
- **The public catalogue** — a page for every one of the 134 live streams, at
  [dryos.ai/data](https://www.dryos.ai/data).
- **The API reference and MCP server pages** —
  [dryos.ai/docs](https://www.dryos.ai/docs) and
  [dryos.ai/mcp](https://www.dryos.ai/mcp).

## Quick start

```bash
npm install
npm run dev
```

That serves <http://localhost:3000> against the hosted API, so nothing else has
to run. Sign-in and maps need keys; everything public works without them.

```bash
cp .env.example .env.local   # then fill in what you need
```

| Variable | What it does without it |
|---|---|
| `NEXT_PUBLIC_DRYOS_API_URL` · `DRYOS_API_URL` | Defaults to the hosted API. Point at your own backend to use one. |
| `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The site runs; nobody can sign in. |
| `MAPBOX_TOKEN` | Maps say the token is missing instead of failing silently. |
| `ANTHROPIC_API_KEY` | The component refine box is the only thing that needs it. |

While `npm run dev` is running, check builds with `npm run build:check`, never
`npm run build` — the two share `.next`, and a build overwrites the chunks the
dev server is serving.

## Where the data comes from

Everything on screen is fetched over HTTP from the Dryos delivery API. **The
collectors that fill it are not in this repository**, and nothing here depends
on them at build or run time — the base URL is configuration.

The API is public, read-only, and needs no key:

```bash
curl "https://api.dryos.ai/v1/datasets/ercot-realtime-lmp/query?node=HB_NORTH&limit=2"
```

Or point an agent at it:

```bash
claude mcp add --transport http dryos https://api.dryos.ai/mcp
```

Full parameters are at [dryos.ai/docs](https://www.dryos.ai/docs), and
[dryos.ai/llms.txt](https://www.dryos.ai/llms.txt) is the same thing as plain
text for an agent.

## Layout

```
src/
  app/
    data/           the public catalogue: index, one page per operator, one per stream
    docs/           the API reference
    mcp/            the MCP server's own page
    workspace/      the shelf, a workspace, and a page being edited or launched
    api/workspace/  apps · spaces · data · usage · preview · components · mcp
  components/
    workspace/      DataExplorer · BuildPanel · ComponentEditor · Runner · UsageDock
    data/           the catalogue pages' shared parts
    nav/            MarketingNav · AppNav · SpaceNav · AccountButton
  lib/
    apiDocs.ts      this repo's copy of the delivery API's contract
    dataPages.ts    the catalogue's address scheme and structured data
    workspace/
      catalog.ts    what streams exist, their units, cadences and map treatment
      components.ts the typed shapes and their generators
      compose.ts    manifest -> one whole file
      runtime.ts    the sandbox: shims, both palettes, esbuild
      store.ts      pages, revisions, layout writes (Supabase, RLS per user)
```

`CLAUDE.md` in this directory is the long-form version: why things are the way
they are, and the mistakes that cost an afternoon. Read it before changing the
workspace internals.

## How a dashboard actually works

A page is a **manifest** — a list of tiles, each a shape plus a data reference
plus its options and its place on the grid — and the file that runs is
generated from that manifest in full, every time. A tile is dropped, resized,
wired or reconfigured; the manifest changes; the whole file is regenerated,
compiled with esbuild, and only then saved. If it does not compile, nothing is
written and the page keeps running what it had.

Apps are versioned by **intent**, not by code: every revision stores the
instruction that produced it, so pulling a change from a diverged copy replays
that instruction rather than merging a diff.

The app itself runs in an iframe with `sandbox="allow-scripts"` and no
`allow-same-origin`, so it holds no credentials and never meets CORS. It
reaches data only by posting a message to the host, which fetches on its
behalf — which is also the one place every query can be metered.

## Licence

MIT — see [`LICENSE`](LICENSE). Use it, fork it, ship it.

The data itself is a separate question: it is served from the Dryos API under
whatever terms each publisher sets, and this licence covers the code here and
nothing else.
