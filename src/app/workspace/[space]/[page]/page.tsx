"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DataExplorer } from "@/components/workspace/DataExplorer";
import { AvailabilityBadge } from "@/components/workspace/DataChip";
import { Runner } from "@/components/workspace/Runner";
import { Button, cx } from "@/components/ui";
import { ScreenSkeleton } from "@/components/Skeleton";
import { UsageDock } from "@/components/workspace/UsageDock";
import { type DataRef } from "@/lib/workspace/catalog";
import {
  BuildPanel,
  type EditorStart,
  type TrayPayload,
} from "@/components/workspace/BuildPanel";
import { ComponentEditor } from "@/components/workspace/ComponentEditor";
import { CostPanel } from "@/components/workspace/CostPanel";
import type { ComponentSpec } from "@/lib/workspace/components";
import { readNdjson } from "@/lib/workspace/ndjson";
import type { App, AppSummary } from "@/lib/workspace/types";

/**
 * What the right column is showing.
 *
 * One column, three jobs, and they are not used together: you build, or you
 * read what happened, or you check what it costs. Stacking all three made every
 * one of them too short to use, so they take turns.
 */
type PanelMode = "build" | "changes" | "cost";

const PANELS: { id: PanelMode; label: string }[] = [
  { id: "build", label: "Build" },
  { id: "changes", label: "Changes" },
  { id: "cost", label: "Cost" },
];

/**
 * The page's column split: the screen, and the panel beside it.
 *
 * One definition, one row. There used to be a second row above it holding the
 * page's controls, and keeping the two in step was a standing bug — aligned to
 * the page instead of the canvas, those controls floated over the panel rather
 * than over the thing they act on. They live in the panel column now, so there
 * is nothing left to keep in step. Closed, there is no panel to leave room for
 * and the screen takes the whole width.
 */
const COLUMNS = (open: boolean) =>
  open ? "lg:grid-cols-[1fr_420px]" : "lg:grid-cols-1";

/** One screen, running, with the tools that shaped it beside it. */
export default function AppPage() {
  // `id` throughout is the page's id; the workspace only matters for links.
  const { space, page: id } = useParams<{ space: string; page: string }>();
  const router = useRouter();
  const search = useSearchParams();

  const [app, setApp] = useState<App | null>(null);
  const [attached, setAttached] = useState<DataRef[]>([]);
  const [dragging, setDragging] = useState<TrayPayload | null>(null);
  const [editing, setEditing] = useState<EditorStart | null>(null);
  const [savedTick, setSavedTick] = useState(0);
  /*
    Edit mode is the URL, not a copy of it.

    Held in state it desynchronised the moment the navbar's Edit link changed the
    query without remounting this component — the button flipped and nothing else
    did. Derived, there is one answer, it survives a reload, and it can be sent
    to someone.
  */
  const asideOpen = search.get("edit") === "1";
  const closeEditor = useCallback(
    () => router.replace(`/workspace/${space}/${id}`),
    [router, space, id],
  );
  const [panel, setPanel] = useState<PanelMode>("build");
  /** When the last write landed. Arranging a screen saves constantly and
   *  silently, and silence about your own data is not reassuring. */
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [pullOpen, setPullOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/workspace/apps/${id}`)
      .then((r) => r.json())
      .then((d) => setApp(d.app ?? null));
  }, [id]);

  const onRuntimeError = useCallback((m: string) => setRuntimeError(m), []);

  /**
   * Select or drop a reference from the explorer.
   *
   * It lands as a chip, not as query text pasted into the sentence. The request
   * someone types stays theirs to read and edit; the data it touches is an
   * object beside it, with its badge and its price attached, that they can drop
   * again without hunting for a call expression inside their own prose.
   *
   * Selecting anything also writes the request, because after picking three
   * series the next sentence was going to be this one. It is written into the
   * real box rather than sent, so it is a draft you can edit or replace — and it
   * only ever overwrites itself, never something the user typed.
   */
  const toggle = useCallback(
    (ref: DataRef) => {
      const same = (r: DataRef) =>
        r.snippet === ref.snippet && r.label === ref.label;
      const next = attached.some(same)
        ? attached.filter((r) => !same(r))
        : [...attached, ref];

      setAttached(next);
    },
    [attached],
  );

  /**
   * Place a dragged component at the seam it was dropped on.
   *
   * Goes down the same route a written change does, and is gated the same way —
   * generated, compiled, and only then saved. The difference is that no model is
   * involved, so this returns in about a second.
   */
  const place = useCallback(
    async (index: number) => {
      const payload = dragging;
      setDragging(null);
      if (!payload || pending) return;

      setPending(true);
      setError(null);
      try {
        const res = await fetch(`/api/workspace/apps/${id}/edit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            component: payload.kind,
            options: payload.options,
            custom: payload.custom,
            layout: payload.layout,
            refs: payload.refs ?? attached,
            at: index,
          }),
        });
        if (!res.ok && !res.headers.get("content-type")?.includes("ndjson")) {
          const d = await res.json().catch(() => ({}));
          setError(d.error ?? `The server returned ${res.status}.`);
          return;
        }
        await readNdjson(res, (e) => {
          switch (e.type) {
            case "done":
              setApp(e.app as App);
              setSavedAt(Date.now());
              // A placement reports nothing, either path. The tile is on the
              // page — that is the report — and the save mark in the controls
              // says it was written. A banner announcing what you can already
              // see is one more thing to read and then dismiss.
              break;
            case "failed":
            case "error":
              setError(String(e.message));
              break;
          }
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "That did not place.");
      } finally {
        setPending(false);
      }
    },
    [dragging, pending, id, attached],
  );

  /** Add a component built in the editor, at the end of the dashboard. */
  const addSpec = useCallback(
    async (spec: ComponentSpec) => {
      setEditing(null);
      setPending(true);
      setError(null);
      try {
        const res = await fetch(`/api/workspace/apps/${id}/edit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            component: spec.kind,
            options: spec.options,
            custom: spec.custom,
            layout: spec.layout,
            refs: spec.refs,
          }),
        });
        const ct = res.headers.get("content-type");
        if (!res.ok && !ct?.includes("ndjson")) {
          const d = await res.json().catch(() => ({}));
          setError(d.error ?? `The server returned ${res.status}.`);
          return;
        }
        await readNdjson(res, (e) => {
          if (e.type === "done") {
            setApp(e.app as App);
            setSavedAt(Date.now());
          } else if (e.type === "failed" || e.type === "error") {
            setError(String(e.message));
          }
        });
      } finally {
        setPending(false);
      }
    },
    [id],
  );

  /** Keep a component so it shows up on the shelf for the next dashboard too. */
  const saveSpec = useCallback(async (spec: ComponentSpec) => {
    await fetch("/api/workspace/components", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec, name: spec.custom?.name ?? spec.kind }),
    });
    setSavedTick((n) => n + 1);
    setSavedAt(Date.now());
  }, []);

  /**
   * A tile was rearranged in the frame. Persisted, but not as a revision.
   *
   * The frame has already applied it, so this is only the save — and it must not
   * update `app`, because that would change the version the frame is keyed on
   * and remount it mid-gesture.
   */
  const arrange = useCallback(
    async (body: Record<string, number>) => {
      // A page without a manifest has nothing to write a layout into — the
      // frame has already applied the gesture live, and posting the save
      // would only surface a 409 for a change that cannot persist.
      if (!app?.manifest) return;
      await fetch(`/api/workspace/apps/${id}/layout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setSavedAt(Date.now());
    },
    [id, app?.manifest],
  );

  const resize = useCallback(
    (index: number, w: number, h: number) => void arrange({ index, w, h }),
    [arrange],
  );

  const reorder = useCallback(
    (from: number, to: number) => void arrange({ from, to }),
    [arrange],
  );

  async function revert(revisionId: string) {
    const res = await fetch(`/api/workspace/apps/${id}/revert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revisionId }),
    });
    const data = await res.json();
    if (res.ok) {
      setApp(data.app);
      setRuntimeError(null);
    }
  }

  async function fork() {
    const res = await fetch("/api/workspace/apps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ forkOf: id, space }),
    });
    const { app: created } = await res.json();
    router.push(`/workspace/${space}/${created.id}`);
  }

  // Laid out for whichever mode the URL asked for, so nothing shifts on arrival.
  if (!app) return <ScreenSkeleton withPanel={search.get("edit") === "1"} />;

  /*
    Reading a page and editing one want opposite layouts. Editing wants a
    measured page with margins; reading wants the screen, edge to edge, with
    none of the site showing around it. So the shell itself changes rather than
    the screen shrinking to fit a page that was designed for a document.
  */
  return (
    <div
      className={cx(
        "flex flex-col",
        // Same side gutter as the navbar in edit mode, none at all when the
        // screen is the only thing on the page. Vertically it is tighter at the
        // top than the bottom: the navbar is already a horizontal rule, so the
        // space under it is doing nothing the nav is not, and every pixel of it
        // is a pixel the screen does not get.
        asideOpen
          ? "h-[calc(100vh-var(--nav-h))] px-4 pt-2 pb-4"
          : "h-[calc(100vh-var(--nav-h))]",
      )}
    >
      <div className={cx("grid min-h-0 flex-1 gap-4", COLUMNS(asideOpen))}>
        <div className="relative flex min-h-0 flex-col gap-2">
          <Runner
            appId={app.id}
            version={app.updatedAt}
            onError={onRuntimeError}
            dropping={Boolean(dragging)}
            dropSize={dragging?.layout}
            onDropAt={place}
            placing={pending}
            onResize={resize}
            onReorder={reorder}
            flush={!asideOpen}
          />

          {runtimeError && (
            <p className="rounded border border-fail-line bg-fail-dim px-3 py-2 font-mono text-[11.5px] text-fail">
              {runtimeError}
            </p>
          )}
        </div>

        {/*
          One column, three panes: find the data, build with it, read what
          happened. Sized by the grid rather than by content, so a long list
          scrolls inside its own pane instead of pushing the next one off the
          bottom.

          Building a component takes the whole column instead. The preview is the
          reason that screen exists, and a preview squeezed into a third of a
          sidebar answers nothing — so everything else steps aside while it is
          open.
        */}
        {asideOpen && (
          <aside className="flex min-h-0 flex-col gap-3">
            {/*
              Everything that acts on the page, above the panel rather than
              above the canvas.

              It used to be a row spanning both columns, which cost the screen a
              band of height across its whole width to hold four controls that
              all sit at the right anyway. Here it costs the canvas nothing and
              the screen runs from the top of the page — and these belong beside
              the panel regardless: they act on the page you are editing, which
              is the column you are editing it from.

              No name and no breadcrumb, still: the workspace navbar carries the
              workspace beside the wordmark and the page as its own tab, which is
              also where it is renamed.
            */}
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button size="sm" onClick={() => setPullOpen(true)}>
                Pull changes…
              </Button>
              <Button size="sm" onClick={fork}>
                Fork
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  navigator.clipboard?.writeText(window.location.href)
                }
              >
                Copy link
              </Button>
              <span className="ml-1 font-mono text-[10.5px] text-faint">
                {app.id}
              </span>
              <SavedMark at={savedAt} />
              <button
                onClick={closeEditor}
                aria-label="Done editing"
                title="Done editing"
                className="rounded border border-line p-1.5 text-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                <PanelGlyph open />
              </button>
            </div>

            {editing ? (
              <div className="min-h-0 flex-1">
                <ComponentEditor
                  // Its own data, not the explorer's — a saved component brings
                  // the references it was built against.
                  key={editing.name ?? editing.def.kind}
                  def={editing.def}
                  refs={editing.refs}
                  initialAsk={editing.ask}
                  initialName={editing.name}
                  initialOptions={editing.options}
                  initialCode={editing.custom?.code}
                  onClose={() => setEditing(null)}
                  onAdd={addSpec}
                  onSave={saveSpec}
                />
              </div>
            ) : (
              <>
                {/*
                  One column, three jobs, taken in turns. Building, reading what
                  happened and checking what it costs are not done together, and
                  stacking them made every one too short to use.
                */}
                <div className="flex shrink-0 gap-1 rounded-lg border border-line bg-surface p-1">
                  {PANELS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPanel(p.id)}
                      className={cx(
                        "flex-1 rounded-md px-2 py-1 text-[12px] transition-colors",
                        panel === p.id
                          ? "bg-surface-3 text-ink"
                          : "text-muted hover:text-ink",
                      )}
                    >
                      {p.label}
                      {p.id === "changes" && (
                        <span className="ml-1.5 font-mono text-[9.5px] text-faint">
                          {app.history.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {panel === "cost" && <CostPanel appId={app.id} />}

                {panel === "changes" && (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface">
                    <div className="border-b border-line px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
                      Changelog
                    </div>
                    <ol className="dr-scroll min-h-0 flex-1 overflow-y-auto">
                      {app.history.map((r, i) => (
                        <li
                          key={r.id}
                          className="border-b border-line px-3 py-2.5 last:border-0"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[13px] leading-snug text-ink">
                              {r.intent}
                            </p>
                            {i > 0 && (
                              <button
                                onClick={() => revert(r.id)}
                                className="shrink-0 font-mono text-[10px] text-faint hover:text-accent"
                              >
                                revert
                              </button>
                            )}
                          </div>
                          {r.note && (
                            <p className="mt-1 text-[12px] text-muted">
                              {r.note}
                            </p>
                          )}
                          {r.refs && r.refs.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {r.refs.map((d, n) => (
                                <span
                                  key={`${d.snippet}-${n}`}
                                  className={cx(
                                    "inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[9.5px] text-muted",
                                    d.availability === "live"
                                      ? "border-line bg-surface-2"
                                      : "border-dashed border-info-line bg-surface-2",
                                  )}
                                >
                                  {d.label}
                                  <AvailabilityBadge
                                    availability={d.availability}
                                  />
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="mt-1 font-mono text-[10px] text-faint">
                            {r.author} · {new Date(r.at).toLocaleTimeString()}
                            {r.pulledFrom && (
                              <span className="text-accent">
                                {" "}
                                · from {r.pulledFrom.appName}
                              </span>
                            )}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                <div
                  hidden={panel !== "build"}
                  // Equal halves: one is read, the other is used, and neither
                  // should be the one that has to scroll.
                  className="grid min-h-0 flex-1 auto-rows-min grid-rows-[1fr_1fr] gap-3"
                >
                  {/*
                    Only failures report here. Placing a component is
                    deterministic and lands in about a second — the tile
                    appearing on the screen is the report, and a banner
                    narrating the compile was a box covering the panel to say
                    nothing anyone was waiting to read.
                  */}
                  {error && (
                    <div
                      className="row-span-full flex shrink-0 items-center gap-2 rounded-lg border border-warn-line bg-warn-dim px-3 py-2 text-[12.5px] text-warn"
                      style={{ gridRow: "auto" }}
                    >
                      <span className="min-w-0 truncate">{error}</span>
                    </div>
                  )}

                  <DataExplorer selected={attached} onToggle={toggle} />

                  <BuildPanel
                    refs={attached}
                    onDragStateChange={setDragging}
                    onOpen={setEditing}
                    reloadKey={savedTick}
                  />
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      <UsageDock spaceId={space} />

      {pullOpen && (
        <PullDialog
          appId={app.id}
          onClose={() => setPullOpen(false)}
          onPulled={setApp}
        />
      )}
    </div>
  );
}

/**
 * Take selected changes from another screen.
 *
 * What you choose from is a list of sentences, not a diff — each revision
 * carries the instruction that produced it, and that is what gets replayed
 * against your copy.
 */
function PullDialog({
  appId,
  onClose,
  onPulled,
}: {
  appId: string;
  onClose: () => void;
  onPulled: (app: App) => void;
}) {
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [source, setSource] = useState<App | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{
    applied: string[];
    skipped: { intent: string; reason: string }[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/workspace/apps")
      .then((r) => r.json())
      .then((d) =>
        setApps((d.apps as AppSummary[]).filter((a) => a.id !== appId)),
      );
  }, [appId]);

  async function choose(pickedId: string) {
    const res = await fetch(`/api/workspace/apps/${pickedId}`);
    const { app } = await res.json();
    setSource(app);
    setPicked([]);
  }

  async function pull() {
    if (!source || !picked.length) return;
    setPending(true);
    setProgress("Starting…");
    try {
      const res = await fetch(`/api/workspace/apps/${appId}/pull`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromAppId: source.id, revisionIds: picked }),
      });
      await readNdjson(res, (e) => {
        switch (e.type) {
          case "revision":
            setProgress(
              `Replaying ${e.index} of ${e.total}: ${String(e.intent).slice(0, 60)}`,
            );
            break;
          case "phase":
            setProgress(
              (p) => (p ? p.split(" — ")[0] : p) + " — " + String(e.phase),
            );
            break;
          case "done":
            onPulled(e.app as App);
            setResult({
              applied: e.applied as string[],
              skipped: e.skipped as { intent: string; reason: string }[],
            });
            break;
        }
      });
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm">
      <div className="dr-scroll max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-xl border border-line-strong bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink">Pull changes</h2>
          <button
            onClick={onClose}
            className="font-mono text-[11px] text-faint hover:text-ink"
          >
            close
          </button>
        </div>

        <div className="p-5">
          {result ? (
            <div className="flex flex-col gap-3">
              {result.applied.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] tracking-[0.14em] text-accent uppercase">
                    Applied
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {result.applied.map((a) => (
                      <li key={a} className="text-[13px] text-ink">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.skipped.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] tracking-[0.14em] text-warn uppercase">
                    Skipped
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {result.skipped.map((s) => (
                      <li key={s.intent} className="text-[13px] text-muted">
                        {s.intent} —{" "}
                        <span className="text-warn">{s.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button
                tone="primary"
                size="sm"
                className="self-start"
                onClick={onClose}
              >
                Done
              </Button>
            </div>
          ) : !source ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13.5px] text-muted">
                Which screen do you want changes from?
              </p>
              {apps.length === 0 && (
                <p className="text-[13px] text-faint">
                  Nothing else here yet — fork this screen, change the copy,
                  then pull from it.
                </p>
              )}
              {apps.map((a) => (
                <button
                  key={a.id}
                  onClick={() => choose(a.id)}
                  className="rounded-lg border border-line px-4 py-3 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
                >
                  <span className="text-[14px] font-medium text-ink">
                    {a.name}
                  </span>
                  <span className="ml-2 font-mono text-[10.5px] text-faint">
                    {a.revisions} changes
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[13.5px] text-muted">
                Pick what you want from{" "}
                <strong className="text-ink">{source.name}</strong>. Each one is
                replayed against your copy.
              </p>
              <ul className="flex flex-col gap-1">
                {source.history.slice(0, -1).map((r) => (
                  <li key={r.id}>
                    <label
                      className={cx(
                        "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
                        picked.includes(r.id)
                          ? "border-accent-line bg-accent-dim"
                          : "border-line hover:bg-surface-2",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={picked.includes(r.id)}
                        onChange={(e) =>
                          setPicked((p) =>
                            e.target.checked
                              ? [...p, r.id]
                              : p.filter((x) => x !== r.id),
                          )
                        }
                        className="mt-1 accent-accent"
                      />
                      <span>
                        <span className="block text-[13px] text-ink">
                          {r.intent}
                        </span>
                        <span className="block font-mono text-[10px] text-faint">
                          {new Date(r.at).toLocaleString()}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {pending && progress && (
                <p className="truncate rounded border border-accent-line bg-accent-dim px-3 py-2 font-mono text-[11px] text-accent">
                  {progress}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  tone="primary"
                  size="sm"
                  disabled={!picked.length || pending}
                  onClick={pull}
                >
                  {pending
                    ? "Replaying…"
                    : picked.length
                      ? `Pull ${picked.length}`
                      : "Pull"}
                </Button>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => setSource(null)}
                >
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * That everything is already saved, said quietly.
 *
 * Arranging a screen writes constantly — every resize, every move — and none of
 * it announces itself. Silence about your own work is not reassuring, so the
 * last write gets a mark. It fades to a resting state rather than disappearing,
 * because "saved a while ago" is still the answer to the question being asked.
 */
function SavedMark({ at }: { at: number | null }) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!at) return;
    const t = setInterval(() => tick((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, [at]);

  if (!at) return null;
  const secs = Math.round((Date.now() - at) / 1000);
  const when =
    secs < 5
      ? "just now"
      : secs < 60
        ? `${secs}s ago`
        : `${Math.round(secs / 60)}m ago`;

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[9.5px] transition-colors",
        secs < 5
          ? "border-accent-line bg-accent-dim text-accent"
          : "border-line text-faint",
      )}
    >
      ✓ Saved {when}
    </span>
  );
}

/** Two panes, or one. Drawn rather than lettered — it sits in a row of numbers. */
function PanelGlyph({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect
        x="1"
        y="2.5"
        width="12"
        height="9"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {open && (
        <path d="M9 2.5 V11.5" stroke="currentColor" strokeWidth="1.2" />
      )}
    </svg>
  );
}
