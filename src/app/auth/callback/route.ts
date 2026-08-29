import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Where email links land.
 *
 * A confirmation (or magic-link) click goes to Supabase first, which verifies
 * it and redirects here with a one-time code. Trading the code for a session
 * has to happen server-side so the cookies are set before the browser is sent
 * on to wherever it was originally going.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/workspace";

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("That link did not work — it may have expired. Sign in to try again.")}`,
  );
}
