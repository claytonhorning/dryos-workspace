import { OG_SIZE, ogCard } from "@/lib/ogCard";

export const alt = "Dryos — live US power market data for dashboards, APIs and AI agents";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({
    eyebrow: "ERCOT · MISO · PJM · SPP · CAISO · NYISO · ISO-NE",
    title: "Live US power market data, for dashboards, APIs and AI agents",
    footer: "dryos.ai",
  });
}
