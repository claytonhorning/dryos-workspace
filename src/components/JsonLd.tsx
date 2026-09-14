/**
 * Structured data for search engines and the crawlers that feed models.
 * Rendered as a plain script in the server HTML, where every crawler reads
 * it; `<` is escaped so a string in the data can never close the tag.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
