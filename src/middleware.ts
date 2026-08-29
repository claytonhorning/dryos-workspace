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
 * `/api` is deliberately outside the matcher. The data route is polled every
 * few seconds by every tile on a screen, and a Supabase round trip per poll
 * would be latency spent re-answering a question the page load already
 * answered. That route reads the session cookie itself, locally.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Not wired to a project (fresh clone, no .env.local): no sessions to
  // refresh and nothing to gate with, so the site stays reachable.
  if (!url || !key) return NextResponse.next();

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

  if (!user && request.nextUrl.pathname.startsWith("/workspace")) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  // Everything except API routes, Next internals and files with extensions.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
