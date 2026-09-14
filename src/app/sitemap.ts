import type { MetadataRoute } from "next";
import { SITE } from "@/lib/apiDocs";

/**
 * The public pages, and only those: the workspace is behind a login and the
 * deck is deliberately unlisted. `/llms.txt` is listed because it is the page
 * an agent is meant to read.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/mcp`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/docs`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/llms.txt`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/maintainers`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
}
