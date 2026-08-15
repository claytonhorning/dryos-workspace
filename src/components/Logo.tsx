export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect
        x="0.75"
        y="0.75"
        width="26.5"
        height="26.5"
        rx="7"
        stroke="var(--color-line-strong)"
        strokeWidth="1.5"
      />
      {/* A load curve stepping up through the mark — the shape every energy chart makes. */}
      <path
        d="M5 19.5 L9.5 19.5 L9.5 14 L14 14 L14 8.5 L18.5 8.5 L18.5 16 L23 16"
        stroke="var(--color-accent)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="23"
        cy="16"
        r="2"
        fill="var(--color-accent)"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
      dryos
    </span>
  );
}
