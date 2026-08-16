/**
 * Who stands behind the feed.
 *
 * Sits under the CTA rather than in the page body on purpose: the claim is that
 * someone is accountable for this data, so it belongs next to the buying
 * decision. Kept to the operating entity — a named person goes here once there
 * is a maintainer who is not us.
 */
export function MaintainerCard() {
  return (
    <div className="mt-3 rounded-lg border border-line bg-surface px-5 py-4">
      <div className="font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
        Maintained by
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-2 text-[11px] font-semibold text-muted">
          D
        </span>
        <span className="text-[14px] font-medium text-ink">Dryos</span>
      </div>
    </div>
  );
}
