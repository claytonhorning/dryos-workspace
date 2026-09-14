import { authServer } from "@/lib/workspace/mcpAuth";

/**
 * Supabase Auth's own authorization-server metadata, relayed from this
 * origin. Clients on the 2025-03-26 MCP spec look for it on the MCP
 * server's host rather than following the protected-resource document, so
 * without this they would never find the login. The document is Supabase's,
 * unchanged — its endpoints and issuer are still Supabase's.
 */
export const revalidate = 3600;

export async function GET() {
  const res = await fetch(`${authServer()}/.well-known/oauth-authorization-server`, {
    next: { revalidate: 3600 },
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
