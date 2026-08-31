"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import { supabaseBrowser, supabaseConfigured } from "@/lib/supabase/client";

/**
 * The door to the workspace.
 *
 * One card, both directions through it: signing in and creating the account
 * are the same two fields, so they are the same form with the verb swapped —
 * a separate register page would be a second door to the same room.
 *
 * Arrived at mostly by redirect: the middleware bounces a signed-out visit to
 * any /workspace URL here, with the original destination in ?next so the login
 * lands where the click was going, not on a generic home.
 */
function LoginCard() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/workspace";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // A failed email link arrives as ?error= from /auth/callback.
  const [error, setError] = useState<string | null>(params.get("error"));
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email || !password) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    let leaving = false;

    const supabase = supabaseBrowser();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) return setError(error.message);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // The confirmation email lands back on /auth/callback, which
            // trades the code for a session and forwards to the destination.
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) return setError(error.message);
        if (!data.session) {
          // Confirmation is on: the account exists but cannot sign in until
          // the email link is clicked. Say so instead of failing quietly.
          return setNotice(
            `Check ${email} for a confirmation link, then come back.`,
          );
        }
      }
      // Still pending on the way out: `router.push` returns before the next
      // route renders, and a Sign in button that re-enables mid-navigation
      // reads as a failed attempt worth repeating.
      leaving = true;
      router.push(next);
      router.refresh();
    } finally {
      // Every other exit — a bad password, a confirmation notice, a thrown
      // request — stays on this page, and a button left spinning there is
      // stuck rather than busy.
      if (!leaving) setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center px-4">
      <span className="dryos-mark text-[26px]">dryos</span>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
        {mode === "signin"
          ? "Sign in to open your workspaces."
          : "Create an account to start building."}
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <label className="block">
          <span className="font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
            Email
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[13.5px] text-ink outline-none placeholder:text-faint focus:border-line-strong"
            placeholder="you@company.com"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
            Password
          </span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[13.5px] text-ink outline-none focus:border-line-strong"
          />
        </label>

        <Button
          tone="primary"
          disabled={busy || !supabaseConfigured}
          type="submit"
        >
          {busy
            ? "One moment…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </Button>

        {!supabaseConfigured && (
          <p className="text-[12px] leading-relaxed text-warn">
            Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in frontend/.env.local.
          </p>
        )}
        {error && (
          <p className="text-[12.5px] leading-snug text-warn">{error}</p>
        )}
        {notice && (
          <p className="text-[12.5px] leading-snug text-accent">{notice}</p>
        )}
      </form>

      <button
        onClick={() => {
          setMode((m) => (m === "signin" ? "signup" : "signin"));
          setError(null);
          setNotice(null);
        }}
        className="mt-5 self-start font-mono text-[11px] text-faint transition-colors hover:text-ink"
      >
        {mode === "signin"
          ? "No account yet? Create one"
          : "Already have an account? Sign in"}
      </button>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams needs a boundary for prerendering; the card centres
  // itself, so an empty fallback shifts nothing.
  return (
    <Suspense fallback={null}>
      <LoginCard />
    </Suspense>
  );
}
