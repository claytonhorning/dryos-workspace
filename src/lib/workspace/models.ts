/**
 * The models the chat offers, and what each one's request may carry.
 *
 * One list serving both sides: the composer's picker renders it and the
 * server-side agents validate against it, so the UI can never offer a model
 * the call would mangle and a request can never smuggle in an arbitrary
 * string as a model id. The per-model flags exist because the request shape
 * is not uniform — `output_config.effort` is a 400 on Haiku 4.5, adaptive
 * thinking does not exist there either, and the server-side refusal fallback
 * is an Opus 5 / Fable 5 affordance — so what to send is a fact about the
 * model, recorded here rather than re-derived at each call site.
 */

export interface ChatModel {
  id: string;
  name: string;
  blurb: string;
  /** Whether `output_config.effort` is accepted (a 400 where it is not). */
  effort: boolean;
  /** Whether adaptive thinking exists; absent, the param is omitted entirely. */
  adaptive: boolean;
  /** Whether the server-side refusal fallback rides along. */
  fallback: boolean;
}

export const CHAT_MODELS: ChatModel[] = [
  {
    id: "claude-fable-5",
    name: "Fable 5",
    blurb: "For your toughest challenges",
    effort: true,
    adaptive: true,
    fallback: true,
  },
  {
    id: "claude-opus-5",
    name: "Opus 5",
    blurb: "For complex tasks",
    effort: true,
    adaptive: true,
    fallback: true,
  },
  {
    id: "claude-sonnet-5",
    name: "Sonnet 5",
    blurb: "Most efficient for everyday tasks",
    effort: true,
    adaptive: true,
    fallback: false,
  },
  {
    id: "claude-haiku-4-5",
    name: "Haiku 4.5",
    blurb: "Fastest for quick answers",
    effort: false,
    adaptive: false,
    fallback: false,
  },
];

export const DEFAULT_CHAT_MODEL = "claude-opus-5";

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

/** The named model, or the default — never whatever string arrived. */
export function chatModel(id?: string): ChatModel {
  return (
    CHAT_MODELS.find((m) => m.id === id) ??
    CHAT_MODELS.find((m) => m.id === DEFAULT_CHAT_MODEL)!
  );
}

/** A valid effort, or the API's own default. */
export function effortOf(v?: string): Effort {
  return (EFFORTS as readonly string[]).includes(v ?? "")
    ? (v as Effort)
    : "high";
}
