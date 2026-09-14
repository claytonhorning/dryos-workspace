import { originOf, resourceMetadata } from "@/lib/workspace/mcpAuth";

/**
 * The workspace MCP server's protected-resource metadata, at the root
 * address. RFC 9728 puts it under the resource's path too (the sibling
 * route); clients try one or the other, so both answer the same.
 */
export function GET(req: Request) {
  return Response.json(resourceMetadata(originOf(req)), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" },
  });
}
