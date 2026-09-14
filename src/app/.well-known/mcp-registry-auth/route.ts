/**
 * The MCP Registry's proof that dryos.ai publishes `ai.dryos/*`: one line,
 * `v=MCPv1; k=ed25519; p=<public key>`, read from `MCP_REGISTRY_AUTH` so the
 * key lives in the Vercel project rather than in the repo. Unset, the file
 * does not exist, which is the honest answer to a registry asking.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const proof = process.env.MCP_REGISTRY_AUTH?.trim();
  if (!proof) return new Response("Not found", { status: 404 });
  return new Response(`${proof}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
