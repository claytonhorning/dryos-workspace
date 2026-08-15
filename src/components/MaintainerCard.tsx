import Image from "next/image";
import { initials, type Maintainer } from "@/lib/maintainers";

/**
 * Who is accountable for this feed.
 *
 * Sits under the CTA rather than in the page body on purpose: the claim is that
 * you are buying from a person rather than a vendor, so the person belongs next
 * to the buying decision.
 */
export function MaintainerCard({ maintainer }: { maintainer: Maintainer }) {
  return (
    <div className="mt-3 rounded-lg border border-line bg-surface p-5">
      <div className="font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
        Maintained by
      </div>

      <div className="mt-3.5 flex items-start gap-3.5">
        {maintainer.photo ? (
          <Image
            src={maintainer.photo}
            alt={maintainer.name}
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 rounded-full border border-line-strong object-cover"
          />
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-2 text-[15px] font-semibold text-muted">
            {initials(maintainer.name)}
          </span>
        )}

        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold text-ink">{maintainer.name}</div>
          <div className="mt-0.5 font-mono text-[12px] text-faint">@{maintainer.handle}</div>
          <div className="mt-1.5 text-[12.5px] leading-snug text-muted">
            {maintainer.title}
          </div>
        </div>
      </div>

      <p className="mt-3.5 text-[13px] leading-relaxed text-muted">{maintainer.bio}</p>

      <dl className="mt-4 space-y-1.5 border-t border-line pt-3.5">
        <Row label="Location" value={maintainer.location} />
        <Row label="Operating since" value={maintainer.since} />
      </dl>

      {maintainer.contact && (
        <a
          href={maintainer.contact}
          className="mt-3.5 block text-[13px] text-accent underline-offset-4 hover:underline"
        >
          Ask {maintainer.name.split(" ")[0]} about this dataset →
        </a>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-mono text-[11px] tracking-[0.08em] text-faint uppercase">
        {label}
      </dt>
      <dd className="text-[12.5px] text-muted">{value}</dd>
    </div>
  );
}
