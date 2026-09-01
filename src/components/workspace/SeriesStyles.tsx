"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { Select } from "@/components/Select";
import {
  readSeries,
  seriesControls,
  seriesHex,
  seriesSlots,
  SERIES_LINES,
  type ComponentKind,
} from "@/lib/workspace/components";
import {
  RAMP_BASE,
  readableInk,
  seriesRamp,
  SERIES_PALETTE,
} from "@/lib/workspace/palette";
import { useTheme } from "@/lib/useTheme";
import type { DataRef } from "@/lib/workspace/catalog";

/**
 * The series a component is about to draw, and how each one is drawn.
 *
 * It sits under the preview rather than beside the other settings, because it
 * is a different kind of setting: the shape's own options are chosen from a
 * list the shape declares, and these are chosen from the selection — one row
 * per series, however many were picked.
 *
 * Colour and line style are the same decision twice on purpose. Two hues at
 * 1.6px is a chart some readers cannot separate at all, and one that nobody can
 * separate in a greyscale printout of it; a dashed line survives both. So the
 * style sits beside the colour rather than under an "advanced" anything.
 *
 * Everything writes into one option — `series`, a JSON string — so it travels
 * with the rest of the settings through the preview URL, the drag payload and
 * the manifest without a single route learning a new field.
 */
export function SeriesStyles({
  refs,
  kind,
  options,
  onChange,
}: {
  refs: DataRef[];
  kind: ComponentKind;
  options: Record<string, string>;
  /** The new value of the `series` option, JSON. */
  onChange: (series: string) => void;
}) {
  const controls = seriesControls(kind);
  const slots = seriesSlots(refs);
  const styles = readSeries(options);
  /*
    Real colours, not the `var(--sN)` the generator emits. Those tokens are
    defined in the frame's own stylesheet — a swatch painted with one out here
    resolves against this document, finds nothing, and draws a white circle.
    The values come from the same array the frame's variables are written from,
    and follow this document's theme because the frame will follow it too.
  */
  const palette = SERIES_PALETTE[useTheme()];

  /** Which series' picker is open. One at a time: two would be a colour wheel each. */
  const [open, setOpen] = useState<string | null>(null);

  function set(
    key: string,
    patch: { c?: number | string; d?: string; a?: string },
  ) {
    onChange(
      JSON.stringify({
        ...styles,
        [key]: { ...styles[key], ...patch },
      }),
    );
  }

  /*
    A second y-axis is only offered where the generator will honour it: the
    chart shape, overlapping (a stack sums onto one axis, a spread is one
    derived series), and only once there are two series — one series on the
    right is the same chart with its axis moved, which the generator
    normalises away.
  */
  const axisable =
    controls.axis &&
    (options.shape ?? "line") !== "stacked" &&
    options.combine !== "spread";

  /*
    A colour input reports every value the pointer passes through, and each one
    committed here is a preview frame recomposed, recompiled and re-queried.
    So dragging is shown immediately and saved when it settles: the draft is
    what the swatch wears, the timer is what the chart gets.

    The commit reads the styles from a ref rather than from this render's
    closure — by the time it fires, the render that scheduled it may be two
    settings out of date.
  */
  const [draft, setDraft] = useState<
    Record<string, string>
  >({});
  const latest = useRef(styles);
  useEffect(() => {
    latest.current = styles;
  });
  const timer = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function pickColour(key: string, hex: string) {
    setDraft((d) => ({ ...d, [key]: hex }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onChange(
        JSON.stringify({
          ...latest.current,
          [key]: { ...latest.current[key], c: hex },
        }),
      );
    }, 220);
  }

  /** A slot from the palette: no draft, no debounce — one value, committed. */
  function pickSlot(key: string, slot: number) {
    if (timer.current) clearTimeout(timer.current);
    setDraft((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
    set(key, { c: slot });
  }

  /** Back to the slot this series' position earns — draft included. */
  function resetColour(key: string) {
    if (timer.current) clearTimeout(timer.current);
    setDraft((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
    set(key, { c: undefined });
  }

  return (
    <div className="rounded-lg border border-line bg-surface-2/40 p-2">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
          Series
        </span>
        <span className="ml-auto font-mono text-[9.5px] text-faint">
          {slots === null
            ? "one per entity, from the data"
            : `${slots.length} selected`}
        </span>
      </div>

      {/*
        A lone stream-level reference means all of it, and which entities that
        is comes from the rows at runtime — so there is nothing here to list and
        saying so is better than an empty box. Their colours are assigned
        alphabetically in the frame, which is what keeps a reload from
        repainting anyone.
      */}
      {slots === null ? (
        <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
          This stream fans out — a series per entity,
          discovered from the data and coloured in name
          order, so an entity added later appears without
          this page being rebuilt.
        </p>
      ) : slots.length === 0 ? (
        <p className="mt-1.5 text-[11.5px] text-muted">
          Nothing selected yet.
        </p>
      ) : (
        <>
          <ul className="mt-1.5 flex flex-col gap-1">
            {slots.map((slot, n) => {
              const pick = styles[slot.key] ?? {};
              const custom =
                draft[slot.key] ?? seriesHex(pick.c);
              const slotIndex =
                typeof pick.c === "number"
                  ? pick.c % palette.length
                  : n;
              const colour = custom ?? palette[slotIndex];
              const showing = open === slot.key;
              return (
                <li
                  key={slot.key}
                  className="rounded-md border border-line bg-surface px-2 py-1.5"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {controls.color ? (
                      <button
                        onClick={() =>
                          setOpen(showing ? null : slot.key)
                        }
                        aria-expanded={showing}
                        aria-label={`Colour for ${slot.label}`}
                        title="Choose a colour"
                        className={cx(
                          "h-5 w-5 shrink-0 rounded-full ring-offset-1 ring-offset-surface transition-transform hover:scale-110",
                          showing
                            ? "ring-2 ring-ink"
                            : "ring-1 ring-line",
                        )}
                        style={{ background: colour }}
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: colour }}
                      />
                    )}

                    {/*
                      The entity carries the row; the stream sits under it in
                      small type. One truncating line held both, and what the
                      ellipsis ate was exactly the half that told two rows
                      apart. No hex readout — the swatch already is the
                      colour, and the number is inside the picker for whoever
                      needs it.
                    */}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] text-ink">
                        {slot.short}
                      </span>
                      {slot.stream && (
                        <span className="block truncate text-[9.5px] text-faint">
                          {slot.stream}
                        </span>
                      )}
                    </span>

                    {axisable && slots.length >= 2 && (
                      <Select
                        value={pick.a === "r" ? "r" : "l"}
                        onChange={(v) =>
                          set(slot.key, { a: v })
                        }
                        options={[
                          { value: "l", label: "Left" },
                          { value: "r", label: "Right" },
                        ]}
                        aria-label="Which y-axis this series plots on"
                        size="sm"
                        align="right"
                        className="shrink-0"
                      />
                    )}

                    {controls.line && (
                      <Select
                        value={pick.d ?? "solid"}
                        onChange={(v) =>
                          set(slot.key, { d: v })
                        }
                        options={SERIES_LINES.map((l) => ({
                          value: l.value,
                          label: l.label,
                        }))}
                        aria-label="Line style"
                        size="sm"
                        align="right"
                        className="shrink-0"
                      />
                    )}

                    {/*
                      Only once there is something to undo. The default is not a
                      colour, it is the slot this series' position earns — which
                      is the one that follows the theme.
                    */}
                    {controls.color &&
                      pick.c !== undefined && (
                        <button
                          onClick={() =>
                            resetColour(slot.key)
                          }
                          title="Back to the default colour"
                          className="shrink-0 rounded px-1 font-mono text-[10px] text-faint transition-colors hover:text-ink"
                        >
                          reset
                        </button>
                      )}
                  </div>

                  {showing && controls.color && (
                    <ColourPicker
                      palette={palette}
                      slot={custom ? null : slotIndex}
                      hex={colour}
                      onSlot={(i) => pickSlot(slot.key, i)}
                      onHex={(h) => pickColour(slot.key, h)}
                      onClose={() => setOpen(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * The picker itself: the set to choose from, or a colour of your own.
 *
 * Two tabs rather than one control, because they are two different decisions.
 * The palette is a *set* — eight slots whose order and stepping were validated
 * together for colour-vision safety, one per theme — and picking from it keeps
 * a chart inside that guarantee and following the theme. Custom is the way out
 * of it, for the times the colour is not ours to choose: a brand, a house
 * style, a deck this has to sit in.
 *
 * It opens inline, under the row it belongs to, rather than floating over it.
 * This list lives inside two nested scroll containers — the panel's and the
 * pane's — and a popover in there is a popover with a corner clipped off.
 */
function ColourPicker({
  palette,
  slot,
  hex,
  onSlot,
  onHex,
  onClose,
}: {
  palette: string[];
  /** Which slot is current, or null when a custom colour is. */
  slot: number | null;
  hex: string;
  onSlot: (slot: number) => void;
  onHex: (hex: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"palette" | "custom">(
    slot === null ? "custom" : "palette",
  );
  /*
    The hex field is typed into a character at a time, and "#5b6" is not a
    colour. So it keeps its own text until it is one, and only a complete
    six-digit value is committed — the swatch and the chart never see a
    half-finished value.
  */
  const [typed, setTyped] = useState(hex);
  useEffect(() => setTyped(hex), [hex]);

  function commitTyped(value: string) {
    setTyped(value);
    const full = value.startsWith("#")
      ? value
      : `#${value}`;
    if (/^#[0-9a-fA-F]{6}$/.test(full))
      onHex(full.toLowerCase());
  }

  return (
    <div className="mt-1.5 rounded-md border border-line bg-surface-2 p-1.5">
      <div className="flex items-center gap-1">
        {(["palette", "custom"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={cx(
              "rounded px-2 py-0.5 text-[11px] transition-colors",
              tab === t
                ? "bg-surface text-ink"
                : "text-faint hover:text-ink",
            )}
          >
            {t === "palette" ? "Palette" : "Custom"}
          </button>
        ))}
        <button
          onClick={onClose}
          aria-label="Close the colour picker"
          className="ml-auto rounded px-1 font-mono text-[11px] text-faint hover:text-ink"
        >
          ×
        </button>
      </div>

      {tab === "palette" ? (
        /*
          Eight hues across, four steps down — one column per palette slot, so
          every colour in the grid is a version of a colour the set was
          validated with rather than an unrelated one.

          The middle row *is* the set: picking from it stores a slot number and
          the series keeps stepping with the theme. Every other cell is a
          derived colour and stores a literal, which is the same trade the
          Custom tab makes and is marked the same way in the line below.

          Left open after a pick on purpose: the chart above redraws on every
          one, and trying three against the data is the whole point of choosing
          a colour beside a preview rather than in a dialog over it.
        */
        <div className="mt-1.5 grid grid-cols-8 gap-1">
          {[0, 1, 2, 3].map((row) =>
            palette.map((base, col) => {
              const c = seriesRamp(base)[row];
              const isSlot = row === RAMP_BASE;
              const on = isSlot
                ? slot === col
                : slot === null &&
                  hex.toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={`${row}:${col}`}
                  onClick={() =>
                    isSlot ? onSlot(col) : onHex(c)
                  }
                  aria-label={`Colour ${col + 1}, step ${row + 1}`}
                  aria-pressed={on}
                  title={
                    isSlot
                      ? `Colour ${col + 1} · follows the theme`
                      : c
                  }
                  className={cx(
                    "flex aspect-square items-center justify-center rounded-md text-[11px] leading-none transition-transform hover:scale-110",
                    // The slot row is the one with a guarantee behind it, so it
                    // is the one the eye lands on: full size, the others inset.
                    isSlot
                      ? "ring-1 ring-line-strong"
                      : "scale-95 ring-1 ring-line",
                  )}
                  style={{
                    background: c,
                    color: readableInk(c),
                  }}
                >
                  {on ? "✓" : ""}
                </button>
              );
            }),
          )}
        </div>
      ) : (
        <div className="mt-1.5 flex items-center gap-2">
          {/*
            The platform's own picker — wheel, sliders, eyedropper — behind a
            swatch, and the hex beside it for the colour somebody already knows
            the number of.
          */}
          <input
            type="color"
            value={hex}
            onChange={(e) => onHex(e.target.value)}
            aria-label="Pick a colour"
            title="Open the colour picker"
            className="h-7 w-9 shrink-0 cursor-pointer appearance-none rounded border border-line bg-transparent p-0 [&::-moz-color-swatch]:rounded [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-0"
          />
          <input
            value={typed}
            onChange={(e) => commitTyped(e.target.value)}
            spellCheck={false}
            aria-label="Hex colour"
            placeholder="#000000"
            className="w-24 rounded border border-line bg-surface px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-line-strong"
          />
          <span className="min-w-0 truncate font-mono text-[9.5px] text-faint">
            any colour · fixed in both themes
          </span>
        </div>
      )}
    </div>
  );
}
