import Link from "next/link";
import type { ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ── Surfaces ─────────────────────────────────────────────────────────── */

export function Panel({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-lg border border-line bg-surface",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
      <div>
        <h2 className="text-[13px] font-semibold tracking-wide text-ink uppercase">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 font-mono text-[11px] tracking-[0.14em] text-faint uppercase">
      {children}
    </div>
  );
}

/* ── Metrics ──────────────────────────────────────────────────────────── */

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "accent" | "warn";
}) {
  return (
    <div className="px-5 py-4">
      <div className="font-mono text-[11px] tracking-[0.12em] text-faint uppercase">
        {label}
      </div>
      <div
        className={cx(
          "mt-2 text-2xl font-semibold tabular-nums tracking-tight",
          tone === "accent" && "text-accent",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-[12px] text-muted">{hint}</div>}
    </div>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-4 md:divide-y-0">
      {children}
    </div>
  );
}

/* ── Controls ─────────────────────────────────────────────────────────── */

type ButtonTone = "primary" | "secondary" | "ghost" | "danger";

const buttonTone: Record<ButtonTone, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover border-transparent font-semibold",
  secondary: "bg-surface-2 text-ink hover:bg-surface-3 border-line-strong",
  ghost: "bg-transparent text-muted hover:text-ink hover:bg-surface-2 border-transparent",
  danger: "bg-transparent text-fail hover:bg-fail-dim border-fail-line",
};

const buttonSize = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9.5 px-4 text-[13.5px]",
};

export function Button({
  children,
  tone = "secondary",
  size = "md",
  className,
  ...rest
}: {
  children: ReactNode;
  tone?: ButtonTone;
  size?: keyof typeof buttonSize;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        buttonTone[tone],
        buttonSize[size],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  href,
  tone = "secondary",
  size = "md",
  className,
}: {
  children: ReactNode;
  href: string;
  tone?: ButtonTone;
  size?: keyof typeof buttonSize;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md border transition-colors",
        buttonTone[tone],
        buttonSize[size],
        className,
      )}
    >
      {children}
    </Link>
  );
}

/* ── Chips ────────────────────────────────────────────────────────────── */

export function Chip({
  children,
  className,
  mono = false,
}: {
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded border border-line bg-surface-2 px-2 py-[3px] text-[11.5px] text-muted",
        mono && "font-mono tracking-tight",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Empty state ──────────────────────────────────────────────────────── */

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-muted">{body}</p>
    </div>
  );
}
