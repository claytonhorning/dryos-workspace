import { ImageResponse } from "next/og";

/**
 * The card a link unfurls into, drawn rather than captured: a screenshot
 * would need retaking in two themes whenever the page changed, and a card
 * of words says what the link is at thumbnail size. Fixed to the dark
 * ground, because an unfurl has no theme to follow.
 */
export const OG_SIZE = { width: 1200, height: 630 };

export function ogCard({ eyebrow, title, footer }: { eyebrow: string; title: string; footer: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#0a0d12",
          color: "#e8ecf1",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 44, fontWeight: 800, letterSpacing: -2 }}>dryos</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 4, color: "#c6f24e", textTransform: "uppercase" }}>
            {eyebrow}
          </div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 64, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>
            {title}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#8b95a3", fontFamily: "monospace" }}>{footer}</div>
      </div>
    ),
    OG_SIZE,
  );
}
