import { AsyncLocalStorage } from "node:async_hooks";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

/**
 * A request that carries a bearer token instead of a cookie — the workspace
 * MCP server's, where an agent signed in through Supabase's OAuth server.
 * Inside `asBearer`, every `supabaseServer()` call answers with a client
 * that sends that token, so the store and the workspace modules run
 * unchanged and RLS scopes every row to the token's user, exactly as it does
 * for a cookie. Async-local rather than a parameter: threading a client
 * through every store function would be a large diff for one caller.
 */
const bearer = new AsyncLocalStorage<SupabaseClient>();

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

export function asBearer<T>(token: string, run: () => Promise<T>): Promise<T> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: NO_SESSION },
  );
  return bearer.run(client, run);
}

/**
 * The user a bearer token belongs to, verified by the auth server, or null.
 * A round trip per MCP request, which is nothing beside the compile a tool
 * call runs; an expired or forged token is null, never anonymous.
 */
export async function userOfToken(token: string): Promise<{ id: string; email?: string } | null> {
  // A plain request rather than a client: constructing supabase-js starts
  // its realtime client, which throws on a Node without a native WebSocket
  // (local dev runs 18), and a verification that throws reads as "no user".
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/auth/v1/user`, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string; email?: string };
    return user.id ? { id: user.id, email: user.email } : null;
  } catch {
    return null;
  }
}

function cookieClient(store: Awaited<ReturnType<typeof cookies>>) {
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

export async function supabaseServer(): Promise<ReturnType<typeof cookieClient>> {
  const held = bearer.getStore();
  // The two clients differ only in how they carry the session.
  if (held) return held as unknown as ReturnType<typeof cookieClient>;
  return cookieClient(await cookies());
}
