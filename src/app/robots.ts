import type { MetadataRoute } from "next";
import { SITE } from "@/lib/apiDocs";

/**
 * Crawlers are told to stay out of `/deck/` by prefix, deliberately not by
 * full path: robots.txt is public, and a file that names the secret address
 * is a signpost to it. The page itself also carries `noindex`, which is the
 * belt to this brace — a crawler that honours the disallow never reads the
 * page, and one that ignores it is told on arrival not to index.
 *
 * Login, auth callbacks and the API are listed for the ordinary reason:
 * there is nothing on them to index.
 */
const DISALLOW = ["/deck/", "/api/", "/auth/", "/login"];

/**
 * The model crawlers, welcomed by name. `*` already lets them in; naming
 * them says so to anyone auditing the file, and outlives a later blanket
 * rule written for some other bot. A crawler that matches a named group
 * ignores `*` entirely, so each group repeats the disallows.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Amazonbot",
  "meta-externalagent",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: DISALLOW },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
