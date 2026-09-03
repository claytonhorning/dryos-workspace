import type { MetadataRoute } from "next";

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
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/deck/", "/api/", "/auth/", "/login"],
    },
  };
}
