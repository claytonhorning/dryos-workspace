import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API — Dryos",
  description:
    "Query every Dryos stream directly: routes, parameters, examples, and instructions for AI agents.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
