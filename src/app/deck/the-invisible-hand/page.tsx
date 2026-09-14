import type { Metadata } from "next";
import { Deck } from "@/components/deck/Deck";
import { LIVE_SCHEMA, SCHEMAS } from "@/lib/workspace/catalog";

/**
 * The pitch deck, at an address nothing links to.
 *
 * Not behind the login — the people it is for do not have accounts — so the
 * secrecy is the URL and a noindex. Anyone handed the link can read it, which
 * is the point; nobody browsing can find it, which is the other point.
 */
export const metadata: Metadata = {
  title: { absolute: "Dryos — the deck" },
  robots: { index: false, follow: false, nocache: true },
};

export default function DeckPage() {
  const live = SCHEMAS.filter((s) => s.availability === "live");
  return (
    <Deck
      facts={{
        streams: live.length,
        domains: new Set(live.map((s) => s.path[0])).size,
        nodes: LIVE_SCHEMA.entities.count,
        cadence: LIVE_SCHEMA.cadence.label,
      }}
    />
  );
}
