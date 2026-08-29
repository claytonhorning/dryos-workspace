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
