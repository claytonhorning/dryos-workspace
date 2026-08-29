"use client";

import { useCallback } from "react";

/**
 * Focus an input the moment it appears, and select what is in it.
 *
 * A callback ref rather than an effect, because these fields are mounted
 * conditionally — an effect keyed to the component runs once, when the field is
 * not there yet, and never again. A callback ref fires when the node actually
 * attaches, which is the event we care about.
 *
 * It replaces `autoFocus` plus `onFocus={e => e.target.select()}`, which looks
 * like it does this and mostly does: React attaches the handler in the same
 * commit the browser dispatches focus, so whether the select runs is a race. It
 * loses often enough to be noticed and never often enough to be reported.
 *
 * Selecting matters because these are rename fields. Clicking a title almost
 * always means replacing it, and appending to a name you meant to overwrite is a
 * small daily annoyance nobody should have to learn to avoid.
 */
export function useSelectOnMount() {
  return useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    el.focus();
    el.select();
  }, []);
}
