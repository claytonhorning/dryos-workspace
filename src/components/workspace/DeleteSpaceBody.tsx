import type { AppSummary } from "@/lib/workspace/types";

/**
 * What deleting a workspace takes with it, named and counted.
 *
 * A page belongs to exactly one workspace, but a filing bug once put pages in
 * two, and `deleteSpace` spares a page another workspace still lists. So the
 * sentence splits the same way the delete does: the pages that go, then the
 * pages that stay where else they are filed. The count of the first is the
 * part someone checks before pressing the red button.
 */
export function DeleteSpaceBody({
  pageList,
  shared = [],
}: {
  pageList: AppSummary[];
  shared?: string[];
}) {
  const kept = new Set(shared);
  const going = pageList.filter((p) => !kept.has(p.id));
  const staying = pageList.filter((p) => kept.has(p.id));
  const n = (k: number) => `${k} ${k === 1 ? "page" : "pages"}`;

  if (pageList.length === 0) {
    return <p className="text-[13.5px] leading-relaxed text-muted">This workspace is empty.</p>;
  }
  return (
    <>
      {going.length > 0 && (
        <>
          <p className="text-[13.5px] leading-relaxed text-muted">
            {staying.length ? "" : "Its "}
            <strong className="text-ink">{n(going.length)}</strong> go with it, along with every
            change recorded on them:
          </p>
          <Names pages={going} />
        </>
      )}
      {staying.length > 0 && (
        <>
          <p className={`text-[13.5px] leading-relaxed text-muted ${going.length ? "mt-4" : ""}`}>
            <strong className="text-ink">{n(staying.length)}</strong> also filed in another
            workspace {staying.length === 1 ? "stays" : "stay"} there:
          </p>
          <Names pages={staying} />
        </>
      )}
    </>
  );
}

function Names({ pages }: { pages: AppSummary[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-1">
      {pages.map((p) => (
        <li key={p.id} className="font-mono text-[12px] text-faint">
          · {p.name}
        </li>
      ))}
    </ul>
  );
}
