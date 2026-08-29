import type { DataRef } from "./catalog";
import type { ComponentSpec } from "./components";

/**
 * What a workspace app is.
 *
 * An app is one self-contained React component plus the record of every
 * instruction that shaped it. The second half is what makes this different from
 * a code editor: a revision stores the *intent* in the author's own words
 * alongside the source it produced, so a change can later be replayed onto a
 * copy that has since diverged. Merging diffs across two agent-edited apps is a
 * conflict nobody can read; replaying "add a congestion alert above $20" is a
 * request an agent can satisfy against whatever the app looks like now.
 *
 * The data a change touches is stored beside the sentence rather than inside
 * it, so the intent stays the words someone actually typed. A replay onto a
 * diverged copy gets the same references attached, which is what keeps "pull
 * this one change" working when the two apps chart different things.
 */

export interface Revision {
  id: string;
  /** What was asked for, verbatim. The unit of sharing. */
  intent: string;
  /** Data attached to the request, as chips rather than as query text. */
  refs?: DataRef[];
  /**
   * The typed components this revision's source was generated from.
   *
   * Present only while every revision has been generated. A model edit rewrites
   * the file in ways the manifest no longer describes, so it is dropped at that
   * point and typed additions afterwards go through the agent instead.
   */
  manifest?: ComponentSpec[];
  /** Source after the change. */
  source: string;
  author: string;
  at: number;
  /** Set when this revision was replayed from another app. */
  pulledFrom?: { appId: string; appName: string; revisionId: string };
  /** A short note from the agent on what it did. */
  note?: string;
}

export interface App {
  id: string;
  name: string;
  /** Slug of the template it started from. */
  template: string;
  /** Current source. Always equals the last revision's source. */
  source: string;
  /** The last revision's manifest, if it still has one. See `Revision.manifest`. */
  manifest?: ComponentSpec[];
  history: Revision[];
  createdAt: number;
  updatedAt: number;
  /** Set when this app was forked from another. */
  forkedFrom?: { appId: string; appName: string };
  /**
   * Set when the app reached you from someone else rather than being yours.
   *
   * Absent means you own it. Sharing is one-directional and read-first: you can
   * open a shared app and fork it, and your edits land on the fork — which is
   * the same shape as pulling a revision, and keeps the owner's copy the only
   * thing their history describes.
   */
  sharedBy?: { name: string; at: number };
}

export interface AppSummary {
  id: string;
  name: string;
  template: string;
  updatedAt: number;
  revisions: number;
  /** Everyone who has made a revision, in first-seen order. */
  authors: string[];
  forkedFrom?: { appId: string; appName: string };
  sharedBy?: { name: string; at: number };
}
