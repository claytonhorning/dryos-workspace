/**
 * The eight chart series slots, in fixed order, for both themes.
 *
 * They lived only as CSS text inside the frame's stylesheet, which was right up
 * to the moment the *host* had to draw one: a swatch painted `var(--s3)` in the
 * panel resolves against the host document, where those tokens do not exist,
 * and eight colours came out white — invisible circles. So the values live here as
 * data, `runtime.ts` writes the frame's variables from them, and anything out
 * here that has to show a series colour reads the same array.
 *
 * The order is the colour-vision safety mechanism, not cosmetics: each mode's
 * sequence was validated as a set (adjacent-pair CVD ΔE, chroma floor, contrast
 * against its own surface), and light is its own selected stepping rather than
 * an automatic flip of dark. s1–s3 are the brand colours charts already used;
 * s4–s8 extend them for the stacked and bar shapes. Reorder or restep only
 * through the palette validator, and never grow the list — every shape caps its
 * selection at eight before a ninth could be asked for.
 */
export const SERIES_PALETTE: Record<"dark" | "light", string[]> = {
  dark: [
    "#e8ff3d",
    "#7dd3fc",
    "#fbbf24",
    "#9085e9",
    "#199e70",
    "#e87ba4",
    "#d95926",
    "#3987e5",
  ],
  light: [
    "#5b6f0c",
    "#0b6a94",
    "#a16207",
    "#4a3aa7",
    "#047857",
    "#e87ba4",
    "#2a78d6",
    "#eb6834",
  ],
};

/** The same eight, as the CSS custom properties every generated app is written against. */
export function seriesVars(mode: "dark" | "light"): string {
  return SERIES_PALETTE[mode]
    .map((hex, i) => `--s${i + 1}:${hex};`)
    .join(" ");
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** `amount` of the way from one colour to another. */
export function mixHex(from: string, to: string, amount: number): string {
  const a = channels(from);
  const b = channels(to);
  return hex(
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  );
}

/**
 * Which row of the ramp is the palette slot itself.
 *
 * Second, not first: the lighter tint reads as the softer version of the slot,
 * and putting the slot at the top would make the grid look like it starts
 * somewhere other than where the defaults live.
 */
export const RAMP_BASE = 1;

/**
 * One hue, four steps: a tint, the slot, and two shades.
 *
 * The picker is a grid because eight colours is a set and thirty-two is a
 * choice — but only the middle row is the validated set. The rest are derived
 * from it, so every column is still one of the eight hues rather than an
 * unrelated colour somebody has to judge against the others. Mixed towards
 * white and black in sRGB: crude next to a proper perceptual ramp, and exactly
 * predictable, which matters more for a strip somebody is scanning.
 */
export function seriesRamp(slot: string): string[] {
  return [
    mixHex(slot, "#ffffff", 0.45),
    slot,
    mixHex(slot, "#000000", 0.3),
    mixHex(slot, "#000000", 0.58),
  ];
}

/** Black or white, whichever can be read on this colour. */
export function readableInk(colour: string): string {
  const [r, g, b] = channels(colour).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  // Relative luminance, the same weighting the contrast ratio is built on.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.42 ? "#000000" : "#ffffff";
}
