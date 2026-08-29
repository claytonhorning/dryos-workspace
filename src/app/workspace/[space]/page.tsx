import { redirect } from "next/navigation";
import { getSpace, spaceOfPage } from "@/lib/workspace/spaces";
import { SpaceView } from "./SpaceView";

export const dynamic = "force-dynamic";

/**
 * The workspace itself: its pages, as thumbnails.
 *
 * Resolved on the server first so an old link still lands somewhere sensible —
 * this segment used to be a page id, and those were shared and bookmarked before
 * workspaces existed. Recognising one costs a lookup and saves a dead end.
 */
export default async function SpacePage({
  params,
}: {
  params: Promise<{ space: string }>;
}) {
  const { space } = await params;

  if (await getSpace(space)) return <SpaceView spaceId={space} />;

  const owner = await spaceOfPage(space);
  if (owner) redirect(`/workspace/${owner.id}/${space}`);

  redirect("/workspace");
}
