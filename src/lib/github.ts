import { GITHUB_REPO } from "@/lib/apiDocs";

export interface RepoStats {
  repo: string;
  url: string;
  stars: number;
  clone: string;
}

/**
 * The repo's public face, or null when there is none to show — private, not
 * created yet, renamed, or GitHub not answering. Null hides the clone block
 * entirely: a star count of a repo nobody can open is a link to a 404.
 *
 * Cached an hour through the fetch cache, so a page render never waits on
 * GitHub and the unauthenticated limit (60 an hour per address) is never
 * near. `GITHUB_TOKEN`, when set, lifts that limit.
 */
export async function repoStats(repo = GITHUB_REPO): Promise<RepoStats | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        Accept: "application/vnd.github+json",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { private?: boolean; stargazers_count?: number; html_url?: string };
    if (body.private || !body.html_url) return null;
    return {
      repo,
      url: body.html_url,
      stars: body.stargazers_count ?? 0,
      clone: `git clone ${body.html_url}.git`,
    };
  } catch {
    return null;
  }
}

/** 950 → "950", 1234 → "1.2k", 12400 → "12k" — GitHub's own rounding. */
export function formatStars(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}k`;
}
