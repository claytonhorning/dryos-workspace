import { asBearer, userOfToken } from "@/lib/supabase/server";
import { metadataUrl, originOf } from "@/lib/workspace/mcpAuth";
import { INSTRUCTIONS, TOOLS, ToolError } from "@/lib/workspace/mcpTools";

/**
 * The workspace MCP server: an agent, signed in as a Dryos user, building
 * workspaces in that user's account.
 *
 * A second server rather than tools on the data server at api.dryos.ai/mcp,
 * because authorization is per server: once a server asks for a login, a
 * client asks for it before any tool works, and the data server has to stay
 * open to anyone. The two are used together — find the data there, build
 * with it here.
 *
 * Streamable HTTP, stateless, answering JSON: every call is one request with
 * its token, so nothing lives between requests and a Vercel function can
 * serve it. The JSON-RPC surface an MCP client needs from a tools-only
 * server is five methods, written out here rather than pulled in as an SDK.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const ok = (id: Message["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Message["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** The challenge that sends a client to sign in: where the metadata is, and why it was refused. */
function unauthorized(origin: string, reason?: string) {
  const challenge = `Bearer resource_metadata="${metadataUrl(origin)}"${reason ? `, error="${reason}"` : ""}`;
  return Response.json(
    { error: "unauthorized", error_description: "Sign in with your Dryos account to use workspace tools." },
    { status: 401, headers: { ...CORS, "WWW-Authenticate": challenge } },
  );
}

async function handle(msg: Message, origin: string) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return fail(msg?.id, -32600, "Invalid request");
  }
  // A notification asks for no answer.
  if (msg.id === undefined) return null;
  const { id, method, params = {} } = msg;

  switch (method) {
    case "initialize": {
      const asked = String(params.protocolVersion ?? "");
      return ok(id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "dryos-workspaces", title: "Dryos workspaces", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: t.annotations,
        })),
      });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${String(params.name)}`);
      try {
        const result = await tool.run((params.arguments ?? {}) as Record<string, unknown>, { origin });
        return ok(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      } catch (e) {
        // A refusal is an answer the agent can act on, not a protocol error.
        const text = e instanceof ToolError ? e.message : `That did not work: ${(e as Error).message}`;
        return ok(id, { content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

export async function POST(req: Request) {
  const origin = originOf(req);
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return unauthorized(origin);
  const user = await userOfToken(token);
  if (!user) return unauthorized(origin, "invalid_token");

  let body: Message | Message[];
  try {
    body = await req.json();
  } catch {
    return Response.json(fail(null, -32700, "Parse error"), { status: 400, headers: CORS });
  }
  const batch = Array.isArray(body) ? body : [body];
  // Every store call inside runs as the token's user, RLS and all.
  const replies = (await asBearer(token, () => Promise.all(batch.map((m) => handle(m, origin))))).filter(
    Boolean,
  );
  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return Response.json(Array.isArray(body) ? replies : replies[0], { headers: CORS });
}

/** No server-to-client stream: every answer rides on its own request. */
export function GET() {
  return new Response("This MCP server answers POST only.", { status: 405, headers: { ...CORS, Allow: "POST" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
