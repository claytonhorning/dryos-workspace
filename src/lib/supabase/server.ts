import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * The server's Supabase client, bound to the request's cookies.
 *
 * Sessions live in cookies, so this works in server components and route
 * handlers alike. The setAll is allowed to fail: a server component render
 * cannot write cookies, and does not need to — the middleware refreshed the
 * session before the render started.
 */
/**
 * The signed-in user, verified against the auth server, or null.
 *
 * For the routes that spend money on a model. The middleware already turns
 * away requests with no session cookie, but it reads that cookie locally and
 * a cookie is a claim, not proof; a round trip to Supabase per model call is
 * nothing against the call itself, so these routes ask. Do not use this on
 * anything polled — the store's RLS is the verified check there, for free.
 */
export async function requireUser() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
}

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              store.set(name, value, options),
            );
          } catch {
            // Server component render — reads only.
          }
        },
      },
    },
  );
}
