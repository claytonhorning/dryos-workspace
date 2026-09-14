import type { CommunitySpace } from "./communitySpaces";

/**
 * Make a workspace of your own out of a community one: the same name and
 * domain, and a copy of every page in its order. Answers where the copy
 * opens — its first page, launched, since those pages have something to see.
 *
 * Each page is copied by the pages route's `community` branch, which takes the
 * manifest and composes it fresh; the publisher's source and history stay
 * theirs. Nothing here runs until somebody asks for the copy.
 */
export async function copyCommunitySpace(space: CommunitySpace): Promise<string> {
  const json = { "content-type": "application/json" };
  const res = await fetch("/api/workspace/spaces", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ name: space.name, domain: space.domain }),
  });
  const made = await res.json();
  if (!res.ok || !made.space) throw new Error(made.error ?? "Could not make the workspace.");

  let first: string | undefined;
  for (const p of space.pages) {
    const { page } = await fetch(`/api/workspace/spaces/${made.space.id}/pages`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ community: p.id }),
    }).then((r) => r.json());
    first ??= page?.id;
  }
  return `/workspace/${made.space.id}${first ? `/${first}` : ""}`;
}
