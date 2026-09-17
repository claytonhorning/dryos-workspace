import { CodeBlock } from "@/components/CodeBlock";
import { formatStars, repoStats } from "@/lib/github";

/**
 * Clone the starter, point it at the MCP server, run it anywhere. The star
 * button is GitHub's own idiom — a mark, "Star", and the count in a second
 * cell — because that is the shape people already read as "this is a repo".
 *
 * Renders nothing until the repo is public (see `repoStats`).
 */
export async function GitHubClone({ className }: { className?: string }) {
  const repo = await repoStats();
  if (!repo) return null;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">Build it on your own infrastructure</h3>
          <p className="mt-1 text-[13.5px] text-muted">
            The workspace is open source. Clone it, point it at the MCP server, deploy it
            anywhere — your stack, the same live data.
          </p>
        </div>
        <a
          href={repo.url}
          target="_blank"
          rel="noopener"
          aria-label={`${repo.repo} on GitHub, ${repo.stars} stars`}
          className="inline-flex h-8 shrink-0 items-stretch overflow-hidden rounded-md border border-line-strong text-[12.5px] font-medium text-ink"
        >
          <span className="flex items-center gap-1.5 bg-surface-2 px-2.5 hover:bg-surface">
            <GitHubMark />
            <StarGlyph />
            Star
          </span>
          <span className="flex items-center border-l border-line-strong bg-surface px-2.5 font-mono tabular-nums hover:text-accent">
            {formatStars(repo.stars)}
          </span>
        </a>
      </div>
      <CodeBlock code={repo.clone} title={repo.repo} className="mt-3" wrap />
    </div>
  );
}

function GitHubMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function StarGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden fill="currentColor" className="text-faint">
      <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z" />
    </svg>
  );
}
