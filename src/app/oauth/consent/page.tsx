"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Where Supabase's OAuth server sends someone whose agent asked to use their
 * Dryos account — the "Allow Claude to build in your workspaces?" screen.
 *
 * Supabase validates the client and the request, then redirects here with an
 * `authorization_id`; this page makes sure the person is signed in (through
 * the ordinary login, which returns here with the id intact), shows who is
 * asking, and approves or denies. Supabase issues the code and the tokens;
 * nothing here sees one.
 */
export default function ConsentPage() {
  return (
    <Suspense fallback={<Frame>Loading…</Frame>}>
      <Consent />
    </Suspense>
  );
}

type Details = { client: string; email: string; redirect: string };

function Consent() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("authorization_id");
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!id) {
      setError("This link is missing its authorization request. Start the connection again from your AI client.");
      return;
    }
    (async () => {
      const sb = supabaseBrowser();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        router.replace(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`);
        return;
      }
      const { data, error } = await sb.auth.oauth.getAuthorizationDetails(id);
      if (error || !data) {
        setError(error?.message ?? "That request could not be read.");
        return;
      }
      // Consented before: Supabase answers with where to go, not what to ask.
      if (!("authorization_id" in data)) {
        window.location.assign(data.redirect_url);
        return;
      }
      setDetails({
        client: data.client.name || "An AI client",
        email: data.user.email,
        redirect: data.redirect_uri,
      });
    })().catch((e: Error) => setError(e.message));
  }, [id, router]);

  async function decide(allow: boolean) {
    if (!id) return;
    setBusy(true);
    const sb = supabaseBrowser();
    const { data, error } = allow
      ? await sb.auth.oauth.approveAuthorization(id)
      : await sb.auth.oauth.denyAuthorization(id);
    if (error || !data) {
      setBusy(false);
      setError(error?.message ?? "That did not go through.");
      return;
    }
    // Still busy on the way out: the client's page takes over from here.
    window.location.assign(data.redirect_url);
  }

  if (error) {
    return (
      <Frame>
        <p className="text-[15px] text-ink">That did not work.</p>
        <p className="mt-2 text-[13.5px] text-muted">{error}</p>
      </Frame>
    );
  }
  if (!details) return <Frame>Checking your sign-in…</Frame>;

  return (
    <Frame>
      <p className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">Connect an AI client</p>
      <h1 className="mt-3 text-[22px] font-semibold tracking-[-0.02em] text-ink">
        {details.client} wants to use your Dryos account
      </h1>
      <p className="mt-2 text-[13.5px] text-muted">Signed in as {details.email}</p>

      <ul className="mt-6 space-y-2.5 text-[14px] text-muted">
        {[
          "See your workspaces and their pages",
          "Create workspaces and pages, and add tiles to them",
        ].map((l) => (
          <li key={l} className="flex gap-2.5">
            <span className="mt-[9px] h-[3px] w-[3px] shrink-0 rounded-full bg-accent" />
            {l}
          </li>
        ))}
        <li className="flex gap-2.5">
          <span className="mt-[9px] h-[3px] w-[3px] shrink-0 rounded-full bg-line-strong" />
          It cannot delete anything, and every change is a revision you can revert.
        </li>
      </ul>

      <p className="mt-6 text-[12px] break-all text-faint">Returns to {details.redirect}</p>

      <div className="mt-6 flex gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(true)}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-accent px-4 text-[13.5px] font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          Allow
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(false)}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-line-strong px-4 text-[13.5px] text-muted hover:text-ink disabled:opacity-60"
        >
          Deny
        </button>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="rounded-xl border border-line bg-surface p-7 text-[14px] text-muted">{children}</div>
    </div>
  );
}
