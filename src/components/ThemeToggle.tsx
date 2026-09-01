"use client";

import { useEffect, useState } from "react";
import { cx } from "./ui";

export type Theme = "dark" | "light";

/**
 * Runs before first paint, so the page never flashes the wrong theme.
 *
 * Inlined into <head> as a blocking script. It resolves the theme once and
 * writes it to the root element, which is why the CSS only needs to define
 * `[data-theme="light"]` and not a parallel media-query copy.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('dryos-theme');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  // The script above is the source of truth on first paint; read back from the
  // DOM rather than re-deriving, so the button can never disagree with the page.
  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  // Follow the OS while the user has not expressed a preference.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem("dryos-theme")) return;
      const next: Theme = e.matches ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("dryos-theme", next);
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      // Constant, deliberately. Deriving the label from post-mount state means
      // the server renders one string and the client swaps it on hydrate, which
      // is a mismatch — and an accessible name that changes under a screen
      // reader is worse than a stable one that describes the action.
      aria-label="Toggle light and dark theme"
      title="Toggle light and dark theme"
      className={cx(
        "grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line",
        "text-muted transition-colors hover:border-line-strong hover:text-ink",
      )}
    >
      {/* Both icons ship; CSS picks one, so there is nothing to swap on hydrate. */}
      <SunIcon className="hidden dr-when-dark:block" />
      <MoonIcon className="hidden dr-when-light:block" />
    </button>
  );
}

/**
 * The same choice as a menu row, for the account popup.
 *
 * Stateless on purpose: which side is lit comes from the `dr-when-*` CSS
 * variants, the same way the standalone button picks its icon, so it can never
 * disagree with the page and there is nothing to reconcile on hydrate.
 */
export function ThemeMenuItem() {
  function set(next: Theme) {
    document.documentElement.dataset.theme = next;
    localStorage.setItem("dryos-theme", next);
  }

  return (
    <div className="px-3 py-2" aria-label="Theme">
      <div className="grid grid-cols-2 overflow-hidden rounded-md border border-line-strong text-[12px]">
        <button
          onClick={() => set("dark")}
          className="py-1.5 text-center transition-colors dr-when-dark:bg-accent-dim dr-when-dark:text-accent dr-when-light:text-muted dr-when-light:hover:bg-surface-2 dr-when-light:hover:text-ink"
        >
          Dark mode
        </button>
        <button
          onClick={() => set("light")}
          className="border-l border-line-strong py-1.5 text-center transition-colors dr-when-light:bg-accent-dim dr-when-light:text-accent dr-when-dark:text-muted dr-when-dark:hover:bg-surface-2 dr-when-dark:hover:text-ink"
        >
          Light mode
        </button>
      </div>
    </div>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.4" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line
          key={deg}
          x1="8"
          y1="1.4"
          x2="8"
          y2="3"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          transform={`rotate(${deg} 8 8)`}
        />
      ))}
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
