"use client";

import { useEffect, useState } from "react";

/**
 * Which theme the page is actually wearing, right now.
 *
 * Read off `data-theme` and nothing else, because that is all the host's CSS
 * reads: the page is dark-first, so a root with no attribute paints dark
 * whatever the system prefers. This used to fall back to the media query,
 * which the stylesheet never does — so on a light-preferring machine whose
 * root had lost its attribute, the nav drew dark and every frame was told
 * "light". Watched, because the toggle can change it while a frame is open and
 * a sandboxed app has no way to notice on its own — it is an opaque origin and
 * cannot read this document at all.
 */
export function useTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const read = () =>
      setTheme(
        document.documentElement.getAttribute("data-theme") === "light"
          ? "light"
          : "dark",
      );

    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}
