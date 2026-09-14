import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API reference — live US power market data",
  description:
    "Query every Dryos stream directly — ERCOT, MISO, PJM, SPP, CAISO, NYISO and ISO-NE prices, load and generation, weather and permits: routes, parameters, examples, the MCP server, and instructions for AI agents.",
  alternates: { canonical: "/docs" },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
