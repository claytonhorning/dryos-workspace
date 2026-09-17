# Working on the Dryos workspace

This is the Dryos front end: the marketing site, the public data catalogue,
the API reference, and the workspace — screens wired to live data, built out
of typed components and arranged on a grid.

It talks to the Dryos delivery API over HTTP and nothing else. There is no
build-time or run-time dependency on the collectors that fill that API; the
base URL is configuration.

`README.md` covers what the product is and how to start it. This file is the
things that are not obvious from the code, and the ones that cost an
afternoon when rediscovered.

## Running it

```bash
npm install
npm run dev          # :3000, against the hosted API by default
```

`.env.local` decides which backend it talks to. Both `DRYOS_API_URL` and
`NEXT_PUBLIC_DRYOS_API_URL` point at `https://api.dryos.ai`, so nothing has
to run locally for day-to-day work; point them at a local backend to work
against one. The feeds menu and the event stream call the API **from the
browser**, so whichever host serves them needs `http://localhost:3000` in its
CORS origins — without it the status dot reads red and every stream
"unreachable" while every server-side proxy works.

`npm run build:check` exists because dev and build otherwise share `.next`
and a verification build kills the running dev server. Always use it, never
`npm run build`, while the dev server is up.

**Two `next dev` processes sharing one `.next` corrupt each other**, and the
symptom points nowhere near the cause: every `/bundle/{v}` request answers
500 with `__webpack_modules__[moduleId] is not a function`, because the
route's chunk asks for a vendor module the other compiler's rebuild just
rewrote. Before chasing a module error, run `pgrep -fl next-server`; there
should be exactly one. Then stop both, `rm -rf .next`, and start one.

## The data comes from an API this repo does not contain

Every number on screen is fetched from the Dryos delivery API — the
catalogue (`/v1/datasets`), the rows (`/v1/datasets/{slug}/query`), the
entities (`/nodes`) and the advance announcements (`/v1/events`). The
contract is documented at <https://www.dryos.ai/docs>, and
`lib/apiDocs.ts` is this repo's copy of it: a parameter added to the API is
added there or it exists to nobody outside.

`lib/workspace/catalog.ts` is the frontend's own description of what those
streams are — names, units, cadences, entity samples, map treatments. It has
to agree with what the API serves; when the two disagree, the API is right.

## Two MCP servers and a page — three addresses that look alike

| Address | What it is | Code |
|---|---|---|
| `https://api.dryos.ai/mcp` | **Data server.** Open, no login, read-only: `list_streams`, `describe_stream`, `find_entities`, `column_values`, `query_stream`. | The delivery API — not in this repo |
| `https://www.dryos.ai/api/mcp` | **Workspace server.** Sign-in required (Supabase OAuth); builds in the user's own account. | `frontend/src/app/api/mcp/route.ts` |
| `https://www.dryos.ai/mcp` | **A web page** describing both. Not a server — an MCP client pointed at it gets HTML. | `frontend/src/app/mcp/page.tsx` |

They are separate servers because authorization is per server: a client
that is asked to log in by a server logs in before any of its tools work,
and the data server has to stay anonymous for the directories and for
anyone who only wants numbers. An agent uses both — finds the stream and
the names on the first, builds with them on the second.

The data server is the delivery API as tools, called in-process (the route
functions themselves, so filters, validation and error words are the REST
API's own). Stateless and JSON-answering because the box runs two workers;
mounted as a route so `/mcp` never redirects to `/mcp/`; DNS-rebinding
protection off, since the SDK's localhost default refuses `Host:
api.dryos.ai`. Its `INSTRUCTIONS` are the rules from `/llms.txt`, and a
rule added to one belongs in the other. Every `query_stream` answer carries
`restUrl`, the same request as a GET; calls are limited to 60 a minute per
address. Clients: `claude mcp add --transport http dryos
https://api.dryos.ai/mcp` and `… dryos-workspace
https://www.dryos.ai/api/mcp`. A client config added before 2026-09-14 may
still name `https://dryos.ai/api/mcp` — the apex, which redirects and so
never connects; re-add it on `www`.

## The workspace MCP server builds in a user's account

`https://www.dryos.ai/api/mcp` (`app/api/mcp/route.ts`, tools in
`lib/workspace/mcpTools.ts`), since 2026-09-14: an agent signed in as a Dryos
user lists, creates and adds to that user's workspaces — `list_workspaces`,
`list_components`, `get_page`, `create_workspace`, `add_page`, `add_tile` —
and lists and copies the community workspaces: `list_community` answers view
URLs, and `copy_community` makes the user an editable copy through
`copyCommunityPage`, the one copy path the pages route's Make a copy also
takes. Each call makes a new workspace; nothing dedupes a repeat.
The data server at `api.dryos.ai/mcp` stays open; the two are used together
(find the stream and the names there, build here). Things that shape it:

- **A second server, not more tools on the first**, because authorization
  is per server: a server that asks for a login is asked for one before any
  tool works, and the data server has to stay anonymous.
- **Supabase is the authorization server** (its OAuth 2.1 server, beta). An
  unsigned request gets 401 with `WWW-Authenticate: Bearer
  resource_metadata=…`; `/.well-known/oauth-protected-resource[/api/mcp]`
  names `…supabase.co/auth/v1`; the client registers itself, the login runs,
  and Supabase redirects to the **authorization path**, `/oauth/consent`,
  resolved against the project's **Site URL** — so the consent step always
  lands on the deployed site, never on localhost. The page approves or
  denies through `supabase.auth.oauth`; nothing here sees a token.
  `/.well-known/oauth-authorization-server` relays Supabase's metadata for
  clients on the 2025-03-26 spec, which look on the MCP host itself.
- **Every tool runs as the token's user.** `asBearer` (`lib/supabase/server.ts`)
  holds a token-carrying client in async-local storage and `supabaseServer()`
  answers with it, so the store runs unchanged and RLS scopes every row. The
  token is verified with `auth.getUser(token)` first; a bad one is 401,
  never anonymous. `importLocalOnce` finds no session on that client and
  does nothing, which is right.
- **The gate is the editor's.** `add_tile` checks names against the API's
  entity search (a guessed node is refused with the close matches), runs the
  shape's `accepts`, places the tile at the first clear spot reading left to
  right, compiles, and records a revision authored `agent`. Nothing deletes.
- Hand-written JSON-RPC (initialize, ping, tools/list, tools/call,
  notifications), stateless and JSON-answering, so a Vercel function serves
  it; there is no GET stream. `/api/mcp` sits outside the middleware's
  matcher, so no cookie refresh runs on it.
- **Supabase settings it needs** (Authentication → OAuth Server): enabled,
  authorization path `/oauth/consent`, dynamic client registration on. The
  collector of these facts could not set them from the repo — the Supabase
  connector reaches the database, not auth config.

## The workspace POC

`/workspace` — **screens** wired to the live feed, built out of components.

### Three levels: workspace › page › component

- **Workspace** — a subject you work on: several pages you flip between.
  `lib/workspace/spaces.ts`, one JSON file, pages referenced by id.
- **Page** — one dashboard. Still a whole app on disk with its own history and
  manifest; nothing about that file format changed when workspaces arrived.
- **Component** — a tile on a page.

Routes follow: `/workspace` is the shelf of workspaces, `/workspace/{space}`
resolves and forwards to a page, `/workspace/{space}/{page}` is the editor. That
last redirect also catches the **old shape of link**, where the segment was a page
id — those were shared before workspaces existed, and landing them on the right
page costs one lookup.

`listSpaces()` **adopts orphans**: a page in no workspace joins the first one,
and ids pointing at deleted pages are swept. A page in an unexpected place is
recoverable; a page nothing links to is not. That is a safety net, not a
workflow — `/spaces/{id}/pages` creates and files in one call so there is never a
window where a page belongs nowhere.

**Filing is a move, and a failed read is never an empty account.** Until
2026-09-14 a page could sit in two workspaces, three ways. `addPage` ran the
sweep before filing, which adopted the page it was about to file into the
newest workspace, so a page added to any older one landed in both. A failed
`workspaces` read came back as `[]` and seeded a fresh "My workspace" holding
every page. A failed `apps` read came back as `[]` and stripped every page from
every workspace, and the next sweep adopted all of them into the newest one.
Now both reads throw, the seed is one row per account (id from the user id,
conflicts ignored) and only when there are pages to file, the sweep waits a
minute before adopting a page, and `addPage` drops the page from any other
workspace in the same write. `deleteSpace` spares a page another workspace
still lists (`sharedPages`), and the dialog says which ones stay.

User-facing vocabulary is deliberate and worth keeping straight. Never "app" in
anything a user reads: an app is a generic thing somebody else made, and this is
meant to feel like your desk. The code still says `App`, `AppSummary`,
`/api/workspace/apps` — renaming the type and the routes would be a large diff of
pure churn over a stored format, so the split is intentional.

### The navbar changes inside a workspace

`Nav` picks a third shell (`SpaceNav`) only for a **launched** page — that is,
`/workspace/{space}/{page}` _without_ `?edit=1`. Managing a workspace or editing
a page is still working on the product: you came from the workspace and you are
going back to it, so the app's own navigation stays and the page supplies its own
breadcrumb (`← workspace / page name`). The tabs appear when you are actually
using the pages they switch between.

Reading the query string in the nav means `Nav` needs a `<Suspense>` boundary in
the layout for prerendering; the fallback is the bar's own height so nothing
below it moves.

**Rename fields use `lib/useSelectOnMount.ts`**, a callback ref rather than
`autoFocus` + `onFocus`. These fields mount conditionally, so an effect keyed to
the component runs once while the field is not there and never again — and the
`autoFocus` pairing is a race React loses often enough to notice and never often
enough to report.
A workspace is its pages, so the chrome becomes those pages — tabs and a `+` —
and the product's own navigation steps back to a wordmark. At that point you are
not browsing Dryos, you are working in one place and moving between views of it.

The workspace name in the nav is a **link to the workspace itself** — clicking
the name to see what is in it is what anyone would expect, so renaming lives
there instead. A page is renamed by **clicking the tab it is already on**;
clicking any other tab means "go there", and one control should not mean two
things depending on which copy of it you press.

The one exception is birth: a workspace created blank from the shelf lands
you in its page's editor with the **nav name armed for naming** — the Finder
new-folder moment — because the subject is the one thing already in your
head when you press Create, and "New workspace" names nothing. Steered by
`?name=1` on the create redirect, stripped on the first commit or Escape,
with Enter committing through blur so there is one exit path and Escape
clearing the draft _before_ disarming so the trailing blur finds nothing to
commit. This does not make the name a rename control — the field only ever
_arrives_ editing; a click on the name still always navigates.

### Reading a page and editing one are different layouts

Closed — the default — the shell has no margins at all and the screen runs
**edge to edge under the nav**, so none of the site shows around it. No header,
no name, no breadcrumb. A screen left on a wall should carry no chrome.

Editing arrives as `?edit=1`. The shell gains a `px-4` gutter, the panel appears,
and the controls that act on the page come back — at the top of the panel column,
not in a row above the canvas. **Neither mode is width-capped.** A `max-w` here
stranded the navbar in the middle of a wide monitor while the canvas ran to the
edge; the gutter is the whole layout now, and the navbar uses the same one.

Vertically the gutter is **asymmetric on purpose** — `pt-2 pb-4`. The navbar is
already a horizontal rule, so space under it does nothing the nav is not doing,
and every pixel of it is a pixel the screen does not get.

**The editing canvas is the launched screen scaled down, not a narrower one.**
A tile is columns wide and pixels tall, so a canvas that merely loses width to
the panel is a different dashboard — you arrange one thing and launch another.
`useScreenFit` lays the frame out at `window.innerWidth` and scales it by
`room.width / window.innerWidth`, which keeps every tile's size, wrap and
relative weight identical in both modes and turns a panel drag into a zoom
rather than a reflow. Height then comes from the room, so the frame is taller
than the launched screen and shows a strip more canvas below the fold;
letterboxing to the launched height instead is arithmetically tidier and leaves
a band of dead space above and below a dashboard, which is worse. (It was
letterboxed for a while, when the wires strip sat under the canvas and took
the room; the strip is a pane in the panel column now and the canvas has
the column back.) It has to be
measured rather than declared — `aspect-ratio` takes a ratio of numbers and this
is a ratio of two lengths, both of which move under a window resize or a panel
drag.

A **new page opens in edit mode**, from either the nav's `+` or the workspace's
New page. It is empty, and nobody makes one in order to look at nothing —
and any _arrival_ at a still-empty page (a workspace forwarding to its blank
page, a tab click) is steered into `?edit=1` by the page itself, because a
blank canvas with no panel is a screen you can only look at and there is
nothing to look at. That force needs its pair: while the open page is empty,
the nav hides the Edit/Done control entirely (the page announces emptiness
with a `dryos:blank` event, same idiom as the saved mark). "Done"
on a page with nothing done is a claim, and worse, the force made it a button
that snapped straight back. Hidden, the unleavable mode is invisible; the
control reappears with the first tile. Neither half works alone — the force
without the hiding is a lying button, the hiding without the force is a blank
page that opens onto nothing.

### The domain is chosen in the sidebar, and the shelf reads it

Signed in, the product has a **left sidebar** (`nav/AppSidebar`): the mark
with a small **Domain** picker beside it at the right of the same row (a
setting chosen once and left alone, so it does not spend a labelled block of
the sidebar's height), then two destinations with icons — Workspaces and
API (`/docs`). Which routes get it is
`lib/shell.ts` — one rule shared by `Nav` (draws it) and `AppFrame` (steps
the body right by `--sidebar-w`), because two copies drifted. A page inside
a workspace keeps `SpaceNav` and no sidebar: a screen on a wall carries no
chrome. Below `md` the sidebar is gone and the top bar carries the mark and
a compact copy of the picker.

The domain lives in `lib/domain.tsx`: a `useSyncExternalStore` over
localStorage (`dryos.domain`), kept like the panel width — a setting about
how you use the product, not a fact about the account — and `null` until
chosen, so the shelf **asks first** (a full-width chooser: Energy, Weather,
Property, Everything — a declared-but-uncollected subject would be marked
next) rather than guessing. Once chosen, the shelf is "Your
Energy workspaces": the list filtered to that domain (a workspace made
before the choice existed has none and belongs everywhere), the community
panel naming that domain's maintainer, the community tab empty for a domain
nothing is published in, and Create making a workspace of that domain with
no further question — the frame you are already in is the answer.

**It is a store, not a context with an effect, because the nav hydrates
inside its own Suspense boundary.** A provider in the layout that read
localStorage in an effect had switched to "Energy" before the sidebar
hydrated against HTML rendered for "unknown", and React regenerated the
tree with a hydration error. `useSyncExternalStore`'s server snapshot is
what hydrates; the client value arrives as an ordinary re-render after.

`Space.domain` — a catalogue domain, `"all"`, or absent — is a `domain
text` column on `workspaces` (migration `workspaces_domain` in Supabase's
history, like the rest of the schema). It decides only where the explorer
opens (`initialDomain`, applied once as it lands because the page fetches
the workspace after the panel mounts); nothing is filtered by it inside a
page, since a page about energy is allowed to draw the weather. The
explorer's select gained **Everything** for the blend, and in that mode the
section headings carry the domain the select no longer names. A subject
with no streams is refused by the route — it would open onto an empty
shelf — which is what kept Property out until its first permit stream.

The community panel reads `lib/people.ts`, one roster shared with the
hero's ring: four placeholder maintainers across the domains, and two
builders. It was derived before — every schema's maintainer, every
revision's author — which was honest and read as thirty-four rows of
"Dryos".

### Community publishes workspaces, not pages

**A community workspace is an ordinary workspace with `community` set**, since
2026-09-14 — a column on `workspaces` (migration `workspaces_community`), not
a list in the code. The shelf's Community tab is every flagged workspace
(`/api/workspace/community`, one `CommunityStarter` card each). **A card opens
the workspace to look at, never copies it**: `/workspace/community/{space}/{page}`
is the publisher's live page read-only (its own `community` shell in
`lib/shell.ts`, `CommunityNav` for tabs — ahead of the owned-page rule, which
would read "community" as a workspace id), and **Make a copy** in that bar
makes a workspace of the same name with a copy of each page's manifest,
composed and compiled fresh (`copyCommunity.ts`, the pages route's
`community` branch). The frame needs nothing new to show another account's
page: the bundle and script routes already load any page by id. What is
published is the live workspace, so editing one of its pages is publishing
the edit. RLS keeps every row to its owner, so both reads are
security-definer functions handing out names and manifests only
(`community_workspaces()`, `community_page(id)`, granted to signed-in users).
**Only Dryos sets the flag**: a trigger refuses it from `authenticated`, since
an owner-settable flag would put anyone's workspace on everyone's shelf. Set
it with admin SQL, scoped by `user_id` (ids are unique per account, not
globally). The seven operator workspaces — ERCOT, MISO, PJM, SPP, CAISO,
NYISO, ISO-NE — were built through the workspace MCP server in Clayton's
account and flagged that way; a model-edited page has no manifest and the
copy refuses it. The three hand-written "ERCOT starters" templates are no
longer on the shelf; `templates/` still backs the template routes.

The maintainer panel says the difference in words rather than leaving two lists
to be inferred from: **maintainers** are named experts accountable for one source
staying correct; **builders** are the community making pages out of what they
publish.

### Opening is the default; editing is a mode

A workspace card is **one target with one meaning**: open it. Asking someone to
choose between launching and editing before they have seen what is inside is
asking a question they cannot answer yet.

Editing is entered from within, by a pencil in the **navbar** — the bar is
already there in both modes, so it costs the screen nothing and is always in the
same place, which is the difference between a control you find and one you go
looking for. It is a `Link` toggling `?edit=1`, not a button toggling state.

**Edit mode is derived from the URL, never copied into state.** Holding it in
`useState` desynchronised the moment that link changed the query without
remounting the page — the button flipped and nothing else did. Derived, there is
one answer, it survives a reload, and it can be sent to someone.

The workspace navbar covers both modes. Editing is a mode of being in a
workspace, not a trip out of one; the tabs are how you move between pages either
way, and swapping the whole bar underneath someone the moment they press Edit is
a disorientation with nothing to show for it. The workspace's own list page keeps
the app navigation — no page is open, so there is nothing for tabs to switch
between.

Page tiles inside a workspace keep their two icons: open it, or the pencil
(`?edit=1`) to change it.

### Deleting

A page is **deleted, not unfiled**. It belongs to exactly one workspace, so
"take it out" and "delete it" are the same act, and pretending otherwise would
leave something nothing links to. Confirmed in place on the tile — one page is a
small blast radius, and the confirmation belongs on the thing being deleted
rather than over it.

Deleting a **workspace takes its pages with it** (`deleteSpace`). The alternative
is worse: the orphan sweep in `listSpaces` would quietly file someone's deleted
work into a different workspace. So the dialog names the workspace, counts the
pages, and **lists them** — the count is the part someone checks before pressing
a red button.

A **tile** is removed by the ✕ in its own header, one click, no confirm — the
revision it writes is the undo, a better safety net than a second click nobody
reads. It looks instant because it is optimistic: the grid hides the tile the
moment it is clicked, the save runs behind the gesture, and only a failed save
puts it back (`restore` posted into the frame). Only composed pages can do it;
a model-edited page says why and reverts past the change instead.

### The workspace navbar is stretched and full width

A tab's underline belongs at the bottom of the bar while its label sits on the
same line as the wordmark. The only way to have both is for every item to be the
full height of the row and centre its own contents (`items-stretch`, then `flex
items-center` per item).

It is **not centred in a column**. What is under it runs edge to edge, and a nav
bar's left edge has to be the left edge of the thing it belongs to — centred, the
wordmark ends up stranded in the middle of a 2560px screen. Both the bar and the
page use a `px-4` gutter, so they line up in either mode.
Files under `frontend/src/{app/workspace,app/api/workspace,components/workspace,lib/workspace}`.

### Apps are versioned by intent, not by code

This is the load-bearing decision. Every revision stores the instruction that
produced it, verbatim, alongside the source. Pulling a change from another app
**replays that instruction** against your copy rather than merging a diff.

That is what makes "take this change, skip that one" possible between two apps
that have diverged: a textual merge would be a conflict, and there is no way to
show a merge conflict to a domain expert. Verified working — the same countdown
intent replayed onto a diverged app produced different variable names and
identical behaviour.

Do not "improve" this into diff-based versioning. The whole feature dies.

### The catalogue matches the database

`lib/workspace/catalog.ts` is the only place that decides what the workspace
claims to have. Data is addressed as **domain › sector › stream** — Energy ›
Pricing › Real-time — never as a collector slug; `ercot-realtime-lmp` is an
implementation detail a domain expert should not have to learn, and it appears
in the UI nowhere. The sector was renamed from Power: every chip has to earn a
distinction, and "Power" distinguished nothing in an energy domain. Grid stayed,
but as physical conditions only — the price adders moved to Pricing, because a
component of the price belongs beside the prices it moves.

**Two streams may share one full path, and that is a grouping, not a
collision.** The SCED LMP and the settlement point price both live at
Pricing › Real-time; the explorer groups sections by `path.slice(1)`, so they
render under one heading as two answers to the same question. Do not "fix"
duplicate paths apart.

**Every stream is live** — one per collected report, across two domains: Energy
(Pricing, Ancillary, Load, Generation, Grid) and Weather (Observations, Forecast).
The entries
were written from the delivery API (counts, samples, units), and the one report
deliberately absent is NP4-183's duplicate: Day-ahead serves it via
`ercot-dam-lmp-bus`, and one report is one stream. Small streams declare
`entityKey` (and `entityOmit` for aggregate rows like TOTAL) so a stream-level
reference fans out; the destination is deriving both from the facts the API
already serves, not growing the declarations.

**`cadence` is delivery; `intervalSeconds` is resolution, and for every
forward-looking report they are different numbers.** The day-ahead market posts
the whole of tomorrow in one file at 12:35 — a daily cadence — and that file is
twenty-four hourly rows. Anything asking how _often to poll_ wants the cadence;
anything asking about the rows — how many a window holds, how much time one
grid cell is — wants `grainSeconds(schema)`, which reads the override and falls
back to the cadence. Ten streams declare it: nine DAM and forecast reports at
3600, and System demand at 900 behind an hourly publish. Read the wrong one and
nothing errors — a fortnight of day-ahead quietly fetched 62 rows instead of
336, and the heatmap refused the stream outright as "daily". The numbers came
from the modal spacing of `interval_start_utc` in each table, which is how to
check any stream added later.

The mock machinery (`mockData.ts`, `availability: "mock"`, the seeded
generators) is dormant, not deleted. It has two remaining jobs: thumbnails
render from each variable's declared `mock` shape (a shelf tile has no host to
answer real queries), and any future stream declared ahead of its collector
goes back to wearing the badge. **A mock that reads as real is still the one
unforgivable state** — `MOCK` is blue and dashed-bordered wherever one ever
appears, and the `LIVE` badge is gone from data cards precisely because a
label that is true of everything says nothing (the usage and cost ledgers keep
both badges; there the distinction is the pricing argument itself).

### Data references are chips, not pasted query text

Clicking a result in the data explorer attaches a `DataRef` to the change: a
record carrying the path, availability, cadence and token price. The sentence
someone types stays their sentence, and `agent.ts:describeRefs` expands the
references into query text on the way to the model.

That split is what makes the revision replayable. `Revision.refs` sits beside
`Revision.intent` rather than inside it, so pulling a change into a diverged app
re-expands its references against today's catalogue instead of replaying a call
expression that may no longer be right.

Cadence and price ride on every chip. The per-component credit totals
(`refreshCost`) were dropped from the editor chrome — the chips and the cost
panel carry the metering now, and `refreshCost` in `catalog.ts` is currently
unconsumed.

### Typed components, and the path with no model in it

A chart of a series is not a creative act — it is the same forty lines every
time, and everything that varies (dataset, column, cadence) the `DataRef`
already carries. So `lib/workspace/components.ts` generates them:

- **`components.ts`** — four shapes (chart, ticker, table, map), each with an
  `accepts()` guard, a list of `Option`s, and an `emit()` that returns TSX.
- **`compose.ts`** — stitches a manifest into a whole file. Generation is
  **total, not incremental**: the manifest is the truth and the file is derived
  from it every time. Splicing into text a model may have rewritten would fail
  silently; regenerating either matches the manifest or does not compile.
- **`App.manifest`** — present only while every revision was generated. A model
  edit drops it (`store.ts`), because nothing can reconstruct a manifest from
  edited source. Reverting to a composed revision restores it.

`/edit` picks the path itself, and **a typed drop never reaches a model**:

- Still-composed app — spliced into the manifest, whole file regenerated,
  compiled, saved. About a second, zero tokens.
- No manifest (a template, or a model-edited page) — `lib/workspace/annex.ts`
  **appends** instead of weaving: the page's default export is demoted to a
  plain function, a wrapper `App` renders it full-width with the new tiles on a
  twelve-column grid beneath, and the tile brings a `__dx`-namespaced copy of
  the generated runtime so nothing collides with whatever the page defines.
  The compile gate is what makes that textual surgery tolerable — failure is a
  refusal, never a corrupted page. Annex tiles apply resize live in-frame but
  cannot persist layout (there is no manifest to write into), so the host
  skips that save rather than surfacing a 409.

The agent path in `/edit` now serves only an actual sentence. Placement shows
no progress banner either way — the tile appearing is the report, and the
strip above the build panel appears only for failures.

**`withDefaults` carries keys the shape never declared.** Per-series color and
line style are settings, but their choices come from the selection rather than
from the shape, so they cannot be an `Option` the panel renders a select from;
they ride in `options.series` as one JSON string. A `withDefaults` that only
kept declared keys threw them away between the panel and the generator, which
looks exactly like a generator that ignores them. Anything else needing
selection-shaped settings goes the same way, and gets the same treatment.

**A color reaching `paint()` is interpolated into TSX as a string literal**, so
`seriesHex` accepts six hex digits and nothing else. That is not tidiness: an
unvalidated value there is writing code, not choosing a color. Everything that
fails the test falls back to a palette slot.

### What each shape accepts

`accepts()` enforces it, so the API refuses what the tray refuses and nothing can
reach a generator in a shape it cannot draw:

- **chart** — one to four series overlapping; five to eight only if the units
  agree, because past four only stacking reads and a stack sums. Shape choices
  are line, area and **stacked area** (stack order: largest-first from the
  data, or selection order). The window option drives the query start, the row
  limit and the tick format. A series can be sent to a **second y-axis**
  (`a: "r"` in the per-series overrides, chosen per row in the series panel) —
  price against load is the case the chart exists for and one scale flattens
  whichever side is smaller. Only for overlapping lines/areas: a stack sums
  onto one axis and a spread is one derived series, so the panel hides the
  control there. All-right normalises to all-left — the right axis exists only
  once both sides have a series — and when the sides' units differ the header
  reads both (`$/MWh · MW`) and the tooltip carries a per-series unit map,
  because labelling MW rows with the left axis's $/MWh was the quiet lie the
  single-unit tooltip told.
- **bar** — two to eight series of one unit: the categorical snapshot, latest
  value per series, sorted largest-first / as-selected / A-to-Z, as columns or
  rows. A single non-fanout selection is refused with the reason: one bar is
  a ticker.
- **heatmap** — one series, gridded at its own resolution: a row is a bucket
  and a column is **one reading** inside it, so five-minute prices draw hour
  rows of twelve columns and hourly day-ahead draws day rows of twenty-four.
  Averaging twelve SCED runs into an hour square hides exactly the spikes
  somebody opened a heatmap to find. `Grid` states it explicitly where the
  other reading is wanted, and an hourly series asking for hour rows gets day
  rows anyway — one column is not a grid.
- **text** — a title, and no data at all: `accepts` says yes to an empty
  selection and it is always offered. It is a shape rather than a field on
  the page because a wire is a relationship between two manifest slots — a
  title that is not a tile could never follow the map — and as a shape it
  inherits the drag, the grid, the revisions, the recipes and the tray's
  wiring for free. The words ride in `options.text` undeclared (an `Option`
  is a select), with a text field in the panel; `{pick}` in them is the
  wire, replaced by the picked node and an em dash until there is one, so
  `followable` answers yes to `text` with no refs. `Section` draws it
  `plain`: no ground, no header, no ask on double click; at rest it is
  words on the canvas and nothing else. Under the pointer, in either mode,
  it wears a dashed outline with the ⠿ / ✕ strip floated over its top and
  the corner — launched, a title moves and resizes the way every other
  tile does, and the hover is what says so. Editing, the outline stays.
  Sized by `FitText`, the ticker's measurer, so the words fill whatever
  box the tile is dragged to and the tile is the only size control; three
  fixed steps came first and clipped in a short tile, floated in a tall
  one, and hid behind a select. When even the floor size does not fit
  on one line, `wrap` on `FitText` folds the words into lines at the
  floor instead of running them off the edge — and a color select of the ink,
  the muted ink and the eight series slots named by hue, every value a
  frame token from a fixed table so it follows the theme and nothing
  outside the table reaches the TSX. Floors of 40px and one column. It is
  also the one shape that skips the explorer: chosen from the shelf, it
  opens straight on its preview, and the rule is `accepts([])` rather than
  its name, so a later shape that reads nothing gets the same treatment.
- **ticker** — exactly one series; **table, map** — one or more. The ticker
  **is named in the header and the number gets the whole box**. Every shape's
  header now reads entity first, stream second: `Section`'s `sub` carries the
  stream's `short` name from the catalogue (`RT · LMP`, never "Live" —
  everything is live) in the header's quieter voice, one line, ellipsized
  before it wraps. `subFor(refs, title)` decides it for every shape and
  answers null when the selection mixes streams (the labels already say) or
  the title *is* the stream (a whole-stream fan-out), so nothing names itself
  twice; a wired chart's title is the picked entity alone for the same
  reason. The ticker's cell has no inner card — a second border and a label
  line spent on what the header already says — and its value is one
  em-written stack inside `FitText` (`compose.ts`), which renders each tier
  once more as a hidden 100px probe and sizes the visible copy by the ratio
  of the box to the probe; measuring the visible copy would be a loop.
  **The ratio is then confirmed at the size it picked**: text is not
  linear in its font size — the system face is optically sized, and a
  12px line is 13% wider per pixel than the 100px probe — so a size read
  straight off the probe overflowed at exactly the small sizes a short
  tile asks for. `fitted` re-measures the probe at the candidate and
  scales down by what it finds, up to three passes. The
  move is an arrow and a whole-number percentage to the right of the number
  and nothing else — no unit, no "since last" — `▲` in `--up` (a market
  green added to both frame palettes, because the accent means "new" and
  reads yellow beside a red arrow) and `▼` in `--fail`, the figure a
  magnitude because the arrow carries the sign. Percent is against the
  previous value and falls back to units within a unit of zero: prices
  cross zero here, and a move from −2 to +2 is not "−200%". Three tiers, first to fit at 26px wins: the move
  beside the number, the move under it (one column cannot hold both on a
  line), the bare number. `min` takes one number or one per tier for the
  next shape that needs a staircase. A ticker may be dragged to
  `TICKER_MIN_H` (90px) and **one column** where every other kind stops at
  120 and two; `minTileHeight(kind)` and `minTileWidth(kind)` are the one
  answer the frame, the layout route and `packLayout` all read, since a
  floor applied in only one of them silently saves the other's number. A
  one-column tile is the concise form: the header's title group wraps so
  the stream sits under the entity, and `Section` goes `narrow` — no ⠿
  glyph (the header is the handle anyway), a 12px title, and the ✕
  control floats over the corner on hover instead of sharing the row with
  a name it is wider than. **Only the narrow form wraps.** The group used
  to wrap on any tile whose row ran a few pixels short, and on a ticker
  the number is sized to the box the header leaves, so two tickers of the
  same size drew two sizes of number — the one with the longer name
  smaller. Wider tiles keep the header to one line and ellipsize the
  stream first, the entity only when it is alone and still too long. A
  ticker also has **no ⤢** (`expand={false}` on its `Section`): it is one
  number that already fills its tile, and the screen would only have made
  it bigger.

**Every tile says when its numbers are from.** `useSeries` files the
newest `interval_start_utc` it loaded under its tile (`TILE_ASOF`), returns
it as `asOf`, and raises `dryos:asof`; `Section` listens for its own index
and draws a clock glyph (`Clock`, an inline SVG an em tall) and the time in
the header group, info blue (the accent means "new", amber means "late" in
the feeds menu — this is neither, it is *when*), in the page's display zone
via the `sourceTz` every emitter now passes, with the date and zone in the
tooltip. The glyph stands in for the words "as of": a time with a clock is
*when this was*, at one character. An event rather than a prop so every
shape carries it without every emitter learning to. The ticker is the
exception — `headerAsOf={false}` — and draws it itself from the hook's
`asOf`, under the move in one small column beside the number, because a
header line is a line the number does not get. Sample rows are skipped,
since a time on made-up rows is the claim the SAMPLE DATA tag exists to
deny. The data route answers 401 to a cookie-less frame, so a scratch page
cannot show it — lift the `preview` guard for one build to look, and put it
back.

**Fan-out**: a lone stream-level reference to a stream with an `entityKey`
means _all of it_ — the emitted code queries without an entity filter and
pivots rows per entity at runtime, so an entity the source adds later appears
without recomposing the page. color slots go alphabetically by entity so a
reload never repaints anyone.

**Mixed cadences forward-fill**: hourly DAM beside 5-minute RT holds the
hourly value between publishes (the settled price _is_ the price at :05), so
every hover has both sides and the slow series draws as the step it is. When
a selection spans streams, series labels carry the stream name — two lines
both reading "HB_NORTH" compare nothing.

**`accepts` is read after the shape is chosen, not before.** The shape comes
first on the shelf and its data second in the explorer, so there is no
selection to grey a card against; the verdict is read out on the explorer's
footer line instead, in the shape's own words ("pick exactly two series"),
and Next waits until it passes. `offered` — the rule that hid a shape the
selection had moved past — went with the old order, since a shelf with no
selection has nothing to hide. A **distribution** shape (duration curve /
histogram) was removed outright on 2026-09-06.

**Series colors come from `--s1..--s8`** — eight slots, each mode's sequence
validated as a set for color-vision safety (light is its own stepping, not a
flip of dark). Reorder or restep only through a palette validator; never cycle
past eight.

The values live in `lib/workspace/palette.ts` as data, and `runtime.ts` writes
the frame's variables from it. **Those tokens exist only inside the frame**, so
anything in the host that has to _show_ a series color — the per-series picker,
chiefly — must read the array instead: a swatch painted `var(--s3)` in the panel
resolves against a document that never defined it and draws white, silently.
Generated code keeps emitting the variable names, because only the frame can
follow the theme. A per-series override stores a slot _number_ for the same
reason; a literal `#rrggbb` is the escape hatch and is fixed in both themes.

### Building a component

Judging a chart from a settings form is guesswork, so the preview follows the
gesture. **Clicking any card — a shape, a saved component, a published one —
previews it inline, right under the shelf**: the real one-tile app on live
data, its settings beside it as selects, switching cards switching the
preview. A base shape previews against whatever the explorer holds and follows
it live; a saved or published one brings its own references and ignores the
selection. A component with `custom` source shows no selects, because frozen
source ignores them.

The preview box is sized for the **worst case, not the typical one** — a
fan-out over eight fuel types spent a short tile entirely on axes and legend
and drew a band nobody could read. A preview that has to be enlarged before it
answers the question is not previewing anything.

`ComponentEditor` still takes the whole panel column, entered from the tile
(which reopens the editor on what the tile is and puts the result back via
`replaceAt`, keeping place and size). It renders the build shelf's own
`PreviewPane` rather than a second layout of the same controls — building a
component and changing one are the same activity, and two arrangements of it
made each other harder to learn. The differences are only what the situation
changes: creating ends in a drag (`onDragStart` present makes the preview the
handle, wearing the accent border and the ⠿ tag), while a tile being edited
already has a place, so its preview is hoverable (the drag-catching sheet
only exists while dragging is on offer — it swallows hovers) and the footer
asks the open questions: Cancel alone at the left (the one answer that
changes nothing), then Remove and Save right-aligned the way a dialog ends,
Save the primary. Duplicate is not in that row — it acts on the canvas, not
on this tile, and as a fourth button it read as a fourth verdict — so it
sits in the editor box's header beside the tile's name, in Back's quiet
voice. Duplicate **stages, it does not place**: the copy — the
spec as the editor currently shows it, unsaved edits included, at the
original's size — hovers over a dimmed canvas as the thing to pick up, and
grabbing it enters the same drag-ghost-drop that places everything else, so
the drop says where and the compile gate runs then. Escape or a click on the
scrim puts it away unmade — nothing exists until the drop. Appending it
sight-unseen was tried first and failed: "under everything" on a tall page
is below the fold, which reads as the button doing nothing. Three mechanics
gotchas live in the overlay: the card is hidden, never unmounted, once
grabbed (removing a drag's source element mid-drag cancels the drag); the
overlay goes pointer-events-none while dragging so positions fall through
to the sheet that forwards them into the frame; and the state change that
does the hiding is **deferred a tick from `dragstart`** — Chrome cancels a
drag whose source element is restyled in the dragstart tick, which made the
grab die in the hand and the overlay snap back, with no error anywhere. No name field and no credit readouts in the
editor chrome. The editor's data is not sealed in, and its stages wear
exactly the create path's clothes: the same bordered "‹ Data · N selected"
strip with the removable chips sits above the editor box, and pressing it
hands the whole column to the same `DataExplorer`, seeded with the tile's own
references, whose "Next ›" returns. One layout for one activity — the editor
being arranged differently was only ever a thing to relearn. A data change
drops frozen source, same as a settings change — a refinement was written
against the data the old code queried.

What runs in it is the real thing: `/api/workspace/preview` composes a one-tile
app from the spec in the query string and serves it through the ordinary sandbox
on live data. Shape, settings and data regenerate for free; only the refine box
spends anything.

`refineComponent` (`agent.ts`) rewrites **one section function**, not an app. It
never sees the rest of the dashboard, and its output is compiled wrapped in a
throwaway one-tile app, because a bare function is not something esbuild can
check. A refined component stores its finished source in `ComponentSpec.custom` —
nothing can reproduce an agent's rewrite from `kind` and `options`.

**Frozen source was authored as a one-tile app, so it says `index={0}`.**
`renameSection` (`compose.ts`) rewrites both the function name and that index to
the slot it is landing in. The name was always rewritten; the index was not, so
every saved component on a page reported _tile 0_ when its corner, its ✕ or its
⚙ was used. Harmless-looking while a move was an order — load-bearing the moment
a gesture means "this tile, here".

`Save` keeps it in `lib/workspace/library.ts` (`.workspace/components.json`) and
it appears on the shelf for the next dashboard.

### Wires: one tile's selection drives another

Clicking a node on the map retargets the chart wired to it. The channel is a
window event inside the frame — `dryos:pick`, carrying the source tile's
index and the picked entity — the same idiom as the page's time cursor, and
the link is stored on the **receiver** as a ride-along option (`follow`, a
tile index as a string), the same trick the per-series styles use: it
travels through the preview URL, the drag payload and the manifest with no
route learning a new field, and it replays like every other setting. Two
sources emit picks (`emitsPicks`): the map (clicks resolve by the hover's
own nearest-row matching, so both the marker and dense GL paths emit) and
the **Node search** (`picker`), a search over one stream's own entity
names. The search is `sourceOnly` — not on the Library, because alone it
is a box nothing hears — and only ever enters a page as a group's source,
set in the wires strip's draft or carried by a published group. Charts,
tickers and titles receive. `followable` in `components.ts` is the gate the wiring panel greys
on: fan-outs discover their own entities, spreads derive theirs, and frozen
custom source was never generated with the listener, so a wire to any of
them would silently do nothing. A wired tile **wears an accent chip**
(`wireTag`) the way a mock tile wears MOCK — provenance the reader is owed on
the launched screen too — reading "wired — click a node on the map" until the
first pick and collapsing to "wired to the map" once the title carries the
node. **Both ends of a wire also wear the pair's border**, launched only: an
outline on the slot (no layout cost, follows the radius), computed in
`composeApp` because only the whole manifest knows which tile is somebody's
source, from `wireColor` on the receiver — a palette slot 1–8 so it steps
with the theme, accent when unset, validated to an integer before it is
written into TSX. **A source and all its followers wear one color, the
first follower's** — the slot the wires pane shows as the group's and
rewrites on every follower from its swatch — and a tile wired to a source
that already has followers joins in that color rather than taking the next
one. Per receiver, a map with a chart and a title wired at different times
wore two blues, and the title's read as a thicker border when the outline is
the same 1.5px on every slot. Edit mode hides it (the App holds its own
copy of the mode for this — Sections hold theirs for their chrome, and the
slots draw the outlines). The wires pane auto-assigns the next unused slot
per group, and the swatch on a wired chip cycles the palette on click — painted from the
host's own `SERIES_PALETTE`, since the frame's tokens do not exist out
there. A drawn line between the tiles was considered and refused: chrome on a
screen meant to carry none, spaghetti when two wires cross, and a chase
after every move.

**Wires are made in the panel column**, as a fourth turn beside Build,
Chat and History — the pane was a strip under the canvas until 2026-09-07,
and the strip was screen the screen did not get. Its three columns are a
stack now, and it reaches the drop it exists for through the **Wires tab,
which is spring-loaded**: a running preview dragged across it opens the
pane, and the pane is the drop target it always was. That works because
the Build pane is hidden, never unmounted, when another takes its turn —
a drag survives its source being hidden — and because the pane clears the
drag payload on drop itself. The first shift-click on the screen also
brings the pane forward (only the first, so a third mark does not yank
somebody back out of Build). The pane opens with the **staging tray**: the
same drag that places a tile can drop into it instead, and each staged
piece lists as its shape and its data, in stacking order (↑↓ is the
map-above-chart choice). Wiring in the tray is **computed, not stored** —
every followable receiver follows the first source, re-derived on reorder or
removal so no stale index survives. **A draft with no source sets one**: once
every member reads one stream, the building column offers **Map** and
**Node search** over that stream (each as the component it would add, the
map greyed with its own `accepts` reason for a stream nothing places), and
the choice goes in at the top of the stack. A draft of tiles already on the
screen gets no such offer — the source would not exist yet and nothing on the
screen can follow a preview — and is told to shift-click a map instead. The
tray is then the drag handle:
one drop lands the whole group through the edit route's `group` branch as
one compose, one compile, one revision, stacked at the ghost's anchor.
`wireTo` in the payload is **group-relative** and the server resolves it to
absolute manifest slots, because only the server knows where the group will
sit. The group's ghost carries **chips, not a live preview** (`dropCard` on
`Runner`): one per member, shape and data, stacked at the ghost — a live
preview of N tiles would be N frames compiling mid-drag. The tray **arms
itself the moment a stageable drag exists** — the same quiet accent ring the
canvas's sheet wears, so both drop targets light together — and any landed
drop (canvas or tray) resets the panel to the Data stage: a drop ends the
build it was part of. The tray's drop handler clears the drag payload
itself rather than trusting the source's dragend, because the panel reset
unmounts the drag's source and a removed source's dragend is not
guaranteed.
**Tiles already on the screen join a group by shift-click.** The frame's
`Section` sends `shift` with its configure event, and the page keeps the
shift-clicked slots as `marked` (click order, toggled by a second
shift-click) rather than opening the editor; the strip folds them into its
draft as members carrying a `slot`, and the frame rings each one — the
`mode` message carries `marked` beside `selected`, because the frame cannot
see the strip. **The mark's ring is the info blue, the pick's is the
accent** — one yellow ring means "the editor is open on this", and a second
yellow ring read as a second tile being edited, which is what a shift-click
looked like it had done. A shift-click on the tile the editor is open on
also closes the editor, so a tile never wears both. **Shift is read off
`pointerup`, not `click`**: a shift-press on a map body is Mapbox's
box-zoom, and no click event follows it at all — the one tile a group is
built around could not be marked by its body, only by a marker or its
header. The plain click still arrives on `click` and skips a shifted one so
a gesture fires once. Two marked tiles start a group by themselves (there is
nothing else two shift-clicks could mean), and while a draft is open one
shift-click adds. A plain click leaves the marks alone: opening one tile's
settings must not throw away a selection made two clicks ago. A draft made
of screen tiles does not land — the widget offers **wire these N** instead
of a drag handle, one `onConnect` per follower down the replace-in-slot
path below, and the draft is discarded once the manifest reads the wire
back as a real group. A draft mixing screen tiles and dropped previews is
refused in words: the previews do not exist yet, so nothing on the screen
can follow them and no single act finishes it. The strip syncs marks into
its draft keyed on the joined slots, not the array (the page hands it over
fresh every render), and reads the manifest through a ref so a save does
not re-run the sync.

Below the tray, the connect row still wires tiles already on the screen; it
goes down the ordinary replace-in-slot path (the same one the tile editor's
Save uses), so every wire is composed, compiled, and recorded as a revision,
and disconnecting is the same call with the option removed. Two facts worth knowing: `useSeries`
re-fetches on `JSON.stringify(queries)` because a wired tile swaps its
queries at runtime — without that dep the pick changed nothing until the
next poll; and wires address tiles **by manifest index**, so removing a tile
above a wired pair silently re-aims the wire — the panel is where that gets
noticed and re-made. The model-edit path also answers questions now: an
agent reply with no code block returns its prose instead of "the model
returned no code block", which is what a question deserves.

### A double click on a launched tile asks about it

Editing, a click on a tile configures it; **launched, a double click on a
tile's data opens a small chat about it** (`TileChat`), at the click,
carrying the point under the pointer, the rows the tile holds and a digest
of the rest of the screen. A double click rather than a click: a launched
screen is looked at, and a single click that opens a window opens it while
somebody is only pointing. Two things follow. The tile body is
`user-select: none`, because a double click selects the word under it and
that word was an axis label. And the map's `doubleClickZoom` is off, since
the same gesture cannot both zoom and ask; the wheel and the controls still
zoom. Previews and thumbnails are never askable — `bare` frames have no
host, and a thumbnail is looked at, not asked.

**It reaches existing pages because the script route composes from the
manifest at request time.** The stored source is what history, revert and
pull read; what the frame runs on a composed page is `composeApp(manifest)`
today, falling back to the stored text if the fresh compose does not build.
Before that, a runtime change reached a page only on its next layout write —
the first time this shipped, not one page in the store had it, and a click
on any of them did nothing. Model-edited pages have no manifest and still
run their stored source.

**The frame packs the answer, because only the frame can see it.** Three
registries in the generated runtime (`compose.ts`): `useSeries` files its
rows under the tile it renders in — the slot wraps every tile in a
`TileIndex` context, the annex wraps its own the same way — `Section` files
its title, and every readout writes the point it is describing to
`window.__dryosHover` (`ChartTip` assigns it during render on purpose,
because recharts renders the tip on every pointer move and an effect would
be a render behind; the heatmap, the map and the per-shape tips write it
from their hover state). `Section` clears the global on `mouseleave`, and
that clear is load-bearing: a readout recorded on one tile must not answer
for a click on the tile next door. **A tip's own clear is owned** — it
forgets only a readout it wrote (`owner` on the record, a per-instance id).
Unowned, every chart that re-rendered its tooltip inactive cleared the
global, and a chart re-renders on every poll and every wire retarget; the
first click of a double click on a map node retargeted the wired chart,
which wiped the node between the two clicks, and the ask arrived with no
point. `askPayload` then trims for the wire —
always-null columns and bookkeeping go, 150 rows of the clicked tile spread
evenly with every row of the clicked entity kept ahead of the thinning (a
map click on a node in a thousand-node layer would otherwise sample the
node away), the newest handful for every other tile. Measured: a click on a
six-tile page is 4–17 KB.

The host converts the click out of frame pixels with the fit's scale
(`Runner`), the page renders the chat inside the canvas box so the numbers
mean the same thing, and any `pointerdown` in the frame posts `press`, which
is what closes a chat when the next press lands on nothing — the host cannot
see a press inside an iframe any other way. The route
(`/api/workspace/explain`, `pointAgent.ts`) is **stateless**: the popover
sends the whole payload with every turn plus the transcript so far, so a
follow-up survives a reload and the context prefix is byte-identical across
turns. The agent shares the data guide's tools (`dataAgent.ts` exports them)
for the question the screen cannot answer, and the composer's model
preference (`dryos:chatModel`) carries over — there is no room for a picker
in a window that size.

To verify it without a session: compose a page through `composeApp`, frame
it from a harness page that logs `message` events, and drive headless Chrome
over CDP with a `mouseMoved` before the double click (`clickCount` 1 then
2) — the hover is what fills the point, and a click with no preceding move
is a click on a tile with no readout.

### Arranging a screen

Three gestures, all handled inside the frame because pointer events do not cross
into an iframe and anything that waited on a round trip would feel broken:

- **Resize** — the `◢` corner. Applies live, posts the final size out.
- **Move** — the `⠿` header handle, to wherever on the canvas it should go. The
  frame moves the tile locally (`dryos:tilegrab` → `App`'s own `pos` state) and
  posts out separately. The host cannot move a tile in the frame without
  reloading it, and a screen that blinks every time you nudge a tile is not one
  anyone will arrange.
- **Full screen** — `⤢` in the header, `✕` or Escape to leave. A tile sized for a
  screen is not always sized for the question you are asking of it right now.
  Tickers do not offer it; a number has no detail to enlarge into.

All three save through `/layout` **without a revision and without touching
`updatedAt`**. The screen shows a quiet `✓ Saved just now` in its top-right
corner instead, because arranging writes constantly and silence about someone's
own work is not reassuring.

A fourth gesture has no control at all: **a tile is configured by clicking
anywhere on it**, which is why there is no `⚙`. A control meaning "this one" is
a second way to say what pointing at it already says. It only answers while the
page is being edited — outside edit mode there is no panel for the settings to
appear in, and a click that opens nothing is worse than a click that does
nothing — and it ignores a press that lands on the tile's own chrome, on a
control inside the component, or at the end of a drag that travelled more than
six pixels, because a map panned by six pixels ends in a click event like
anything else.

**Edit mode reaches the frame by message, not on the URL.** The frame needs to
know there is a panel to open settings into, and which tile that panel is
currently about, so `Runner` posts `{__dryos: "mode", edit, selected}` on change
and again on load — a frame that has just booted heard none of the earlier ones.
Putting it in the bundle URL beside `?theme=` is the obvious move and the wrong
one: the theme is on the URL so the _first paint_ is right, while toggling edit
would change the frame's address and reload the whole dashboard underneath
somebody who only pressed Edit.

### There is no page header — the controls sit on top of the panel

No name and no breadcrumb: the workspace navbar is present in edit mode too, and
it already carries both — the workspace beside the wordmark, the page as its own
tab, which is also where it is renamed. What is left is `Pull changes / Fork /
Copy link` and the identifier — **all of it behind `PAGE_ACTIONS`, off**, since
every one of them is about moving a page between people and sharing does not
exist yet. The machinery is untouched, so turning the flag back on is the whole
of putting them back.

They are the **first row of the right column**, above whichever pane it is
showing and above the component editor too. A row of its own above the canvas
cost the screen a band of height across the _whole_ width to hold four controls
that all sat at the right anyway — and keeping that row's columns in step with
the body's was a standing bug, since aligned to the page rather than the canvas
they floated over the panel instead of over the screen they act on. In the
column there is nothing left to keep in step, and the canvas runs from the top
of the page.

### The right column takes turns

`PanelMode` — **Build · Wires · Chat · History**. One column, four jobs, and
they are not used together: you build, you wire, you converse, or you read
what happened. Stacking them made every one too short to use. Cost and Feeds were
turns here once and are both in the navbar now, for the same reason: they
are questions asked of a launched screen at least as often as of one being
edited, and the panel exists only while editing.

**The feeds are a status dot beside the open page's tab** (`FeedsMenu`,
rendered by `SpaceNav` right after the active tab). The dot is the worst
stream on the screen — emerald arriving, amber late, red when the delivery
API did not answer, neutral before anything is heard — and opens into the
delivery record the side panel used to hold, collection graph included —
**one row per stream**, each saying which tiles read it (`chart · ticker
×6`), because grouped by tile a page of seven tickers on one feed listed the
same row seven times. Three mechanics: the page announces what it reads with
`dryos:feeds` (`tileUses` builds the detail from the manifest, or from the
history on a model-edited page), and **`SpaceNav` holds the listener, not
the dot** — the dot mounts with the tabs, after the workspace fetch, and the
page's own fetch can land first, so an announcement made to the dot alone
was lost. The delivery API is polled whether or not the menu is open,
because a dot that only knows the answer once clicked is a button, not a
status. And the menu is `fixed` under the bar at the trigger's measured
left edge rather than `absolute top-full`: the tab rail is `overflow-x-auto`,
which clips anything hung off it.

The Cost panel is **counted, never projected** — Today / This week / This month,
read from the same ledger `/usage` reports from, narrowed to one screen. A
forecast that turns out wrong is worse than no number when the subject is money.

Per-screen attribution: `Runner` stamps `appId` onto every query it serves. It is
stamped **at the host, never inside the frame** — the app in there is untrusted
and must not be able to bill another screen. Queries with no screen (the
standalone bundle URL, a preview) land under `-`, which is honest about not
knowing.

Two numbers, because neither alone is the answer: **credits** are what the
product meters in, **dollars** are what a budget is approved in. `DRY_USD` is
derived from the published listing (`$0.85 / 1k realtime calls`, one call = one
DRY), not invented — a buyer who reads the marketplace page and then the cost
panel has to arrive at the same figure.

The ledger reader migrates the pre-attribution shape (day → schema) under `-`
rather than discarding it: those rows are real spending.

### The canvas is a twelve-column grid, and a tile has a place on it

Tiles carry `layout: { x, y, w, h }` — `x` columns from the left of twelve, `y`
pixels from the top, `w` columns wide, `h` pixels tall — and arrive small
(`DEFAULT_LAYOUT`) because sizing is a judgement about the dashboard around them,
not about the component.

**The position is the load-bearing half.** A tile used to have only a place in a
sequence rendered into an auto-flow grid, which meant it could not _be_
somewhere, only _after_ something — so moving one necessarily pushed every tile
after it, and there was nowhere for a blank space to exist. Placed, a tile is
where it was put: a move moves one tile, and the hole it leaves stays a hole.
**Nothing on the canvas is derived from anything else's position**, which is the
one sentence the rest of this section follows from.

The consequences are all the same consequence:

- **A drop lands where the ghost was, or nowhere.** `tileLanding` answers with a
  free rectangle, or a swap, or `null` — and on `null` the preview _holds_ rather
  than flickering to somewhere the drop would not honour. `onDrop` reads the
  ghost, never a fresh hit test, so what you saw is what you get.
- **Squarely on top of another tile is a swap**, and only when both land clear.
  A trade that would sit on a third tile is refused, because a third tile moving
  is the thing this whole arrangement exists to prevent. The partner's
  destination gets its own quieter `Ghost`.
- **Resizing stops at the neighbour** instead of pushing it, the way a window
  stops at the edge of a screen. Height settles first against the width the tile
  already had, then width against the settled height — that order is not a
  preference, it is the one that provably cannot overlap. Taking width first let
  a tile _underneath_ count as a neighbour to the side, and a tall drag collapsed
  the tile to its minimum width.
- **Resizing clamps to the canvas too, not only to neighbours.** A resize is a
  drag like any other, so it obeys the same ground rule `tileLanding` does —
  nothing grows past ground that is not there. Width was always safe by
  accident: it is clamped to `GRID_COLS - x` and renders as a percentage of the
  canvas, so columns cannot overflow. Height had no canvas term at all — only
  the neighbour below and a hardcoded 900px ceiling — so a tile with nothing
  underneath it (the bottom row, or a lone tile) grew to 900px however shallow
  the canvas was. Measured on a 556px canvas: 900px, half of it past the
  bottom edge. `grab` now reads the canvas's `getBoundingClientRect().height`
  as `floor` and caps `h` at `floor - y`. It is read **once, at grab time**,
  deliberately: the canvas's own height is `bottom + 120`, derived from tile
  state that only updates on `dryos:tilesized` at pointerup, so re-reading it
  per `pointermove` would have the tile chase a floor it was itself pushing
  down. The 120px growth strip is what guarantees `floor - y` never falls
  under the 120px minimum, so the two clamps never fight.
- **`packLayout` (`components.ts`) is the migration, and every write goes through
  it.** A page written before positions existed is frozen into exactly the
  arrangement the old flow grid drew — same wrap, same row heights — the first
  time anybody touches it, so nothing on anyone's screen moves. Tiles that
  already have a place are honoured _first_ and the flowed ones laid around them;
  the reverse order silently overlapped them.
- **Two tiles never share ground, and `packLayout` is what guarantees it.**
  The frame refuses a drop or a resize that would overlap, but it used to be
  the only thing that did: the server wrote whatever place it was sent, and
  two placed tiles on the same ground were kept exactly there by the packer,
  so an overlap that got in stayed in. Three doors let one in. A **group
  drop** was ghosted at its first member's default size (`beginDrag` replaced
  every payload's footprint with `DEFAULT_LAYOUT[kind]`) while the server
  stacked every member under the anchor — a map-plus-chart landed the chart
  on whatever sat below the map. A **tile reconfigured into a kind with a
  taller minimum** (ticker to chart) grew to it on the next write, into its
  neighbour. And **a stale frame** — another tab, a removal whose save
  failed — can post a place the store has since taken. So the packer now
  lays placed tiles in manifest order and steps a later one down to the first
  clear ground under an earlier one (`settle`); the earlier tile is where
  somebody put it and a drop appends, so the newest arrival yields. Every
  composed page renders from the pack, so it holds on a screen not written
  since the overlap got in. Around it: `regenerate` and the typed branches of
  `/edit` store the _packed_ manifest, so what is saved is what is drawn; the
  edit route checks a named place against the store (`clearOf`) and answers
  a taken one the way it answers none — under everything — and a group is
  checked as its whole stack; and `beginDrag` keeps a group's footprint (and
  the duplicate's original size, which went through the same line). The
  frame's own clamps are sound only against a clean layout, which is why the
  invariant has to be the server's and not the gesture's.
- **The canvas is the drop target, so it is never shallower than the frame**
  (`calc(100vh - 32px)`) with a strip past the last tile. Ground you can see but
  cannot drop on is ground the arrangement does not have — and the converse
  holds too: `tileLanding` clamps on every side, the bottom included, so a
  tile cannot be dragged off the canvas and out of view. The growth strip is
  inside the clamped rect, so a page still grows downward, one visible step
  at a time.

Manifest order is now only paint order. A drop appends.

**Resizing happens inside the frame.** Pointer events do not cross into an
iframe, so the grab handle lives in the generated `Section`: the drag is handled
locally and applied immediately, and only the finished size is posted out. A
resize that waited on a round trip would feel broken exactly when it needs to
feel direct.

`/api/workspace/apps/[id]/layout` saves it **without writing a revision** and
without touching `updatedAt`. A dozen drags while someone settles on a size would
bury the history that matters, and bumping the version would remount the frame
under the cursor mid-drag.

**It does keep the compile gate.** That felt skippable — the manifest built once,
and only two numbers changed — but a rearrangement regenerates the _whole file_,
so it is exactly the moment a changed generator gets baked into someone's page.
It shipped a broken screen that way once. Everything else here stages, validates
and promotes; so does this.

**Tabs reorder by dragging, in edit mode only.** Dragging is how you move between
pages the rest of the time, and a tab that rearranges on a stray drag is a tab
you cannot trust to navigate.

### Dragging onto the canvas

Components are not added by a button. They live on a **grid that wraps** at the
top of the build panel — a rail that scrolled sideways hid half of them behind a
gesture — and are dropped where they should live.

**A card is not draggable. The preview is.** The card used to answer two
gestures — drag to place it as it comes, click to set it up first — and the
drag was the bad half: it placed a component nobody had looked at, at settings
nobody had chosen, which is exactly the guess the inline preview exists to
remove. So the shelf now does one job (click a card, the component runs
underneath on live data) and the running component is the drag handle. What
lands is what was on screen a moment before, settings and all — a promise no
card could make.

What lands is the preview's settings, not its size. The drop used to take
the preview's on-screen pixels divided by the canvas's fit scale, so the tile
was exactly as big as the thing being carried — and the preview is as wide
as the panel so a shape can be judged, which through a canvas scaled to half
is most of the screen. Every drop arrived full-width and had to be shrunk
before the next one fit. `beginDrag` hands the drag `DEFAULT_LAYOUT[kind]`
now; the preview's own `layout` in the payload is the preview's, not the
tile's.

That leaves one drag source, so it says so out loud: the preview box wears a
persistent `⠿ drag onto the screen` tag, the open card stays lit while its
preview is below, cards carry a pointer cursor rather than a grab one, and the
panel header reads _click a card · drag its preview onto the screen_. The
delayed corner hint is still there for anyone who sits looking at a preview
without working it out.

**Only the thing being carried moves** (`dr-jiggle`) — now the preview box
itself. The shake used to idle on every card, to say they were draggable; a
shelf that fidgets at rest is motion with nothing to report and it never
stopped.

**The preview is the layout, not a marker pointing at it.** A dashed `Ghost` sits
at the incoming tile's own `x`/`y`/`w`/`h` and **disturbs nothing**. It used to be
an element in the flow, which meant the preview shoved every tile aside to show
itself — and shoving them changed the answer to what the pointer was over, so the
gap moved, so the gap moved. That feedback loop was the whole of the glitchiness;
placed absolutely, the preview is stable and is exactly what a drop produces.

It carries **no label at all**: not "Top" / "After X", and no "DROP HERE" either.
Once the rectangle is the right size in the right place there is nothing left to
explain, and a caption is the one thing on screen while someone is mid-drag.

For an **incoming** drag the rectangle goes one better: the frame's `spot`
answer carries the ghost's own rect in frame pixels, and `Runner` floats the
**live preview of the carried component** (`dropPreview`, a bare preview URL
the page builds from the drag payload) at exactly that rectangle — scaled the
way the main frame is, offset by the preview document's 16px root padding so
the tile inside lands pixel-on-pixel, pointer-events off and under the sheet
so the drag never notices it, mounted once per drag and moved by style
because remounting is a recompile. The dashed ghost still draws underneath
and is what shows until the preview compiles.

`Ghost` lives in generated source, so removing something from it only reaches a
page when that page is next composed. Manifest-backed pages regenerate on any
layout write; a model-edited page keeps whatever the model copied until a model
rewrites it again.

One mechanism serves both kinds of drag, and it lives in the frame:

- The canvas owns `onDragOver` / `onDrop` and `tileLanding()` picks the
  rectangle: the pointer's own position minus where inside the tile it took
  hold, so the tile travels under the hand rather than snapping a corner to it.
- A tile being moved announces itself with `dryos:tilegrab` (carrying that grab
  offset) and fades to 35% **without leaving its place** — the hole opens on
  drop, not on pick-up.
- Each tile renders inside a positioned **slot** carrying `data-slot`/`x`/`y`/
  `w`/`h`. Everything else measures against the DOM the App just rendered
  (`tileRects`) rather than being handed state, which is what lets the resize
  corner — buried in a `Section` that may be frozen custom source — know its
  neighbours at all.
- The tile elements are `useMemo`'d on `pos`, so a ghost tracking the cursor
  keeps their identity and does not re-render a dozen recharts tiles per
  `dragover`. `drag` is a ref for the same reason.
- A drag from the **host** cannot fire events inside the frame, so `Runner` keeps
  a **transparent** sheet over the iframe purely to catch pointer events and
  forwards each position in as `__dryos: "dragover"`. The frame answers with
  `__dryos: "spot"` — a place, not an index — which the host sends on drop, and
  the incoming tile hangs centred on the cursor because nothing was picked up out
  there. Nothing is drawn on that sheet: anything there would sit on top of the
  preview that matters.
- **A release over ground it does not fit on sends no place at all**, and the
  server puts the tile under everything instead. Guessing a corner would drop it
  on top of something.

On a non-composed app there is no canvas to place onto, so the drop appends to
the annex beneath the page — deterministic, but position-blind. The annex keeps
the old flow grid, and `Section` falls back to it whenever there is no slot
around it.

A click is not a worse drag: it opens the component, and only a drop says where.

### Mapbox

Mapbox sizes its canvas once and never notices its container changing, so a
resized tile would keep a map drawn for the old dimensions. The map component
carries a `ResizeObserver` calling `map.resize()` — on the container, not on the
tile's size prop, because going full screen is the same problem arriving by a
different route.

Charts and maps pass `fill` to `Section`, which makes the content box
`position: relative; overflow: hidden` so they can size against it absolutely.
A percentage height resolves against a parent that has one, and a flex child in
an auto-height column does not always. Their old `height` options are gone —
the tile decides now.

The map loads `mapbox-gl` from the CDN at runtime rather than bundling it, so
every app that draws no map stays small. `buildDocument` grants
`dryos.MAPBOX_TOKEN` from `MAPBOX_TOKEN` in the environment — the one credential
an app is handed, and only because a Mapbox public token is meant to be read by
the browser and is restricted by URL on their side. With no token the component
says so rather than failing silently.

**The base map follows the theme.** Mapbox picks a style once and keeps it, so a
map chosen on a dark page stayed dark on a light one. The `Match theme` option
(now the default) reads the frame's `data-t` and calls `setStyle` when it
changes — markers are DOM overlays and survive a restyle, so the map keeps its
position and its pins.

**Adding a GL layer retries on a timer, not on a map event.** `addSource` throws
outright before the style is up, and the effect that adds the point layer only
re-runs when its rows do — five minutes away on a real-time feed — so one missed
attempt is not a flicker, it is an empty layer until the next poll. `style.load`
is a single shot that may already have gone, and `idle` never arrived at all on
a map also running the particle layer, which silently cost the prices whenever
wind was added beside them. A short poll depends on nothing but the clock.

**A value scale is declared on the variable and is absolute.** coloring from
the min and max of whatever was just fetched restretches on every refresh, so
the same red marked $103 on one pass and $40 on the next and meant nothing you
could carry between two glances. Linear also fails this data outright: across
one ERCOT interval p1 is $16.68 and p99 is $50.33 while min and max span $136,
so 98% of nodes land inside a quarter of the ramp, all one shade, and the
congestion somebody opened the map for is what gets squeezed out. `Variable.scale`
fixes stops to values — for price, dense through the ordinary range and reserving
its loudest colors for the 4% above $100 — and negative prices take their own
hue, because oversupply is a different state rather than a cheap one.

The stops sit at the fortnight's quantiles (measured 2026-09-05 over 2.7M
rows: p10 $21, p25 $25, p50 $31, p75 $45, p90 $70, p95 $96), so the band
holding two thirds of readings gets four steps where it once had one. **The
colors are cool to hot since 2026-09-12**: blue below the typical price, a
neutral grey at the $30 median, then salmon through red to $250–500, and a
hot pink from $500 up — a band of its own, far off the red, because a node
at five hundred dollars is the one thing on the map that has to be found at
a glance. Negatives are the deepest blue. The ramp before it climbed in
lightness through purple, pink and yellow (designed in OKLCH so the cap was
the brightest mark), and read as unintuitive — none of those hues mean
"cheap" or "expensive" to anyone — where blue-grey-red is the weather map
everybody already reads, and it keeps clear of red against green. The one
before that peaked at chartreuse at $50 and dimmed toward red, which made
$45 and $60 one color and $1000 less visible than $50. The legend is the
bands as a stack of ranges, nothing else: the stream and its unit are the
tile header's to say.

**But the map is nearly one color at any instant, and that is the data, not
the scale.** Across the nodes of one interval the p10–p90 spread has a
median of $0.30 (p75 $2.70) — the system price moves every node together and
the congestion that separates them is rare and brief. An absolute scale,
however well stepped, therefore mostly shows *when* it is, and what a price
map is opened for is *where*. The honest next step is a second coloring —
each node against the interval's median, a diverging ramp with grey at zero
— as a map option beside the absolute one; it is not built. The scale is
also not theme-aware: on a light basemap the top of the ramp fades into the
ground and only the dot's dark stroke holds it.

**The map draws one layer of pins, and several streams share it only when
they read one measure.** The emitter gives a field and a fleet a layer each,
but every point reference is merged into a single `points` layer with one
placement rule, one scale and one legend swatch. `pinStreams` in
`catalog.ts` decides which references count as pins (two entities of one
stream are two pins on one layer, so it answers streams, not references),
and `pinsAgree` in `components.ts` decides whether those streams can share
the layer: every one of them `located` (the rows carry the coordinate, so
no lookup table has to know two operators) and every one reading the same
column in the same unit. ERCOT's, MISO's and PJM's real-time LMP pass — the
same `lmp_total` in $/MWh on the same declared stops — which is what
*Real-time LMP, every operator* on the community shelf is (a map recipe may
name `layers` beyond its `schemaId`). A weather station beside a price does
not, and the map's `accepts`, the explorer's cards and the layer picker
refuse it in the same words (`PIN_LAYER_WHY`). Inside the emitter the
agreeing streams are `locatedSets`: one query each, in picking order, and
the placed memo reads each set by its own entity column. A whole-stream
query of a partial table sends `located: true`, which the API answers with
only the rows its node table can draw (`drawable()`, placed nodes plus the
aggregates the frontend centroids — ERCOT's only) — the data route fans a
node list into one request per node, so a 930-name filter has to be the
server's, and without it PJM's bus stream spent its 10,000-row limit on
load buses that draw nothing. The limit is then sized to `locatedCount`.
Lifting the agreement rule further means one point layer per stream, each
with its own scale and swatch — not deleting the check.

**A price map switches markets: RT, DA and DA/RT**, since 2026-09-14. When
a stream of pins has a counterpart in `MARKET_PAIRS` (`marketPair` in
`catalog.ts`: ERCOT's SCED LMP or RT SPP against the DAM SPP, PJM's bus
streams, SPP, CAISO's five- and fifteen-minute markets, NYISO), the map's
top-left corner carries a switch above the key. It is per viewer, never a
revision, like the layer toggles. Each market is its own query set, decided
at compose time (`QUERY_SETS`, with a `PLANS` entry saying which row slot is
which), and the frame only swaps which one it asks for. DA/RT is the
day-ahead hour each node's newest real-time reading falls in, less that
reading, on its own diverging scale (`SPREAD_SCALE`, grey within ±$5), with
both halves in the readout. A node with no day-ahead price for that hour is
left off. ISO-NE has no day-ahead stream: it sits out DA and DA/RT, and
the map says so under the switch (MISO did too, until `miso-dam-lmp`). Two things that bite: a new
query set keeps the old rows on screen until it lands, so `useSeries`
returns `sig` (the JSON of the set its rows answer) and everything drawn
follows that set, not the button — reading real-time rows through the
spread's plan took one stream's slot for another's. And the counterpart
reads the same column where it has one, or the headline price for the
headline, which is how `lmp_total` meets ERCOT's `spp`. `ercot-dam-spp`
joined `LOCATED_DATASETS` for this; until that deploy the API answers its
`located` query with a 400.

**color is the only channel; every node is the same dot.** Size varying with
value competed with the color rather than reinforcing it — a big pale dot
against a small bright one is genuinely ambiguous about which matters — and it
distorted density, since a cluster of expensive nodes covered more ground than
the same cluster cheap. Opacity is constant for a second reason: the legend
draws solid colors, so a node at half opacity is not the color its own key
says it is.

**Only the topmost visible layer answers a hover, and it answers or it does
not.** A readout is a number with no label on it, so falling through to the
layer beneath would put a value on screen belonging to something you are not
pointing at. That is also what makes reordering worth doing: dragging a layer to
the top decides what the map tells you when you point at it. Nodes are matched
against the nearest row rather than by hit-testing the layer — `queryRenderedFeatures`
wants pixel-exact contact with a circle three pixels across — and the threshold
is converted from pixels through the map's bounds so it stays the same visual
distance at every zoom.

**A click on a node pins its readout** until a click lands on no node. The
pin holds the node, not a snapshot: the value is read from the current rows
at render so a poll updates the number left on screen, the box re-projects on
every map `move` so it rides a pan or a zoom, and the node wears an accent
ring (a second circle layer, `dryos-pin`, filtered to one id on the dense
path; an outline on the badge on the marker path). A hover still answers for
whatever the pointer is on and the pinned box comes back when it leaves. The
click-away clears the pin only — the wire keeps its pick, because unselecting
a node is not a selection. GL paint cannot read a CSS token, so the ring's
color is read off the frame's root once when the layer is added.

**The time scale plays, and the map follows the handle while it moves.**
Play, a step either way, and 5m / 15m / 1h steps (only those at or above the
finest layer's grain) sit over a drawn track with hour marks, not a native
range — a native one has nowhere to put the hours, the hover time, or the
live/forecast line. Two things make scrubbing and playback work, and both
were invisible until frames arrived faster than every five minutes. First,
`useSeries` keeps a cursor request **single-flight**: while one frame is in
flight the newest position waits, and is asked for the moment it lands; and a
frame that lands after the cursor moved is still shown unless a newer one
already was. Dropping late frames, as the effect's `live` flag did, left the
map frozen until the handle stopped. Answers for past instants are cached by
exact request (`FRAMES`, `frameQuery` in `compose.ts`; near-present and future
instants for a minute only), which is what playback's `prefetchFrames` fills a
few steps ahead — each beat waits for its own frame (`at` on the hook), so a
slow answer slows playback rather than skipping. Second, **the dense point
layer is updated in place** with `setData`. It used to be torn down on every
change of rows and re-added on the retry timer, which a five-minute poll never
exposed and playback exposed as an empty map the whole way through.

Two more make it fast. A scrubbed frame is narrowed to about one reading
of its stream — `scrubStart` on the map's queries, applied only at a cursor,
because a live query with a start bound would empty the map whenever a
collector ran late — which halved it to 713 rows and 0.45s at the API
against 0.75s. **Live, those queries reach back a day** (`LIVE_REACH` in
`atInstant`), because no start bound at all was the slow path: the API
ranked a stream's whole history for its newest rows, and PJM's RT bus
stream answered in 4–18s live against 0.7s bounded to 24 hours — the same
rows, and a map waits for its slowest stream. A day still never empties a
map over a late collector. And frames are asked for before the handle gets there: under
a pointer resting on the track, and three steps on in the direction a drag
or a key is moving, through one prefetch queue three deep that drops stale
asks. Measured: a prefetched step redraws in about 30ms, a cold jump in
about half a second. Loading is shown on the map, never in words: a bar
sliding along the top edge and a shade over the map while what is drawn is
not what was asked for, only after 150ms so a cached frame never flickers
it. The workspace bar's "querying…" and "updating…" marks went for the
same reason, and the data route meters with `after()` so the Supabase
round trip is no longer on every frame's critical path.

**Particles cannot go beneath the basemap.** The field draws on a canvas
composited over the whole map, and the basemap is opaque, so a particle layer is
pinned to the top of the order and the layer panel says so rather than offering
a handle that would do nothing. Everything in the GL stack reorders through
`moveLayer`.

### Field, motion and located

Three ways a schema can be mappable without `geo.ts` knowing where anything is.
`Schema.field` (entities are a grid, drawn as a surface) is live behind
`openmeteo-wind-field`, and declaring `vector` alongside it names the speed and
direction columns that make particles possible. `Schema.located` means the rows
carry their own `lat`/`lon`, which is the weather case: NWS publishes a
station's coordinates on every observation, so the map places from the row and
drops the "approximate" caveat that would be a lie about a runway.
`Schema.motion` (rows carry `lat`/`lon`/heading, drawn as tracked objects) has
no schema behind it and stays for a positions feed to re-enter by setting one
flag. The load-bearing gotchas, so they are not relearned:

- A grid cell id carries its own position (`G_315_1005` is 31.5°N 100.5°W) —
  no lookup table travels with the data.
- The heatmap radius must exceed the grid spacing or the field renders as one
  dot per cell; both field treatments re-apply on `style.load`, because
  `setStyle` throws away every source and layer the map did not come with.
- Motion icons: Mapbox only tints signed-distance-field icons, so there is one
  canvas-drawn image per altitude band and a `match` picks between them —
  `icon-image` must match over **literal names, never a `concat`-built one**,
  which silently draws nothing.
- `accepts` exempts field, motion and located schemas from the geography
  check; for everything else `lib/workspace/geo.ts` supplies approximate
  zone centroids — convenience, not published locations, and the map says
  so. A nodal price stream is mappable only as `located`, with the API
  joining the coordinate (see *ERCOT nodes are placed through their units*);
  `mockLocations`, the flag that once let the map invent a position per
  node, went with `geoMock.ts`.

### The compile gate

An agent's output is bundled with esbuild before anything is written. If it does
not build, the error goes back to the model once; if it still does not build,
**nothing is saved and the app keeps running what it had**. Same shape as the
collector pipeline — stage, validate, promote — applied to code. Pulled
revisions pass the same gate individually, so one that fails is skipped and the
rest still land.

### Domain is a setting; category is a chip

The explorer navigates two levels, and they get different controls because they
are different decisions. **Domain** — Energy, Weather, Aviation — is the subject
you work in: chosen once and left alone, so it lives in a select of its own
above the search where a setting belongs. **Category** is what you flick between inside it,
so those are chips. Group headings then drop the domain, since the select
already said it.

### One panel, three stages: choose the shape, then its data, then look

Data and Build are one panel taken in stages, because split into halves
neither had room. Each stage gets the whole column, and `BuildPanel` owns
the stage — the page only says what is selected and when a drop has landed
(`resetTick`, bumped on every landing so the panel goes back to the shelf).
**The shape is chosen first.** The order was data first for a long time,
and it asked the question backwards: nobody opens the panel knowing they
want HB_NORTH, they open it knowing they want a chart, and a shelf greyed
against a selection nobody had made yet explained refusals of things
nobody had asked for.

- **Library** — the shelf, and the beginning. Three sections in one scroll:
  **Components** (the base shapes, every one clickable — "shape" is the
  code's word, never the reader's — minus any marked `sourceOnly`, which is
  the Node search), **From the community** and **Wired groups** (published,
  `lib/workspace/community.ts`, each bringing its own data). It is called the Library rather than "Components" because that is
  the word for a tile on a page and the shelf also holds groups of them;
  `SHELF` in `BuildPanel.tsx` is the one place the word lives. Your saved components are not on it today (`library.ts`
  and the `?component=` preview still stand), and the name is where they
  would go.
- **Data** — the explorer, opened by clicking a shape, with the shape named
  in a strip above it ("‹ Library · Chart · pick its data"). The footer line
  carries the shape's `accepts` verdict on the selection so far and Next is
  disabled until it passes. The tile editor's data stage passes the same
  `verdict`, so adding a fifth series to a chart is refused in the same
  words in both places. At the bottom sits the **data guide** (`AskData.tsx`,
  backed by `dataAgent.ts`) — describe what you want and get selectable
  `DataRef` chips back.
- **Preview** — the shape running on the selection, its settings above it,
  under the same "‹ Data · N selected" strip the tile editor wears (chips
  removable in place), and **that preview is the only thing that can be
  dragged onto the page** (a dashboard is a layout, and a button labelled
  "Add" cannot ask where). "‹ Library" in the box header drops the choice
  and goes back to the shelf.

A published component or group skips the explorer — it brings its data —
and so does a shape whose `accepts([])` passes (the title). A published
group opens as its members
  in stacking order with the wiring on the rows — names, not N frames — and
  the list is the handle: it leaves as the same `group` payload a staged
  group leaves the wires strip with, wearing the next unused wire color
  (`wiredGroupCount` reads the manifest the page passes in). Group recipes
  declare no wiring; `communityGroups()` points every followable member at
  the first source, the tray's own rule, so a recipe cannot carry a stale
  index. The custom-component box at the bottom is
  for the thing no shape covers: a sentence picks a base and opens
  `ComponentEditor` already running it. The selection survives every move
  between stages and every landed drop — spreads need picks from two
  streams, and the next tile usually wants the same data.

  Community components are declared as **recipes, not specs**: a stream, its
  entities, a shape and its settings, with the `DataRef`s rebuilt from today's
  catalogue on every read — the same reason `Revision.refs` sits beside
  `Revision.intent` rather than inside it. Everything published is
  Dryos-authored today, the same honest placeholder the community tab on the
  shelf carries. None of them carry frozen source, deliberately: a published
  component that is a shape plus a selection can be re-tuned and refined by
  whoever takes it, where frozen source can only be run.

  A saved or published component previews **by id** (`?component=`,
  `?community=` on `/api/workspace/preview`) rather than by an inlined spec —
  a refined one carries its finished TSX, and a few kilobytes of it in a
  request line is not something to rely on. Base shapes still travel whole,
  so the frame's address stays a pure function of what is on screen.

A custom component still has to start from something that compiles, so it
starts from the shape the selection fits — one series is a ticker, anything
else a chart — and the agent rewrites from there.

The **whole-app chat is gone**. Editing a page by describing the whole page was
always the blunt version of this; a request scoped to one component can be
previewed before it lands, which is the thing that made it safe to ask for.

The panel's **width is draggable** at its left edge (320–840px, remembered per
machine in localStorage). The handle uses pointer capture, which is what keeps
the drag alive when the cursor crosses the dashboard iframe.

### The explorer browses; it no longer asks

The data explorer is a filtered, grouped list of the catalogue built client-side
from `catalogRefs()`. Browsing beat asking: the catalogue is small enough to read,
and reading it is faster than describing what you want to a model that then
describes it back.

It has two levels now, governed by one rule: **a set small enough to read is
taken whole; a set too big to read is narrowed until it is, then taken whole.**
Small streams (an `entityKey`) select in one click and fan out. Large streams
open into a set view — tiers as chips (`facets` on the nodes API, derived from
the data's own classifier column, never declared), curated one-liners for the
~20 names people quote (`entityNotes.ts` — destined to become maintainer-
published glossary, not to grow in the frontend), search over the rest, and
"add all N" whenever the tier in view is chart-sized. The rule is deliberately
industry-neutral: sectors, metros and asset classes are the same shape as
hubs, so a new vertical adds facts, not UI. The selection outlives the
navigation — spreads need picks from two streams, so chips accumulate
globally and never reset on drill-in.

**The map reads the catalogue at a different grain, and the explorer is told
which shape it is for.** `DataExplorer` takes `shape`; for the map it lists
only what `mapTreatment` can draw — drawability, never domain, because a wind
field under price pins is the case the map exists for — each card carries its
coverage line ("8 of 1,118 have known locations") before the click, and one
click takes the whole stream as a layer, with "narrow ›" opening the set view
as the second gesture. A chart is built out of rows, so a large stream opens
into its entities; a map is built out of layers, and picking HB_NORTH first
and then hunting for "select all" was the chart's gesture applied to the
wrong shape. The coverage line used to surface only afterwards, on the
footer, as `accepts` refusing what had already been picked.

Selecting data writes nothing. Picking data and dragging a shape covers what
people actually do, costs nothing and returns in a second; a sentence is for the
thing no shape can express, and it lives in the custom-component box instead.

**A set is one fetch, and everything in it is a filter over that fetch.**
Opening a set calls `/api/workspace/entities` once with the API's cap of
2,000, and the response carries the rows, the tiers (`facets`) and the true
entity count (`coverage.nodes`). Tier chips and the search box filter the
rows in hand, in about 7ms, matching the `entityNotes` one-liner as well as
the id; a search runs over the whole set with the open tier's matches
leading, and the other tiers' under an "elsewhere in this stream" heading.
The only stream that still asks the API while typing is one past the cap —
the bus LMPs, 19,392 entities — where `beyond` (true count minus rows held)
is positive and a debounced `q=` call finds names the cap left out, landing
under the same heading without moving anything above it.

**It was three calls, and the endpoint was the defect — not the aggregate.**
Against the hosted Postgres `/nodes` took 13–14s a call, and the explorer
made two in series on open (the unfiltered call for the tiers, then the
tier) and one more per keystroke for "elsewhere". EXPLAIN ANALYZE on the
box split it: the per-node GROUP BY the endpoint exists for was 0.8s, and
the two `COUNT(DISTINCT)` queries beside it — coverage and facets — were
6.4s and 10.4s, because Postgres sorts the whole table for a DISTINCT and
both sorts spilled 150 MB to disk at `work_mem=32MB`. Both were facts about
the table recomputed for every request, filtered ones included.
The endpoint now scans once per dataset per collector run, derives
coverage and facets from the grouped rows (the tiers are the rows counted by
type), filters `q` and `node_type` in hand, and keys the held summary on the
newest passing run's `finished_at` — the same signal `/v1/events` watches. A
newer run serves the held summary and refreshes behind it, single-flight, so
only a worker's first request for a dataset blocks on the scan (1.3s for RT
LMP on the box, 7s for the 38M-row bus stream); everything after is
milliseconds. Deployed 2026-09-05: a filtered call answers in 0.16s from
here, most of it the round trip.

**`lib/workspace/dataAgent.ts` and `AskData.tsx` are dormant again.** The
Search/AI toggle that reached them is gone: a mode switch welded to a search box
is two features fighting over one control, and search is what people do almost
always. What went with it is the one thing browsing cannot do — look inside a
schema at the 1,118 actual settlement points and answer "which node is the
Austin one?". The honest way back is the moment a search returns nothing, where
the offer costs no chrome the rest of the time.

The Build agent (`lib/workspace/agent.ts`) still has no data access, and that
separation still holds.

### The sandbox

An app is one React component in an iframe with `sandbox="allow-scripts"` and no
`allow-same-origin`, so it runs in an opaque origin. It reaches data only through
`dryos.query()`, which posts a message to the host; the host fetches and posts
back. The app never holds a credential and never meets CORS, and every data call
passes one place that could meter it later.

Opened directly (not framed) the shim self-serves, so
`/api/workspace/apps/{id}/bundle/{version}` is a working shareable preview.

Four things that will bite:

- **Never inline the bundle into HTML.** React's source contains the literal text
  `<script>`, which puts the HTML tokenizer into double-escaped script state and
  the closing tag stops ending the element. Serve it from `/script/{v}` instead.
- **esbuild must stay in `serverExternalPackages`** (`next.config.ts`) or webpack
  tries to parse its `.d.ts` as JavaScript.
- **The revision goes in the URL path, not a query string.** The frame remounts
  via React `key` on save; a path keeps each revision individually addressable.
- **The frame's scrollbar is drawn classic, not as macOS's overlay.** A
  screen taller than the window has to say so at rest, and the overlay
  scrollbar hides until touched. Styling `::-webkit-scrollbar` in `BASE_CSS`
  is what opts out of the overlay — and Chrome ignores those rules the
  moment `scrollbar-width` or `scrollbar-color` is set on the same element,
  so the standard properties sit behind `@supports not selector(...)` for
  Firefox only. Overflow stays `auto`, so a screen that fits shows nothing
  and a taller one gives up a 10px gutter. **The 120px growth strip under
  the last tile exists only in edit mode** — it is the drop target and the
  resize floor, and launched it was 120px of overflow that put the
  scrollbar on a page whose last tile ended anywhere near the fold. Outside
  edit mode the canvas is exactly `bottom`, so a tile sitting on the fold is
  still a screen that fits. Bare and naked frames (thumbnails,
  previews, the tile being carried) get `html{overflow:hidden}` instead: a
  postcard is looked at, never scrolled.
- **recharts 3 makes every chart focusable** (`tabIndex=0` on the SVG for
  its keyboard layer), so a click on the plot focused it and the browser
  drew its blue ring around the chart as if it had been selected. `BASE_CSS`
  in `runtime.ts` sets `outline: none` on the wrapper and the SVG; nothing
  on a tile answers the keyboard, so no focus indication is lost.
- **Console `SecurityError`s about `localStorage` in the frames are browser
  extensions, not the app.** Extensions inject content scripts into every
  frame, sandboxed ones included, and anything they do with storage throws
  `document is sandboxed and lacks the 'allow-same-origin' flag` — pages of
  stack traces from code named nothing like ours (`helper-app.*.js`,
  `@plasmohq/storage`). Nothing in a generated app touches storage; chasing
  these is an afternoon spent debugging somebody's job-hunt extension.

### A feed advancing is announced, never delivered

`GET /v1/events` on the delivery API (not in this repo) is a
server-sent event stream saying *which dataset* just landed rows and *when*,
and nothing else. Rows never ride on it: a tile that hears its dataset
refetches through the metered query path it already uses, so metering,
rollups and the cursor rewrites know nothing about the stream, and a dropped
stream degrades to exactly the polling every tile still does. The reasons it
is shaped this way, so nobody "improves" it into a data channel:

- **It terminates on the VPS and the browser connects directly**
  (`lib/useFeedEvents.ts`, from `NEXT_PUBLIC_DRYOS_API_URL`), because a
  Vercel function cannot hold a connection open. That is the same
  browser-to-API hop the feeds menu makes, and it needs the same
  `API_CORS_ORIGINS` entry.
- **It is public and carries no data on purpose.** The announcement is what
  `/v1/status` already publishes to anyone, which is what lets a bare
  `EventSource` serve — no auth header to set, and the browser's own
  reconnect kept. Put rows on it and it becomes a data-plane route needing
  the token, a hand-written retry loop, and metering on the box.
- **The signal is the runs table, not the scheduler.** Each API worker
  re-reads `collector_runs` every few seconds (`EVENTS_POLL_SECONDS`) and a
  pass with rows written whose `finished_at` moved is the event. The
  scheduler is another container and the API runs two workers, so an
  in-process bus reaches nobody; `LISTEN/NOTIFY` reaches everybody on
  a hosted database and nobody on the one a laptop runs. For a vintaged feed the
  run is also the honest freshness signal the interval watermark cannot be.
- **Event ids are the run's `finished_at`, not a counter**, because a
  reconnect may land on the other worker and a timestamp means the same
  thing in both. Replay from `Last-Event-ID` is inclusive (a tie split by
  the disconnect costs one duplicate refetch), and the server says `resync`
  rather than guessing whenever it cannot vouch for the gap: not baselined
  yet, an id older than its baseline, or a ring that has evicted past it.
  Resync reaches the frame as a null dataset list, and every hook refetches
  once.
- **The frame is told, never fetches.** `Runner` posts `advanced` to every
  adopted window and `streaming` on change and on load, the way it posts the
  theme; the shim turns them into `dryos:advanced` and `dryos.streaming`.
  **`useSeries` does not poll at all while streaming is on**, and is back on
  cadence the tick after it drops — the poll is the floor, the stream
  replaces it. Model-edited pages hear the events and keep polling as
  before; only generated hooks act on them.
- **"Streaming" is watched, not assumed**, because the tiles stop polling on
  its word. `EventSource` never notices a half-open socket — a laptop lid, a
  proxy that dropped the connection without a FIN — so the server's keepalive
  is a named `ping` event every twenty seconds rather than a comment, and
  `useFeedEvents` closes, reopens and reports not-streaming after a minute of
  silence. A comment frame would have kept proxies happy and told the client
  nothing.
- The stream stays open in a hidden tab. One idle socket is cheaper than the
  polling it stands in for.
- **Coming back is handled, not waited out.** A laptop waking from sleep
  looks like a failed fetch (the request left before the network did), and
  with no poll running the failure would sit until the next event. So
  `useSeries` retries a failure on a 5s→60s backoff, keeps the numbers it
  has and wears the header's `loading…` mark while it does (only a tile with
  nothing to show gets the red box), and reloads on `visibilitychange` or
  `online` when its last load is over half a minute old. The host does the
  same for the stream: a missed beat on return reopens it at once instead of
  waiting the watchdog's minute.

**New data flashes.** `useSeries` returns `fresh` beside the rows: which
queries brought a newer interval than the load before, and a `seq` that
climbs on each advance. A chart rings its newest point (`freshDot` in
`compose.ts`, a recharts `dot` that draws only on the point whose timestamp
is the newest of the queries the series is made of) and a ticker lifts its
value to the accent — three beats, then the marker is gone, so a still screen
carries nothing. The first load of a query set is the baseline and never
flashes, a retarget or a scrub resets the baseline, and preview rows never
flash because sample data has nothing new in it. The ring is keyed on `seq`
so a second advance inside the first restarts it; recharts owns the outer
element's key, the inner one is ours.

**While the point is ringed, its readout shows too** (`useFreshPeek` in
`compose.ts`, called from the chart emitter): the same tooltip a hover
would draw, at the point, for as long as the ring lasts, so a screen on a
wall says *what* arrived and not only that something did. It is recharts's
own hover driven, not a second tooltip drawn to look like it: a synthetic
`mousemove` at the ring's position goes up to the chart wrapper, which reads
`clientX`/`clientY` against its own rect like any real move, and a
`mouseout` with a relatedTarget outside the chart is what React turns into
the wrapper's `onMouseLeave`. Neither `defaultIndex` nor the sync bus would
do: `defaultIndex` only shows on a chart the pointer has never touched, and
the sync emitter is not exported. The ring is found in the DOM over a few
frames rather than handed over, because the rows reach recharts's store one
render after the hook has them and the flashing point does not exist yet
when the effect first runs. A pointer already on the tile wins both ways —
nothing is sent while the reader is hovering, and the trailing leave is
skipped if they arrived during the flash — and only `mousemove` is sent,
never `mouseover`, so the tile's hover chrome does not light for a pointer
that is not there. Verified over CDP with a `fetch` patched into the
standalone frame: the in-app pane reports `visibilityState` hidden while a
script runs, so neither the hook's frames nor recharts's rAF-throttled move
handling advance there, and a tooltip seen after a screenshot is a stale
queued move, not the hook.

Verified without a session: hold `curl -N http://127.0.0.1:8000/v1/events`
open and wait for any collector to land rows; the event arrives on the next
tick. Running a collector on demand needs the backend, which is not in this
repo — against the hosted API, watch a fast stream and a tick will come. After a deploy, the same curl against
`api.dryos.ai` has to show frames arriving one at a time — Caddy's
`reverse_proxy` flushes on the content type, but `encode gzip` sits in front
of it, and if they burst the fix is excluding `text/event-stream` from the
encoder.

### The shelf is a community, not a template list

The first tab is **Community** and it opens by default — what other people have
published is the reason to come back, and your own apps are one click away when
you already know what is in them. Cards are attributed (`Template.author`)
because the shelf is meant to fill with other people's work, and a card that
never names an author has nowhere to put one later.

`CommunityPanel` beside it derives both rosters rather than asserting them:
maintainers from `Schema.maintainer`, builders from the revision history of the
apps that exist. A schema nobody has claimed is shown as **open**, not omitted.
Every stream is Dryos-maintained today, which makes the panel read as a
placeholder — the honest fix is named outside maintainers claiming feeds, not
hiding the roster.

### Templates

`lib/workspace/templates/*.tsx.txt` — `.txt` on purpose. They are content an
agent rewrites, not code this app compiles, and naming them `.tsx` would drag
them into typecheck and lint for a project they never build into.

## Signing in

Supabase owns identity; nothing else does. The pieces, and the shape of trust:

- **The gate is the middleware** (`frontend/src/middleware.ts`): `/workspace*`
  and `/usage` require a session — the marketing pages argue the product to
  people who have not signed up yet, which is who they are for.
  Signed out, those URLs bounce to `/login?next=…` and land back where the
  click was going. `/api/workspace/*` is gated too, but by a **local read of
  the session cookie answering 401**, never a round trip: the data route is
  polled every few seconds per tile. A cookie is a claim rather than proof, so
  that check is only what keeps the routes off the open internet — the four
  routes that spend money on a model (`ask`, `component/refine`, `apps/[id]/edit`,
  `apps/[id]/pull`) additionally call `requireUser()`, which asks the auth
  server, and every store call is RLS-verified regardless. Before the API was
  gated, anyone with the URL could run Fable through `refine` on the site's
  key; that was the thing found on the way to deploying. The seed in
  `listSpaces` still checks for a session itself, because a route handler
  should not assume what stands in front of it.
- **`/api/workspace/*` answers 401 to a signed-out caller, and the nav
  polls it from pages outside the gate.** `UsageDock` sits in `AppNav`, which
  renders on `/login` too, and it once set the 401's error body as its usage
  and read `today.queries` off it — a client exception that blanked the login
  page for everyone, in production, while the local build was green because
  local dev is always signed in. Anything polled from the chrome has to
  treat a non-OK answer as "no data", not as data.
- **A sandboxed frame sends no cookies, so the frame routes stay outside
  the session gate.** `sandbox="allow-scripts"` without `allow-same-origin`
  is an opaque origin, and the `<script src>` it loads is a cross-site
  request in the browser's eyes — the bundle document arrives with cookies
  (its navigation is same-site), the script it names does not. Gating all of
  `/api/workspace` 401'd every thumbnail on the shelf and the editor's own
  canvas, signed in or not, at several retries a second. `FRAME_ROUTES` in
  the middleware exempts bundle, script, preview and templates; they were
  built cookie-less (`getAppForFrame`, an RPC on the anon key) and shareable
  before there was a login, and that is still the design.
- **The backend verifies, it never trusts.** FastAPI checks tokens against the
  project's public JWKS, on the API side — ES256, no shared
  secret held anywhere. The catalogue routes stay public; `/query` attaches
  the verified identity (`servedTo`), which is what metering will key on.
  `AUTH_REQUIRED=false` until launch: anonymous is served, but a _presented_
  token that fails is always refused — expiry must never degrade into silent
  misattribution.
- **Keys:** publishable key in `frontend/.env.local` (public by design, run.sh
  seeds it). The `sb_secret_…` key is a server-side secret: it belongs in the
  environment of whatever makes admin calls, never in this repo and never in
  anything prefixed `NEXT_PUBLIC_`.
- Login is one card at `/login`, both verbs — sign-in and sign-up are the same
  two fields. Email confirmation links land on `/auth/callback`, which trades
  the code for cookies server-side. The account corner (`AccountButton`) says
  "Log in" when signed out rather than showing an avatar with an apology.

## Pricing is streams, not queries

The tier cards (`landing/Tiers.tsx`) are three since 2026-09-14, one per kind
of buyer — hobbyists and small teams (free to start, $150 a month for a team),
consultants ($150 a month per client plus their margin), and organizations
running their own application ($500 a month plus $25 a stream). Each prices a
**stream subscription** plus a flat
platform fee, with usage surviving only as an opt-in, capped overage past a
fair-use quota. Per-query was unpredictable for both sides, and the buyer's
side is the one that matters: a six-tile page polling every five minutes is
~52k queries a month whether anyone looks at it or not, so the bill tracked
screens left on walls. A stream maps onto a maintainer (70% of its
subscription), and warehouse delivery — streams shared into Snowflake or
Databricks — only works per stream, since a query meter never sees data once
it is in someone else's warehouse. The meter in `meter.ts` still counts
queries; that is the overage and the attribution, not the invoice. The
numbers on the cards ($150 / $500 / $25 a stream) are proposals, not a
billing system. **The lever on margin is the included-stream count, not the
split**: at $15 a stream, ten streams bundled into a $150 plan leave Dryos
30% of the plan; five leave it about two thirds. So Team includes 5 and
Business 15, and the maintainer's 70% stays a headline rather than a
negotiation.

**The deck lives at `/deck/the-invisible-hand`** (`components/deck/Deck.tsx`),
unlinked, `noindex`, and outside the login because the people it is for have
no accounts. `Nav` renders nothing under `/deck`. It reuses the landing
page's real components (the bill chart, the wire demo, the captures) rather
than pictures of them, and reads its counts from the catalogue. Slides render
one at a time so their animations play on arrival; the slide number rides in
the hash.

## Two shells, chosen by route

`components/Nav.tsx` picks between `nav/MarketingNav`, `nav/AppNav` and
`nav/SpaceNav`. Marketing is `/` and `/maintainers`, **and the door** —
`/login` and `/auth` keep the marketing bar minus its "Open Dryos" button,
because a signed-out visitor there has not entered the product and the app
bar's Workspaces tab would only bounce them back to the login. A page inside
a workspace gets `SpaceNav`; everything else is the product.

The marketing shell carries one action — **Open the workspace**. The old "Get
early access" is gone from both shells and from `AccessPanel`: there is a running
product behind that link now, and queueing people for something they can open is
worse than not asking.

The app shell has no call to action at all. Its right-hand side is the usage
meter, because the one number someone working in the app wants in the chrome is
what they are spending.

**The catalogue pages are gone.** `/marketplace` and `/datasets` were
deleted outright with every reference — the explorer inside the workspace is
the only catalogue now, and a Data tab out here was a second copy of the same
shelf. The marketing home keeps its dataset and vertical sections as cards,
deliberately not links: the copy still argues, it just cannot point at pages
that no longer exist. `CollectionGraph` is the one survivor of the dataset
landing pages, extracted to its own component because the feeds menu audits a
screen with it.

**`/docs` came back on 2026-09-13 as the API reference**, not the catalogue it
used to be: the delivery API's routes and parameters, a quick start with a
real response, the live streams (filtered by the sidebar's domain), and
instructions for an AI agent. It is public, like the catalogue routes it
documents, and is the one surface where slugs appear — it is for programs, and
there a slug is the address. `/llms.txt` serves the agent instructions as
plain text at the address agents look for. Both read `lib/apiDocs.ts`, so the
page and the agent cannot be told different things; its routes are written by
hand from the delivery API's own routes, so **a parameter added to the API is
added there too or it exists to nobody outside**, while the stream list is the
catalogue and never needs writing. The examples point at `PUBLIC_API`
(`https://api.dryos.ai`) whatever this deployment's own backend is — the
reader is somebody else's program. The agent text is instructions, not
reference: the part that matters is the rules that stop a plausible wrong
number (UTC everywhere, each operator's zone, vintages never averaged, null is
not zero, names looked up rather than guessed).

## Usage is counted, not estimated

`lib/workspace/meter.ts`, written from `api/workspace/data` — the route every app
queries through. Two rules, and they are the whole billing model:

- a live schema costs its `tokens` per query;
- a mock schema costs nothing, because it is generated locally.

That difference is the pricing claim on the landing page, so it has to stay true
in the code rather than only in the copy. `/usage` reads the ledger
(`.workspace/usage.json`) and shows live and mock rows in one table — the free
lines are the argument, so they are not hidden.

`record()` never throws and never blocks the response. Losing a line of
accounting is recoverable; refusing to serve data because accounting hiccuped is
not.

## Thumbnails serve themselves

A tile has no host. `Runner` is the only thing that answers the messages a
sandboxed app posts, so every frame outside it — app thumbnails, template tiles,
the landing pane — posted into the void and rendered **"Dryos request timed
out"** after thirty seconds.

`?preview=1` on either bundle route swaps `RUNTIME_SHIM` for `PREVIEW_SHIM`,
which generates rows locally from the catalogue's declared shapes. No host, no
network, no bill: a shelf of twelve tiles would otherwise be twelve frames
pulling the live feed to draw postcards, metered twelve times.

Preview rows are **not real, including for the live schema** — `lmp_total` carries
a `mock` block used only for this. So every surface that mounts one shows a
`SAMPLE DATA` tag, and the landing pane has no LIVE badge: that badge means "these
numbers came from the source", and on a preview they did not.

`Runner` deliberately does not pass the flag. The app you are editing is the one
place the numbers must be real.

## The hero is a try-it

Since 2026-09-14 the landing page is plain words and a demo: what Dryos is
(energy, weather and property data, checked, for dashboards, code and
agents), then `components/landing/TryIt.tsx` beside it — the assistant types
a question, the visitor picks one of four (`lib/tryIt.ts`, one per domain
and more for energy), and a chart of live rows lands with **Open this in your
workspace**. It replaced the maintainer ring and the "data vendor" headline,
which asked a first-time visitor to decode a joke before learning what the
product was; that argument lives in the deck now.

- **The rows are real and fetched on the click** (warmed on hover), straight
  from the public REST API, drawn with recharts in the page — not a sandboxed
  frame, because a signed-out visitor has no host to answer a frame's
  queries. Each question's loader in `TryIt.tsx` asks what its published
  recipe would, so the demo and the workspace show the same thing.
- **The button makes a real workspace.** `/workspace/start?recipe=<slug>`
  (gated like all of `/workspace`) creates the workspace with the option's
  name and domain and a first page built from the published slug —
  `recipePage` in `community.ts`, through the pages route's `recipe` branch,
  compiled as the gate. Only slugs on the try-it list are made; a link can
  name a recipe, never invent a workspace. The middleware carries the query
  through the login now (`next` is path *and* search), which is what lets a
  first-time visitor sign up and land on their pick.
- `zone-weather` and `austin-solar` were published for it, so the community
  shelf carries a weather and a property component too.
- Weather uses the Open-Meteo zone forecast, not NWS observations: the
  station collector had stopped at 2026-09-04 when this was built.

## The mark

`dryos` in Sora 800, tight-tracked, and nothing else. Loaded through `next/font`
so five characters are not a render-blocking request to a third party; styled
once in `globals.css` as `.dryos-mark` and sized in **`em`**, so one class serves
the chrome and any larger surface without a second definition drifting from it.
It takes `--color-ink` and reads on either ground.

### Loading is a skeleton, not a splash

`components/Skeleton.tsx`. A skeleton beats a spinner because it **commits to a
layout**: the page does not jump when the data lands, since the blocks were
already the right size in the right places. `ScreenSkeleton` even lays out the
twelve-column grid a page is arranged on, and takes `withPanel` from the same
`?edit=1` the page does, so nothing shifts on arrival.

Deliberately dumb — a pulse, no shimmer sweep, no staggered reveal. Skeletons
that perform are skeletons you notice, and the whole point is that nobody
should.

**A busy flag cleared in a `finally` beside a `router.push` lies.** `push`
returns the moment it is called, not when the new route has rendered, so the
button went back to "New page" while the old screen was still up and the server
was still working — the click announced it had finished and done nothing, which
is worse than no indicator at all, because a control that claims to be done
invites a second press and that endpoint creates a page per call. The flag has
to survive the navigation and be cleared only on the paths that stay on the
page. Where a form has failure exits that also stay put — a wrong password, a
confirmation notice — that needs a `leaving` flag rather than a bare early
return, or the button is stuck disabled instead, which is the same lie in the
other direction.

## Where the numbers live

The account owns the top-right corner of the chrome, and **spending sits beside
it**: `UsageDock` with `placement="nav"` in the workspace bar. It floated
bottom-left over the canvas first, on the argument that a page runs edge to edge
so anything about the page must live on it — but that put an object on a surface
whose whole point is that it carries nothing but the dashboard, and left it
fighting the sentence box for the same corner. One component still serves both:
the floating pill is what the workspace's own page uses, having no bar to sit in.

Clicking it **grows it in place** rather than opening a dialog in the middle of
the screen — the number you clicked stays where you left it and the detail
unfolds from it. In the bar that means the account menu's idiom exactly: a
`relative` wrapper with the panel `absolute top-full right-0`, closing on an
outside click or Escape. Anchoring it `fixed` to the window's right edge only
_looks_ the same until the bar's right-hand cluster changes width and the panel
drifts off the thing that was clicked. The floating pill keeps its `✕` and
nothing else, because out there a click away is somebody arranging tiles.

Inside either: **Today / This week / This month**, scoped to that workspace.
`/api/workspace/usage` takes `?app=` for one page, `?space=` for every page in a
workspace, or neither for everything this machine has served.

## Deploying the frontend to Vercel

The Vercel project is `dryos` with `frontend/` as its root directory, building
on Node 24. Three things there are not obvious from a passing local build:

- **Never list a platform binary as a dependency.** `@tailwindcss/oxide-darwin-arm64`
  sat in `devDependencies` because local Node 18 fails Tailwind's `>=20` engine
  check, so npm silently skipped the optional binary and the direct pin was the
  workaround. On Linux that pin is `EBADPLATFORM` and the install dies before
  the build starts. The binaries are optional dependencies of `@tailwindcss/oxide`
  and npm picks the right one per platform; the fix for the local side is Node
  20+ (`frontend/.nvmrc` says 22), not a pin.
- **The starter templates are `.txt` files read with `fs`, and the file tracer
  never sees them** because the path is built from a variable. Without
  `outputFileTracingIncludes` in `next.config.ts` the local build passes and a
  deployed function creating a page from a template gets `ENOENT`. Check any
  new request-time file read the same way: grep the route's `.nft.json` under
  `.next-check/server/app` for the file.
- **The sandbox's own imports are request-time reads too.** `compile` hands
  esbuild `react`, `react-dom/client` and `recharts` inside a template string,
  resolved from `process.cwd()` when a bundle is asked for, so webpack never
  sees them and the tracer copied none of them — every page in production
  failed with `Could not resolve "react-dom/client"` while local dev, which
  has `node_modules` regardless, was fine. `sandboxPackages()` in
  `next.config.ts` walks the installed closure of those three (42 packages,
  ~45 MB) into `outputFileTracingIncludes`; anything a generated app is
  allowed to import goes on that seed list, not into the agent prompt alone.
- **`maxDuration` is capped at 300 on the Hobby plan**, and a route declaring
  more fails the deployment _after_ a green build, with the real message only
  in the deployment record (`errorCode: invalid_max_duration`) — the dashboard
  shows a generic "project or build error". `pull` said 600 once.
- **The deployed filesystem is read-only and has no `.workspace/`**, so the
  one-time local import returns before touching Supabase when the seed
  directory is absent. Anything else that writes to disk at request time will
  fail there and pass locally.

**The site is `https://www.dryos.ai`** (the apex `dryos.ai` 308-redirects to
it — checked 2026-09-14, the opposite of what this line once said), and every
URL the site hands out is on `www`: `SITE` in `lib/apiDocs.ts` feeds the
canonicals, sitemap, robots, `llms.txt` and both MCP URLs. A canonical on
the apex would name a redirect, and an MCP client will not follow a 308 on
a POST — nor accept protected-resource metadata whose `resource` names a
different host than the one it connected to. The API is
`https://api.dryos.ai` on the VPS. Vercel also answers on a `*.vercel.app`
hostname, but nothing should name it: the API's `API_CORS_ORIGINS` once
listed only that hostname, so the feeds menu — the one thing that calls the
API from the browser rather than through a Next route — was refused on the
real domain while every server-side proxy worked.

Environment variables the deployment needs, all set in the Vercel project:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the site is
reachable without them but nobody can sign in), `ANTHROPIC_API_KEY` (the
refine box), `MAPBOX_TOKEN` (maps say so when it is missing), and
`DRYOS_API_URL` / `NEXT_PUBLIC_DRYOS_API_URL` once the backend has a public
address — unset, the catalogue routes fall back to `127.0.0.1:8000`, which is
nothing on Vercel, so the explorer lists the static catalogue and every tile
fails to load data.

## Conventions

**Commits carry no AI attribution.** No `Co-Authored-By: Claude` trailer, no
"Generated with Claude Code" line on a PR. `.claude/settings.json` sets
`attribution.commit` and `attribution.pr` to empty strings, which is what
turns the harness's trailer off; this note is so nobody reads the setting as
an accident and puts it back.

**Design tokens.** Everything reads CSS custom properties from
`frontend/src/app/globals.css` — dark-first, ink-blue ground, acid chartreuse
accent that doubles as the healthy signal. Light mode inverts the accent to a
deep olive so `text-accent` keeps working untouched. Never hand-mix a tint; use
the `-dim` fill and `-line` border a status already has.

**The delivery record is the one deliberate exception to the token rule.**
`CollectionGraph`'s cells and the feeds menu's stream dots are fixed
emerald/amber/red in both themes: a delivery record is read as a status board,
green/yellow/red is the one encoding nobody has to learn, and the ok chartreuse
next to amber read as warning-adjacent. Do not retokenise them back to `ok`/`warn`.

**The page ground stays quiet.** `dr-page-bg`'s grain, contours and pools sit
just above the threshold of being noticed. Contrast belongs to the content — a
backdrop that competes with a card is a backdrop doing the card's job badly.

**Sandboxed apps follow the theme too.** `runtime.ts` ships **both palettes** in
`BASE_CSS`, because a frame is an opaque origin and cannot read the host
document. Resolution order matches the host's: `prefers-color-scheme` as the
guess, an explicit `data-t` as the answer. The host supplies it twice — on the
URL (`?theme=`) so the first paint is already right, and by `postMessage` (via
`lib/useTheme.ts`, which watches both `data-theme` and the media query) so a
frame follows a theme that changes under it. Thumbnails and previews have no
host, so the URL is all they get.

**Charts** are recharts, already a dependency. Always a `<Tooltip>` with custom
dark `content` — the default is white and unreadable here. Never hand-roll an SVG
polyline; a chart the reader cannot hover is not finished.

**A tooltip marker takes the payload's `stroke`, never its `fill`.** A recharts
`<Line>` carries a default `fill` of `#fff` that it never paints, so reading
fill first drew every swatch in every tooltip white — the one mark whose whole
job is to say which line this is, saying nothing, with no error anywhere. The
single exception is a stacked area, where the stroke is the surface-colored
hairline between segments and the fill is the identity.

**A hover readout is positioned by `transform`, never by `left`/`top`.** The
heatmap's cell tooltip is `position: fixed`, and a fixed box handed a `left` near
the right edge is shrink-wrapped into whatever room is left over there — every
line of it wrapping into a column, at the one moment somebody is reading it, and
only ever at the right-hand edge of a tile. Laid out at the origin and moved with
`translate(Xpx, Ypx) translate(-50%, …)` it takes its natural width first and is
placed afterwards; capping that width is then what makes clamping it inside the
frame arithmetic rather than a guess.

**Animation** is GSAP (`frontend/src/components/hero/anim.ts`). Entrances are
deferred until the document is visible: `gsap.from()` hides its target
immediately and only uncovers it as the ticker runs, and the ticker is rAF, which
a background tab starves. Without the guard a hero opened in a background tab
sits at opacity zero.

**Comments** explain why, not what. Match the density already in the file.

## Claude API code

There is a `claude-api` skill — read it before writing or changing any Anthropic
SDK call. Current usage: `claude-opus-5` by default, adaptive thinking,
streaming for anything that generates a file. Do not reintroduce
`budget_tokens`; it is rejected outright on Opus 5.

The chat's model picker is backed by `lib/workspace/models.ts` — one roster
serving the composer UI and the server-side validation, so the picker can
never offer what a call would refuse and a request cannot smuggle an
arbitrary string in as a model id. The per-model flags there are API facts,
not preferences: `output_config.effort` is a **400 on Haiku 4.5** (so the
Effort control disappears when Haiku is selected), adaptive thinking does not
exist on Haiku (the `thinking` param is omitted entirely, never sent
disabled), and the server-side refusal fallback
(`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`) rides
only on Opus 5 and Fable 5. Fable additionally requires 30-day data
retention org-side — a 400 from it surfaces in the chat as an ordinary model
failure.

## Verifying in the preview pane

The in-app browser **blocks iframe navigation** (`ERR_BLOCKED_BY_CLIENT`),
whether the frame is declared in the page or created by script. So the workspace
preview and the app thumbnails render white there while being fine in a real
browser. Verify app rendering by opening the bundle URL directly in a tab, and
check the layout around it separately.

**A bundle URL needs an app id, and an app id is a row in somebody's account** —
so when the thing under test is the canvas itself rather than one tile, there is
nothing to open. `composeApp` and `compile` are ordinary functions with no
request behind them: compose a manifest, write the compiled bundle and a
`buildDocument(url, { preview: true })` document into `frontend/public/`, and
open that. It is the real generated source, the real `Section`, real dragging and
resizing, on sample rows, with no session and no bill. Delete both files after —
`public/` is served. `/api/workspace/preview` is not a substitute; it composes
exactly one tile, and one tile cannot be arranged.

Running those functions outside Next takes one esbuild step — there is no tsx
in the repo, and the workspace lib imports are all relative, so no alias
config is needed. From `frontend/`, bundle a scratch entry that imports them
by absolute path (`./node_modules/.bin/esbuild entry.ts --bundle
--platform=node --format=cjs --external:esbuild --outfile=entry.cjs`), then
`NODE_PATH=./node_modules node entry.cjs`. esbuild stays external for the same
reason it is in `serverExternalPackages`, and `NODE_PATH` is what lets the
bundle find it at run time.

**The same trick renders a host-side panel with no session.** `/workspace*`
is behind the login and the in-app browser cannot sign in, so a change to
`BuildPanel` or any other editor pane has nothing to open — but the pane is
one client component, and a scratch entry can `createRoot` it into a static
page under `frontend/public/`. Five things differ from the frame recipe, and
each fails silently or with a message pointing elsewhere: the panels import
through `@/`, so pass `--alias:@=./src`; the entry lives outside `frontend/`,
so `react` resolves only with `NODE_PATH=./node_modules` set for esbuild
itself, not just node; the bundle is `--platform=browser` and something in the
tree reads `process`, which is `ReferenceError: process is not defined` at
load with a blank page, so `--define:process='{"env":{}}'`; `tsconfig.json`
says `jsx: "preserve"`, which esbuild answers with classic
`React.createElement` calls in every component that never imports React
(the codebase writes against the automatic runtime — forty of them in one
panel bundle), so `--jsx=automatic` or the page is blank with `React is not
defined`; and Tailwind's output is not a file on disk — link `/_next/static/css/app/layout.css`
straight off the running dev server, which is where every class the panel
uses is compiled. The frames inside it still render white (the pane blocks
them), but the shelf, the header states and a scripted `dragstart` on the
handle — read the payload back off the console — all run for real.

Three things bite in there:

- **A hidden browser pane lays the page out at zero** — `window.innerHeight`
  is 0, and so is the width, so anything measured in `vh` (the canvas's own
  floor is) or off `getBoundingClientRect` resolves to nothing with no error
  anywhere. Worse, a page _loaded_ while the pane is hidden keeps its
  zero-width layout after the pane fronts. Take a screenshot first — it
  fronts and displays the pane — and read the numbers back from the DOM
  before believing any of them.
- **Driving HTML5 drag from script, `dragover` and `drop` must land in separate
  ticks.** `onDrop` reads the ghost `dragover` set, and inside one synchronous
  block React has not rendered it yet, so the drop silently does nothing. Real
  dragging fires `dragover` continuously and never reaches that state, which is
  what makes it look like a bug in the code rather than in the test.
- **Standalone, the frame is its own host** — `parent === window` — so the
  host's half of the message protocol can be played by hand:
  `window.postMessage({ __dryos: "dragover", … })` drives the incoming-drag
  path, and the frame's `spot` answer arrives back on the same window. Edit
  mode is off by default out there; `{ __dryos: "mode", edit: true }` turns
  the handles on.

**A real page in a real account is one command** (the `seed-page` skill,
`frontend/scripts/seed-page/run.sh`), for when a harness page is not enough —
the live numbers, the wires, the editor around it. It lands a published group,
a published component, a recipe file in `PUBLISHED_GROUPS`' own format, or
another page's manifest, the way the edit route's group branch would: composed,
compiled as the gate, then written with `SUPABASE_SECRET_KEY` from
the environment (the one credential that can write another user's rows; every
row sets `user_id`, whose `auth.uid()` default is null under it). The stored
source is a stub the frame never reads — it composes from the manifest — and
`--remove` / `--remove-space` take test pages back out. The owner sees it with
live data; a session here sees it only as layout, because the data route
answers 401 without a cookie.

**Two `next dev` processes sharing one `.next` corrupt each other**, and the
symptom points nowhere near the cause: every `/bundle/{v}` request answers
500 with `__webpack_modules__[moduleId] is not a function` (or `Cannot read
properties of undefined (reading 'call')`) from `store.ts`, because the
route's chunk asks for a vendor module the other compiler's rebuild just
rewrote. It happened with the desktop app's server on :3000 and a second
`npm run dev` started from a VS Code terminal — the second one never bound a
port, so it looked idle while its compiler kept writing `.next/trace` and
server chunks on every edit. Before chasing a module error, run
`pgrep -fl next-server`; there should be exactly one. Then stop both,
`rm -rf .next`, and start one.

`npm run build:check` exists because dev and build otherwise share `.next` and a
verification build kills the running dev server. Always use it, never `npm run
build`, while the dev server is up.

Deleting a route leaves stale generated stubs under `.next/types` and
`.next-check/types`, and the next `tsc --noEmit` fails with module-not-found
errors pointing at the files just deleted — which reads as a missed reference in
source when the source is already clean. `rm -rf .next-check` (it regenerates on
the next check build); the dev server rewrites `.next/types` on its own.

## Where things live

```
frontend/src/
  app/
    workspace/                     the shelf of workspaces
    workspace/[space]/             one workspace: its pages as thumbnails
    workspace/[space]/[page]/      a page — the editor and the running screen
    usage/                         the whole-machine ledger
    api/workspace/                 apps · spaces · data · usage · preview · components
  components/
    nav/                           MarketingNav · AppNav · SpaceNav · AccountButton
    workspace/                     DataExplorer · BuildPanel · ComponentEditor ·
                                   Runner · UsageDock · SpaceCard · CommunityPanel
  lib/workspace/
    catalog.ts      the schema tree, prices, DataRef
    components.ts   the four typed shapes and their generators
    community.ts    published components, declared as recipes
    compose.ts      manifest -> one whole file
    runtime.ts      the sandbox: shims, both palettes, esbuild
    mockData.ts     generated rows for every schema without a collector
    spaces.ts       workspaces and their page order (Supabase)
    store.ts        pages, revisions, layout writes (Supabase, RLS per user)
    import.ts       one-time adoption of local .workspace files into an account
    meter.ts        the ledger every query is counted into (Supabase)
    geo.ts          approximate coordinates for aggregates, grid cells, airports
```

**`geo.ts` places aggregates, and only aggregates.** A hub or a load zone is a
region with no place, so it is drawn at a rough centroid that says so in its
popup. Settlement points are placed by the API from the node location table
(see *ERCOT nodes are placed through their units*); `geoMock.ts`, which
invented a position per node for a year, was deleted with it rather than kept
as a fallback — a plausible map of substations nobody published is the one
artefact worth refusing to make by accident.

**The store is Supabase Postgres**, per user, RLS-scoped (`user_id =
auth.uid()`), with composite `(user_id, id)` keys so two accounts importing the
same machine's files never collide. Each `apps` row's `data` column is the
whole App object verbatim — the JSON file moved into a column, not into a
schema — so everything downstream still reads and writes complete apps. The
one exception is _listing_: `listApps` reads the `app_summaries` view
(security_invoker, so the apps table's RLS still applies), which computes
name, revision count and authors in Postgres — selecting `data` shipped every
app's full source and revision history to render eight fields per card, and
made the shelf ~170× heavier than it needed to be. The orphan sweep in
`listSpaces` reads bare ids for the same reason. Like the rest of the schema,
the view lives only in Supabase's migration history (`app_summaries_view`) —
there are no migration files in the repo — so changing `AppSummary` means
changing the view too. The usage ledger increments through the `record_usage`
SQL function because PostgREST upserts cannot express an atomic `n + 1`;
anonymous queries are deliberately not counted.

`.workspace/` on disk is now the **seed, not the store**: the first time a
signed-in user touches the store, `lib/workspace/import.ts` adopts whatever
those files hold into their account, once, and writes a marker under
`.workspace/.imported/`. The files are never deleted — they are the backup they
always were.

## What is deliberately unfinished

Worth knowing before picking something up, so none of it reads as an oversight:

- **Sharing** — `App.sharedBy` exists and the shelf filters on it, but nothing
  sets it. "Shared with me" was removed from the shelf when workspaces landed and
  needs to come back as _shared workspaces_, which is a different shape.
- **Tiles are removed by the ✕ in their own header** — armed on the first
  click, fired on the second, recorded as a revision so revert is the undo.
  Only composed pages can do it; a model-edited page still reverts past the
  change, because nothing can splice one section out of rewritten source.
- **The `+` in the navbar scrolls out of reach** once a workspace has many tabs.
- **Raster map layers** are unimplemented. Both map field modes are vector; a
  real raster source needs a tile service, and the hook is one `addSource({type:
"raster"})` beside the existing ones.
- **Deleting a workspace deletes its pages.** That is deliberate — see Deleting —
  but it is the one destructive path in the product.
- **Nothing asks for a rollup yet.** `/query` buckets and aggregates, but the
  component windows still stop at seven days and the map's scrubber still
  reaches back a hardcoded 24h. Forward it runs only as far as the data does
  (the newest row, asked of each stream, capped at 48h), so a real-time map's
  scale ends at Now, where its Live button sits. Those two are now honest to
  widen, and were not before.
- **The freshness check cannot fail on a forward-looking feed.** It measures
  `now - MAX(interval_start_utc)`, and a forecast's newest row is always ahead of
  now, so the age is negative and the SLA passes however stale the collector is.
  That is every vintaged dataset — the DAM reports, the load and renewable
  forecasts, the weather ones. The fix is to measure `source_published_at_utc`
  for those, and to expect it to turn some currently-green badges red.

**The landing page's screenshots are captures, not mock-ups**, and the recipe
above is how they were made: `scripts/landing-shots/compose.ts` composes the
six-tile page from the published recipes and writes it under `public/_shot/`,
and `shoot.mjs` drives headless Chrome over the DevTools protocol to capture
it in both themes, before and after a click on a map node. Two things cost
time there. `--screenshot --virtual-time-budget` renders the basemap and no
nodes — the GL layer is added on a timer after the data lands and virtual time
expires first, so the capture needs real waits, which means CDP. And the
in-app browser's own screenshots of the landing page came back black below the
hero while the DOM reported everything visible; the headless full-page render
is the one to believe. `ThemedShot` serves `-dark`/`-light` pairs on the
`dr-when-light` variant, so a capture is retaken in both themes or not at all.
