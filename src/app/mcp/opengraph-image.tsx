import { MCP_URL } from "@/lib/apiDocs";
import { OG_SIZE, ogCard } from "@/lib/ogCard";

export const alt = "Dryos MCP server — live US power market data for AI agents";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({
    eyebrow: "MCP server · no key",
    title: "Live US power market data, as tools for your agent",
    footer: MCP_URL,
  });
}
