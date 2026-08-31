/**
 * The two card-corner actions, drawn rather than lettered — an × means
 * "close" everywhere else here, and paired the two read as icons.
 */

/** A bin. */
export function TrashGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.5 3.5h9M5.5 3.5V2.4a.9.9 0 0 1 .9-.9h1.2a.9.9 0 0 1 .9.9v1.1M3.6 3.5l.5 7.6a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.5-7.6"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 6v3.5M8 6v3.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A pencil. */
export function PencilGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M9.4 2.1a1.3 1.3 0 0 1 1.9 0l.6.6a1.3 1.3 0 0 1 0 1.9L5.3 11.2l-3 .5.5-3z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M8.6 3l2.4 2.4"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
