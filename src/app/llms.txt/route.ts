import { agentInstructions } from "@/lib/apiDocs";

/**
 * The API as an agent reads it, at the address agents look for. Plain text
 * built from the same routes and catalogue the developers page draws, so an
 * agent pointed here and a person reading that page are told the same thing.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(agentInstructions(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
