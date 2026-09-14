/**
 * The questions the landing page's try-it offers. One per published slug
 * (`community.ts`), so what the demo draws and what the new workspace opens
 * on are the same thing. Shared by the landing demo and `/workspace/start`,
 * which reads the domain and name from here rather than from the URL — a
 * link can only name a recipe, never make up a workspace.
 */
export interface TryOption {
  recipe: string;
  domain: "Energy" | "Weather" | "Property";
  /** What the visitor "asks". */
  prompt: string;
  /** What the assistant answers while it builds. */
  reply: string;
  /** The tile's title. */
  title: string;
  /** The workspace it opens as. */
  workspace: string;
}

export const TRY_OPTIONS: TryOption[] = [
  {
    recipe: "hub-prices",
    domain: "Energy",
    prompt: "What is Texas power costing today?",
    reply: "Charting real-time prices at ERCOT's trading hubs, hour by hour, for the last day.",
    title: "ERCOT hub prices",
    workspace: "Texas power prices",
  },
  {
    recipe: "fuel-mix",
    domain: "Energy",
    prompt: "What is powering the Texas grid right now?",
    reply: "Stacking ERCOT's generation by fuel over the last day.",
    title: "ERCOT generation by fuel",
    workspace: "Texas grid",
  },
  {
    recipe: "zone-weather",
    domain: "Weather",
    prompt: "How hot will it get in Austin, Dallas and Houston?",
    reply: "Pulling the hourly temperature forecast for three Texas regions.",
    title: "Temperature forecast",
    workspace: "Texas weather",
  },
  {
    recipe: "austin-solar",
    domain: "Property",
    prompt: "Are more Austin homes going solar?",
    reply: "Counting Austin's rooftop solar and home battery permits, week by week.",
    title: "Austin solar & battery permits",
    workspace: "Austin solar",
  },
];

export function tryOption(recipe: string | null): TryOption | undefined {
  return TRY_OPTIONS.find((o) => o.recipe === recipe);
}
