"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemedShot } from "@/components/landing/ThemedShot";
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
 *
 * It opens on the sign-up side. Almost everyone who reaches it pressed "Open
 * Dryos" on the landing page and has no account yet; the returning few flip
 * one link, or arrive with ?mode=signin. Beside the form, on the landing
 * page's own grid, is the workspace they are about to get — the same capture
 * the landing page carries, crisp, in the same frame, with its caption. It
 * was a dimmed backdrop first, and a dark dashboard behind a dark card on a
 * dark ground is mud at any opacity; placed rather than layered, it can be
 * read, which is the only way a preview tempts anyone.
 */
function LoginCard() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/workspace";

  const [mode, setMode] = useState<"signin" | "signup">(
    params.get("mode") === "signin" ? "signin" : "signup",
  );
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
    <div className="mx-auto grid min-h-[calc(100vh-var(--nav-h))] w-full max-w-[1240px] items-center gap-12 px-6 py-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
      <div className="w-full max-w-sm">
        <span className="dryos-mark text-[26px]">dryos</span>
        <h1 className="mt-3 text-[20px] leading-tight font-semibold tracking-[-0.02em] text-ink">
          {mode === "signin"
            ? "Welcome back."
            : "Your workspace is one form away."}
        </h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
          {mode === "signin"
            ? "Sign in to open your workspaces."
            : "One workspace on the live feeds, free. No credit card, now or later, until you want more streams."}
        </p>

        {mode === "signup" && (
          <ul className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 font-mono text-[10px] tracking-[0.1em] text-faint uppercase">
            {[
              "no credit card",
              "1 workspace, 3 streams",
              "every stream live",
            ].map((f) => (
              <li key={f} className="flex items-center gap-1.5">
                <span className="h-[3px] w-[3px] rounded-full bg-accent" />
                {f}
              </li>
            ))}
          </ul>
        )}

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

      {/* The room behind the door, in the landing page's own frame. */}
      <div className="hidden lg:block">
        <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-2xl shadow-black/40">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <span className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
              One page of a workspace
            </span>
            <span className="ml-auto truncate font-mono text-[10px] text-muted">
              Energy › Pricing · Load · Generation
            </span>
          </div>
          <ThemedShot
            name="screen"
            alt="A workspace page: a map of settlement points, a price chart and ticker wired to it, load by zone, fuel mix and a heatmap of five-minute prices"
            ratio="1440/760"
            sizes="(min-width: 1024px) 55vw, 100vw"
            priority
          />
        </div>
        <p className="mt-3 max-w-[64ch] text-[12.5px] leading-relaxed text-faint">
          Six tiles on this afternoon&rsquo;s ERCOT prices, none of them coded.
          Captured from the running page, on the live feed. A free workspace
          opens onto the same shelf.
        </p>
      </div>
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
