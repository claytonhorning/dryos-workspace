import { Hero } from "@/components/hero/Hero";
import { JsonLd } from "@/components/JsonLd";
import { ForAgents } from "@/components/landing/ForAgents";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { MCP_URL, ORG_DESCRIPTION, OPERATORS, PROFILES, PUBLIC_API, SITE } from "@/lib/apiDocs";
import type { Metadata } from "next";

export const metadata: Metadata = { alternates: { canonical: "/" } };
import { Domains } from "@/components/landing/Domains";
import { WhoWeAre } from "@/components/landing/WhoWeAre";

/**
 * One page a first-time visitor can follow top to bottom: what Dryos is, with
 * a try-it that answers a real question on live data (the hero); the three
 * domains; three steps; the MCP server for people who work through an agent;
 * three plans; who we are. Plain words throughout — the argument about data
 * vendors lives in the deck, not on the front door.
 */
export default function LandingPage() {
  return (
    <div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": `${SITE}/#org`,
              name: "Dryos",
              // The bare word belongs to Canon's camera operating system in
              // every index. What tells two entities of one name apart is a
              // description and a set of corroborating profiles, not a
              // louder claim — see `PROFILES`.
              alternateName: "Dryos AI",
              description: ORG_DESCRIPTION,
              url: SITE,
              logo: `${SITE}/web-app-manifest-512x512.png`,
              ...(PROFILES.length ? { sameAs: PROFILES } : {}),
            },
            {
              "@type": "WebSite",
              name: "Dryos",
              url: SITE,
              publisher: { "@id": `${SITE}/#org` },
            },
            {
              "@type": "WebPage",
              "@id": `${SITE}/#webpage`,
              url: SITE,
              name: "Dryos: a data marketplace for energy, weather and property",
              description: ORG_DESCRIPTION,
              isPartOf: { "@id": `${SITE}/#org` },
            },
            {
              "@type": "Dataset",
              name: "Dryos US power market data",
              description: `Real-time and day-ahead electricity prices, load, generation and forecasts from ${OPERATORS.join(", ")}, with weather and building permits, collected live from each source and reconciled against it.`,
              url: SITE,
              creator: { "@id": `${SITE}/#org` },
              isAccessibleForFree: true,
              keywords: ["electricity prices", "LMP", "power markets", ...OPERATORS],
              distribution: [
                { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: `${PUBLIC_API}/v1/datasets` },
                { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: MCP_URL, name: "MCP server" },
              ],
            },
          ],
        }}
      />
      <Hero />
      <Domains />
      <HowItWorks />
      <ForAgents />
      <WhoWeAre />
    </div>
  );
}
