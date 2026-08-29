"use client";

import { useTheme } from "@/lib/useTheme";

/**
 * An app, running, at tile size.
 *
 * The thumbnail is the real compiled app — the same bundle the editor loads —
 * but served with the preview shim, so it generates its own rows instead of
 * asking a host. A tile has no host: nothing on a shelf listens for the
 * messages a frame posts, which is why every thumbnail used to sit there for
 * thirty seconds and then render "Dryos request timed out".
 *
 * Serving itself also means a wall of tiles costs nothing. Twelve frames each
 * pulling the live feed to draw a postcard would be billed twelve times for
 * pictures nobody reads a number off.
 *
 * The numbers are therefore not real, and the tag says so. It is small because
 * it sits on a small thing, and it is never optional — a tile that looks like
 * live data and is not is the one mistake this component could make.
 *
 * Rendered at full width and scaled down rather than rendered narrow, so text
 * stays legible instead of reflowing into a column. The frame is inert: pointer
 * events pass through to whatever wraps it, so the whole tile stays one target.
 */
export function Thumbnail({ src, label = true }: { src: string; label?: boolean }) {
  // No host to ask, so the theme rides in on the URL.
  const theme = useTheme();

  return (
    <>
      <iframe
        src={`${src}${src.includes("?") ? "&" : "?"}preview=1&theme=${theme}`}
        sandbox="allow-scripts"
        title=""
        aria-hidden
        tabIndex={-1}
        loading="lazy"
        className="pointer-events-none absolute top-0 left-0 h-[250%] w-[250%] origin-top-left scale-[0.4] border-0"
      />
      {label && (
        <span className="pointer-events-none absolute right-1.5 bottom-1.5 rounded-sm border border-dashed border-info-line bg-bg/80 px-1.5 py-px font-mono text-[8.5px] tracking-[0.1em] text-info uppercase backdrop-blur">
          Sample data
        </span>
      )}
    </>
  );
}
