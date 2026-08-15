"use client";

import { useState } from "react";
import { cx } from "./ui";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          /* clipboard unavailable in some contexts — the affordance still reads as done */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className={cx(
        "rounded border px-2 py-1 font-mono text-[10.5px] tracking-[0.08em] uppercase transition-colors",
        copied
          ? "border-accent-line bg-accent-dim text-accent"
          : "border-line-strong bg-surface-2 text-muted hover:text-ink",
      )}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function CodeBlock({
  code,
  title,
  className,
  wrap = false,
}: {
  code: string;
  title?: string;
  className?: string;
  /** Soft-wrap instead of scrolling — for narrow rails where the whole
   *  definition should be readable at a glance. */
  wrap?: boolean;
}) {
  return (
    <div className={cx("overflow-hidden rounded-lg border border-line bg-code", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
        <span className="font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
          {title ?? "shell"}
        </span>
        <CopyButton value={code} />
      </div>
      <pre
        className={cx(
          "dr-scroll px-3 py-3 font-mono text-[12px] leading-relaxed text-muted",
          wrap ? "break-words whitespace-pre-wrap" : "overflow-x-auto",
        )}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
