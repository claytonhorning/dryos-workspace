import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session upkeep, and the one gate.
 *
 * Supabase access tokens expire hourly; this refreshes them on page loads so a
 * tab left open stays signed in. The workspace is the only thing behind a
 * login — the marketing pages and the catalogue argue the product to people
 * who have not signed up yet, which is exactly who they are for.
 *
 * The workspace API is gated too, but cheaply: the data route is polled every
 * few seconds by every tile on a screen, and a Supabase round trip per poll
 * would be latency spent re-answering a question the page load already
 * answered. So `/api/workspace` reads the session cookie locally and answers
 * 401 when there is none — enough to keep the model routes off the open
 * internet, with RLS as the verified check behind every store call and
 * `requireUser` on the routes that spend money.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Not wired to a project (fresh clone, no .env.local): no sessions to
  // refresh and nothing to gate with, so the site stays reachable.
  if (!url || !key) return NextResponse.next();

  const isApi = request.nextUrl.pathname.startsWith("/api/workspace");
  if (isApi) {
    const bare = createServerClient(url, key, {
      cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} },
    });
    const {
      data: { session },
    } = await bare.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign in to use the workspace." }, { status: 401 });
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser rather than getSession: this is the refresh, and it must ask the
  // auth server rather than trust the cookie it is about to renew.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const gated = ["/workspace", "/usage"];
  if (!user && gated.some((p) => request.nextUrl.pathname.startsWith(p))) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  // Every page (not Next internals or files with extensions), plus the
  // workspace API. Other API routes stay open: `/auth/callback` has no
  // session yet by definition.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)", "/api/workspace/:path*"],
};
