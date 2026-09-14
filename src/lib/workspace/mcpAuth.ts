/**
 * Where an MCP client learns to sign in to the workspace MCP server.
 *
 * The server answers an unsigned request with 401 and a `WWW-Authenticate`
 * naming its protected-resource metadata (RFC 9728); that document names
 * Supabase Auth as the authorization server, and the client takes it from
 * there — dynamic registration, the login, the consent page at
 * `/oauth/consent`, the token. Nothing here issues or stores a token.
 */

export const MCP_PATH = "/api/mcp";

/** Supabase Auth, as an OAuth 2.1 issuer. */
export function authServer(): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/auth/v1`;
}

/** The origin a request arrived on — so localhost and dryos.ai each describe themselves. */
export function originOf(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function resourceMetadata(origin: string) {
  return {
    resource: `${origin}${MCP_PATH}`,
    authorization_servers: [authServer()],
    bearer_methods_supported: ["header"],
    resource_name: "Dryos workspaces",
    resource_documentation: `${origin}/mcp`,
  };
}

export function metadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`;
}
