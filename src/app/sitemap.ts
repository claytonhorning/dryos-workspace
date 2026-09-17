import type { MetadataRoute } from "next";
import { SITE } from "@/lib/apiDocs";
import { GROUPS, groupHref, liveStreams, streamHref } from "@/lib/dataPages";

/**
 * The public pages, and only those: the workspace is behind a login and the
 * deck is deliberately unlisted. `/llms.txt` is listed because it is the page
 * an agent is meant to read.
 *
 * The catalogue's own pages — the index, one per operator, one per stream —
 * are derived rather than listed, so a stream added to the catalogue is in
 * the sitemap the moment it has a page, and one removed cannot leave a 404
 * behind in here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/mcp`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/data`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/docs`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    // An operator's page carries a live figure and its stream list, so it is
    // worth recrawling more often than the prose pages around it.
    ...GROUPS.map((g) => ({
      url: `${SITE}${groupHref(g)}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...liveStreams().map((s) => ({
      url: `${SITE}${streamHref(s)}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    { url: `${SITE}/llms.txt`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/maintainers`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
}
