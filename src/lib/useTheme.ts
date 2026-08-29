"use client";

import { useEffect, useState } from "react";

/**
 * Which theme the page is actually wearing, right now.
 *
 * Three sources, in the order the CSS resolves them: an explicit `data-theme`
 * wins, otherwise the system preference. Both are watched, because either can
 * change while a frame is open and a sandboxed app has no way to notice on its
 * own — it is an opaque origin and cannot read this document at all.
 */
export function useTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");

    const read = () => {
      const set = document.documentElement.getAttribute("data-theme");
      setTheme(set === "light" || set === "dark" ? set : media.matches ? "light" : "dark");
    };

    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    media.addEventListener("change", read);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", read);
    };
  }, []);

  return theme;
}
