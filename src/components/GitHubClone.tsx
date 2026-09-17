import { CodeBlock } from "@/components/CodeBlock";
import { GitHubGlyph } from "@/components/Glyphs";
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
            <GitHubGlyph size={14} />
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


function StarGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden fill="currentColor" className="text-faint">
      <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z" />
    </svg>
  );
}
