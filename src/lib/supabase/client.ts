import { createBrowserClient } from "@supabase/ssr";

/**
 * The browser's Supabase client.
 *
 * One per call site rather than a module singleton — createBrowserClient
 * dedupes internally, and importing a constructed client at module scope would
 * throw at build time on a machine whose .env.local has no Supabase yet.
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

/** Whether this environment is wired to a Supabase project at all. */
export const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
