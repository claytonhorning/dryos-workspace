"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Logo";
import type { AppSummary } from "@/lib/workspace/types";
import { cx } from "@/components/ui";
import { useSelectOnMount } from "@/lib/useSelectOnMount";
import { AccountButton } from "./AccountButton";
import { TimeSelect } from "./TimeSelect";
import { UsageDock } from "@/components/workspace/UsageDock";
import { FeedsMenu, type FeedsDetail } from "@/components/workspace/FeedsMenu";

/**
 * The navbar, once you are inside a workspace.
 *
 * A workspace is its pages, so the chrome is its pages: tabs across the top and
 * a `+` at the end. The product's own navigation steps back to a wordmark,
 * because at this point you are not browsing Dryos, you are working in one place
 * and moving between the views of it.
 *
 * The workspace's name is a link to the workspace itself, where its pages are
 * laid out as thumbnails — clicking the name to see what is in it is what
 * anyone would expect, so renaming lives on that page instead.
 */
interface Space {
  id: string;
  name: string;
  pageList: AppSummary[];
}

export function SpaceNav({
  spaceId,
  pageId,
  editMode,
  naming,
}: {
  spaceId: string;
  pageId?: string;
  /** Whether the open page is being edited. Lives in the URL, not in state. */
  editMode?: boolean;
  /**
   * The workspace just came into being, so its name arrives armed — the
   * Finder new-folder moment, in the nav. From the URL (`?name=1`, appended
   * by the create flow) like every other mode, and stripped on the first
   * commit or Escape. This never turns the name into a rename control:
   * clicking the name still navigates, always — the field only ever
   * *arrives* editing, and renaming later still lives on the workspace's
   * own page.
   */
  naming?: boolean;
}) {
  const router = useRouter();
  const [space, setSpace] = useState<Space | null>(null);
  const [creating, setCreating] = useState(false);
  /** The page whose tab is being renamed, if any. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const nameField = useSelectOnMount();
  /** The workspace-name draft while `naming`; null means untouched. */
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const spaceNameField = useSelectOnMount();
  /** The tab being dragged, and the gap it is currently over. */
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  /**
   * Whether the open page has nothing on it yet, announced by the page
   * (`dryos:blank`). While a blank page is being edited the Edit control
   * hides entirely: "Done" is a claim that something was done, and the only
   * thing it could do here is close the panel the page is built from.
   */
  const [blank, setBlank] = useState(false);

  useEffect(() => {
    const h = (e: Event) => setBlank(Boolean((e as CustomEvent).detail));
    window.addEventListener("dryos:blank", h);
    return () => window.removeEventListener("dryos:blank", h);
  }, []);

  // The flag belongs to the open page; switching tabs clears it.
  useEffect(() => setBlank(false), [pageId]);

  /**
   * What the open page reads (`dryos:feeds`), for the status dot beside its
   * tab. Held here rather than in the dot because the dot mounts with the
   * tabs, after the workspace fetch, and the page's announcement can arrive
   * before that — the nav itself is listening from the first render.
   */
  const [feeds, setFeeds] = useState<FeedsDetail | null>(null);

  useEffect(() => {
    const h = (e: Event) =>
      setFeeds((e as CustomEvent<FeedsDetail>).detail ?? null);
    window.addEventListener("dryos:feeds", h);
    return () => window.removeEventListener("dryos:feeds", h);
  }, []);

  // The record belongs to the open page; switching tabs clears it.
  useEffect(() => setFeeds(null), [pageId]);

  useEffect(() => {
    let live = true;
    fetch(`/api/workspace/spaces/${spaceId}`)
      .then((r) => r.json())
      .then((d) => live && d.space && setSpace(d.space))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [spaceId, pageId]);

  async function addPage() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/workspace/spaces/${spaceId}/pages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "New page" }),
      });
      const { page } = await res.json();
      // Straight into edit mode: a page that has just been created is empty,
      // and nobody makes one in order to look at nothing.
      //
      // Left pending through the navigation on purpose — `router.push` returns
      // before the new route renders, so clearing it here put the `+` back
      // while the old screen was still up. A control that says it has finished
      // when it has not is an invitation to press it again, and each press
      // creates a page.
      if (page) return router.push(`/workspace/${spaceId}/${page.id}?edit=1`);
      setCreating(false);
    } catch {
      setCreating(false);
    }
  }

  /**
   * Rename a page from its own tab.
   *
   * The page header used to carry the name and lost it to this tab, so the
   * editing came with it. Only the open page can be renamed — clicking any other
   * tab means "go there", and one control should not mean two things depending
   * on which copy of it you press.
   */
  /**
   * Put a tab somewhere else.
   *
   * Only while editing: dragging is how you move between pages the rest of the
   * time, and a tab that reorders on a stray drag is a tab you cannot trust to
   * navigate. Applied locally first — the order is the whole point of the
   * gesture and it should not wait on a round trip.
   */
  async function movePage(from: string, to: string) {
    if (!space || from === to) return;
    const ids = space.pageList.map((p) => p.id);
    const next = ids.filter((p) => p !== from);
    next.splice(next.indexOf(to), 0, from);

    const byId = new Map(space.pageList.map((p) => [p.id, p]));
    setSpace({
      ...space,
      pageList: next.map((p) => byId.get(p)!).filter(Boolean),
    });

    await fetch(`/api/workspace/spaces/${spaceId}/pages`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order: next }),
    });
  }

  /** Put `?name=1` away — the arming is single-shot either way it ends. */
  function disarmNaming() {
    const qs = new URLSearchParams(window.location.search);
    qs.delete("name");
    const s = qs.toString();
    router.replace(`${window.location.pathname}${s ? `?${s}` : ""}`, {
      scroll: false,
    });
  }

  /*
    Commit whatever was typed, or nothing. Escape clears the draft *before*
    disarming, so the blur that follows finds an empty draft and keeps the
    default — no cancelled flag to carry, the order is the guard.
  */
  async function commitSpaceName() {
    const next = (nameDraft ?? "").trim();
    disarmNaming();
    if (!space || !next || next === space.name) return;
    setSpace({ ...space, name: next });
    await fetch(`/api/workspace/spaces/${spaceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
  }

  async function renamePage(id: string) {
    setEditing(null);
    const name = draft.trim();
    const current = space?.pageList.find((p) => p.id === id);
    if (!space || !name || !current || name === current.name) return;

    setSpace({
      ...space,
      pageList: space.pageList.map((p) => (p.id === id ? { ...p, name } : p)),
    });
    await fetch(`/api/workspace/apps/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  return (
    <>
      {/*
        Stretched, not centred. A tab's underline belongs at the bottom of the
        bar while its label sits on the same line as everything else, and the
        only way to have both is for every item to be the full height of the row
        and centre its own contents.
      */}
      {/*
        Full width, because what is under it is full width. Centring this in a
        fixed column looked fine at 1400px and left the wordmark stranded in the
        middle of the screen at 2560 — a nav bar's left edge has to be the left
        edge of the thing it belongs to.
      */}
      <div className="flex h-14 items-stretch gap-3 px-4">
        <Link
          href="/workspace"
          title="All workspaces"
          className="flex shrink-0 items-center"
        >
          {/* Set a shade smaller in here: the tabs want the width. */}
          <Wordmark size={17} />
        </Link>

        <span className="flex items-center text-line-strong">/</span>

        {space && naming ? (
          <input
            ref={spaceNameField}
            value={nameDraft ?? space.name}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => void commitSpaceName()}
            onKeyDown={(e) => {
              // Enter commits through the blur, so there is one exit path.
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setNameDraft(null);
                disarmNaming();
              }
            }}
            aria-label="Name this workspace"
            size={Math.max(8, (nameDraft ?? space.name).length)}
            className="my-auto shrink-0 rounded border border-line-strong bg-surface-2 px-1.5 py-1 text-[13.5px] font-medium text-ink outline-none"
          />
        ) : space ? (
          <Link
            href={`/workspace/${spaceId}`}
            title="All pages in this workspace"
            className="flex shrink-0 items-center text-[13.5px] font-medium text-ink transition-colors hover:text-accent"
          >
            {space.name}
          </Link>
        ) : (
          <span className="flex shrink-0 items-center">
            <span className="h-[13px] w-28 animate-pulse rounded bg-surface-2" />
          </span>
        )}

        <SavedMark pageId={pageId} />

        {/* ── Pages ────────────────────────────────────────────────── */}
        <div className="dr-scroll -mb-px flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto">
          {/*
            Tabs in outline while the list arrives. The bar is the first thing on
            screen and the last thing to have anything in it, so an empty rail
            reads as a workspace with no pages rather than as one still loading.
          */}
          {!space &&
            [72, 96, 84].map((w, i) => (
              <span key={i} className="flex shrink-0 items-center px-3">
                <span
                  className="h-[13px] animate-pulse rounded bg-surface-2"
                  style={{ width: w }}
                />
              </span>
            ))}

          {space?.pageList.map((p) => {
            const on = p.id === pageId;

            if (editing === p.id) {
              return (
                <input
                  key={p.id}
                  ref={nameField}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => renamePage(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void renamePage(p.id);
                    if (e.key === "Escape") setEditing(null);
                  }}
                  size={Math.max(6, draft.length)}
                  className="my-auto shrink-0 rounded border border-line-strong bg-surface-2 px-1.5 py-1 text-[13px] text-ink outline-none"
                />
              );
            }

            // Clicking the page you are already on renames it; clicking any
            // other one goes there.
            // While editing, every tab is draggable and every tab is a target.
            const dnd = editMode
              ? {
                  draggable: true,
                  onDragStart: (e: React.DragEvent) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", p.id);
                    setDragging(p.id);
                  },
                  onDragEnd: () => {
                    setDragging(null);
                    setOver(null);
                  },
                  onDragOver: (e: React.DragEvent) => {
                    if (!dragging || dragging === p.id) return;
                    e.preventDefault();
                    setOver(p.id);
                  },
                  onDragLeave: () => setOver((v) => (v === p.id ? null : v)),
                  onDrop: (e: React.DragEvent) => {
                    e.preventDefault();
                    const from = e.dataTransfer.getData("text/plain");
                    setOver(null);
                    setDragging(null);
                    if (from) void movePage(from, p.id);
                  },
                }
              : {};

            const shift = cx(
              dragging === p.id && "opacity-40",
              over === p.id && "bg-accent-dim",
              editMode && "cursor-grab active:cursor-grabbing",
            );

            // The open page wears the feeds dot beside its name: whether
            // what this screen reads is arriving, and the delivery record
            // behind it. Beside the name rather than in the right cluster
            // because the claim is about this page, and the name is the
            // one thing in the bar that means this page.
            if (on) {
              return (
                <span key={p.id} className="flex shrink-0 items-stretch">
                  <button
                    {...dnd}
                    onClick={() => {
                      setDraft(p.name);
                      setEditing(p.id);
                    }}
                    title={
                      editMode
                        ? "Drag to reorder · click to rename"
                        : "Click to rename this page"
                    }
                    className={cx(
                      "flex shrink-0 items-center border-b-2 border-accent px-3 text-[13px] whitespace-nowrap text-ink",
                      shift,
                    )}
                  >
                    {p.name}
                  </button>
                  <FeedsMenu feeds={feeds} />
                </span>
              );
            }

            return (
              <Link
                key={p.id}
                {...dnd}
                href={`/workspace/${spaceId}/${p.id}`}
                title={editMode ? "Drag to reorder" : undefined}
                className={cx(
                  "flex shrink-0 items-center border-b-2 border-transparent px-3 text-[13px] whitespace-nowrap text-muted transition-colors hover:border-line-strong hover:text-ink",
                  shift,
                )}
              >
                {p.name}
              </Link>
            );
          })}

          <button
            onClick={addPage}
            disabled={creating || !space}
            aria-label="New page"
            title="New page"
            className="my-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line font-mono text-[13px] leading-none text-muted transition-colors hover:border-accent-line hover:text-accent disabled:opacity-50"
          >
            {creating ? "…" : "+"}
          </button>
        </div>

        {/*
          Edit lives in the chrome, not on the canvas — the bar is already here
          in both modes, so this costs the screen nothing and is always in the
          same place, which is the whole difference between a control you find
          and one you go looking for. It sits right after the tabs, beside the
          `+`: both are actions on the pages, and parked among the right
          cluster's indicators it read as one more number rather than as the
          one thing in the bar you press. It is a link rather than a toggle
          because the mode is in the URL, so it survives a reload and can be
          sent to someone.
        */}
        {pageId && !(editMode && blank) && (
          <Link
            href={`/workspace/${spaceId}/${pageId}${editMode ? "" : "?edit=1"}`}
            aria-label={editMode ? "Done editing" : "Edit this page"}
            title={editMode ? "Done editing" : "Edit this page"}
            className={cx(
              "my-auto flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] transition-colors",
              editMode
                ? "border-accent-line bg-accent-dim text-accent"
                : "border-line text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            <PencilGlyph />
            {editMode ? "Done" : "Edit"}
          </Link>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          {/*
            Whether the screen is busy right now, next to what being busy
            costs. First in the cluster so their coming and going widens the
            row leftward and moves nothing that is already being read.
          */}
          <BusyMark pageId={pageId} event="dryos:updating" label="updating…" accent />
          <BusyMark pageId={pageId} event="dryos:querying" label="querying…" />
          {/*
            What the workspace is spending, in the chrome rather than floating
            over the screen. It used to sit bottom-left on the canvas, which put
            an object on a surface whose whole point is that it carries nothing
            but the dashboard — and left it competing with the sentence box for
            the same corner. Up here it is one more number in a bar that is
            already there in both modes.
          */}
          <UsageDock spaceId={spaceId} placement="nav" />
          {/* Which clock the data reads in — source time, or a zone of yours. */}
          <TimeSelect />
          <AccountButton />
        </div>
      </div>
    </>
  );
}

/**
 * That everything is already saved, said quietly.
 *
 * Arranging a screen writes constantly — every resize, every move — and none of
 * it announces itself. Silence about your own work is not reassuring, so the
 * last write gets a mark, in the bar beside the workspace's name. It fades to a
 * resting state rather than disappearing, because "saved a while ago" is still
 * the answer to the question being asked.
 *
 * The page announces each save with a `dryos:saved` event — the nav and the
 * page share no parent below the layout, and lifting one timestamp through it
 * would be plumbing for plumbing's sake.
 */
function SavedMark({ pageId }: { pageId?: string }) {
  const [at, setAt] = useState<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const onSaved = () => setAt(Date.now());
    window.addEventListener("dryos:saved", onSaved);
    return () => window.removeEventListener("dryos:saved", onSaved);
  }, []);

  // The mark belongs to the page that wrote; switching tabs clears it.
  useEffect(() => setAt(null), [pageId]);

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
    <span className="flex shrink-0 items-center">
      <span
        className={cx(
          "inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[9.5px] whitespace-nowrap transition-colors",
          secs < 5
            ? "border-accent-line bg-accent-dim text-accent"
            : "border-line text-faint",
        )}
      >
        ✓ Saved {when}
      </span>
    </span>
  );
}

/**
 * That the screen is busy, said beside what being busy costs.
 *
 * Both marks used to float over the canvas's own corner, which put chrome on
 * the one surface meant to carry nothing but the dashboard — and kept "work is
 * happening" a screen's width away from the number it runs up. `Runner`
 * announces each state with an event (`dryos:querying` for data in flight,
 * `dryos:updating` for a revision loading behind the live one) for the same
 * reason the saved mark is an event: the nav and the canvas share no parent
 * below the layout.
 */
function BusyMark({
  pageId,
  event,
  label,
  accent,
}: {
  pageId?: string;
  event: string;
  label: string;
  /** The louder treatment, for the state that ends with the screen changing. */
  accent?: boolean;
}) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const h = (e: Event) => setOn(Boolean((e as CustomEvent).detail));
    window.addEventListener(event, h);
    return () => window.removeEventListener(event, h);
  }, [event]);

  // The mark belongs to the page that is busy; switching tabs clears it.
  useEffect(() => setOn(false), [pageId]);

  if (!on) return null;
  return (
    <span
      className={cx(
        "rounded border px-1.5 py-px font-mono text-[9.5px] whitespace-nowrap",
        accent
          ? "animate-pulse border-accent-line bg-accent-dim text-accent"
          : "border-line text-faint",
      )}
    >
      {label}
    </span>
  );
}

/** A pencil, matching the one on a page tile in the workspace. */
function PencilGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M9.4 2.1a1.3 1.3 0 0 1 1.9 0l.6.6a1.3 1.3 0 0 1 0 1.9L5.3 11.2l-3 .5.5-3z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M8.6 3l2.4 2.4"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
