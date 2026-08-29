"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { cx } from "@/components/ui";
import { supabaseBrowser, supabaseConfigured } from "@/lib/supabase/client";

/**
 * Who you are, and what that gets you.
 *
 * It replaced the usage meter in the chrome. A running total is something you
 * consult, not something you monitor, and it was taking the one spot in the bar
 * that belongs to the account — so the number moved to where the spending
 * happens and this took its place.
 *
 * Signed out it is the word "Log in", not an empty avatar with a menu that
 * apologises. The product pages are reachable without an account; the one
 * thing this corner owes a signed-out visitor is the way in.
 */
export function AccountButton() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!supabaseConfigured) {
      setReady(true);
      return;
    }
    const supabase = supabaseBrowser();
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Render nothing until the session answer arrives: a "Log in" that flashes
  // and becomes an avatar reads as the page changing its mind about you.
  if (!ready) return <div className="h-7 w-7" aria-hidden />;

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-md border border-line-strong px-2.5 py-1 text-[12.5px] text-muted transition-colors hover:border-accent-line hover:text-ink"
      >
        Log in
      </Link>
    );
  }

  const email = user.email ?? "account";

  async function signOut() {
    setOpen(false);
    await supabaseBrowser().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div ref={wrap} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account"
        title={email}
        className={cx(
          "grid h-7 w-7 place-items-center rounded-full border text-[11px] font-semibold uppercase transition-colors",
          open
            ? "border-accent-line bg-accent-dim text-accent"
            : "border-line-strong bg-surface-2 text-muted hover:text-ink",
        )}
      >
        {email[0]}
      </button>

      {open && (
        <div className="dr-rise absolute top-full right-0 mt-1.5 w-56 overflow-hidden rounded-lg border border-line-strong bg-surface shadow-2xl shadow-black/60">
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-[13px] font-medium text-ink">{email}</p>
            <p className="mt-0.5 font-mono text-[10px] text-faint">signed in</p>
          </div>

          <Link
            href="/usage"
            onClick={() => setOpen(false)}
            className="block border-b border-line px-3 py-2 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Usage &amp; billing
          </Link>
          <Link
            href="/docs"
            onClick={() => setOpen(false)}
            className="block border-b border-line px-3 py-2 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Docs
          </Link>

          <button
            onClick={signOut}
            className="block w-full px-3 py-2 text-left text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
