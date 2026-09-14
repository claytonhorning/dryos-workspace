"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { tryOption } from "@/lib/tryIt";

/**
 * Where the landing page's try-it sends someone: a new workspace, opened on
 * the thing they clicked. Behind the login like the rest of `/workspace`,
 * and the middleware carries the query through sign-up, so a first-time
 * visitor lands here with their pick intact.
 *
 * Only a recipe on the try-it list is made; anything else goes to the shelf.
 */
export default function StartPage() {
  return (
    <Suspense fallback={<Building />}>
      <Start />
    </Suspense>
  );
}

function Start() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Effects run twice in development; two runs would be two workspaces.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const pick = tryOption(params.get("recipe"));
    if (!pick) {
      router.replace("/workspace");
      return;
    }
    (async () => {
      const made = await fetch("/api/workspace/spaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: pick.workspace, domain: pick.domain }),
      }).then((r) => r.json());
      const res = await fetch(`/api/workspace/spaces/${made.space.id}/pages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipe: pick.recipe }),
      });
      const body = await res.json();
      if (!res.ok || !body.page) throw new Error(body.error ?? "The page could not be made.");
      router.replace(`/workspace/${made.space.id}/${body.page.id}`);
    })().catch((e: Error) => setError(e.message));
  }, [params, router]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="text-[15px] text-ink">That workspace could not be made.</p>
        <p className="mt-2 text-[13px] text-muted">{error}</p>
        <Link href="/workspace" className="mt-6 inline-block text-[14px] text-accent hover:underline">
          Go to your workspaces →
        </Link>
      </div>
    );
  }
  return <Building />;
}

function Building() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
      <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
      <p className="mt-4 text-[15px] text-ink">Building your workspace…</p>
      <p className="mt-1 text-[13px] text-muted">On live data, in a few seconds.</p>
    </div>
  );
}
