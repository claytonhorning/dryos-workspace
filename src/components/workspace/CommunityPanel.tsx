"use client";

import Image from "next/image";
import { cx } from "@/components/ui";
import { ALL } from "@/lib/domain";
import { BUILDERS, MAINTAINERS } from "@/lib/people";

/**
 * Who is behind what.
 *
 * Two roles, and the difference between them is the shape of the whole product:
 * a **maintainer** is a named expert accountable for one source staying correct,
 * a **builder** makes pages out of what they publish. The shelf says which,
 * in words, rather than leaving two lists to be inferred from.
 *
 * The roster is `lib/people.ts` — placeholders today, shared with the hero so
 * the landing page and the workspace never name different people for the
 * same source. It used to be derived (every schema's `maintainer`, every
 * revision's author), which was honest and unreadable: thirty-four rows of
 * "Dryos" is a count, not a community.
 */
export function CommunityPanel({ domain }: { domain?: string }) {
  // The domain's own maintainer, or everyone for the blend. Builders are
  // not scoped: a page is built from whatever it draws.
  const maintainers =
    domain && domain !== ALL ? MAINTAINERS.filter((m) => m.domain === domain) : MAINTAINERS;
  return (
    <div className="w-full rounded-lg border border-line bg-surface p-4 lg:w-[300px]">
      <p className="font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
        Community
      </p>
      <p className="mt-1.5 mb-3 text-[11.5px] leading-relaxed text-muted">
        Each source has one named expert keeping it right. The pages built on
        top of it come from everyone else.
      </p>

      <Row
        label="Data maintained by"
        note={`${maintainers.length} ${maintainers.length === 1 ? "source" : "sources"}`}
        people={maintainers.map((m) => ({
          name: m.name,
          detail: m.domain,
          src: m.src,
          initials: m.initials,
        }))}
      />

      <div className="my-3 border-t border-line" />

      <Row
        label="Component contributors"
        note={`${BUILDERS.length} people`}
        people={BUILDERS.map((b) => ({
          name: b.name,
          detail: `${b.pages} ${b.pages === 1 ? "contribution" : "contributions"}`,
          initials: b.initials,
        }))}
      />
    </div>
  );
}

function Row({
  label,
  note,
  people,
}: {
  label: string;
  note: string;
  people: { name: string; detail: string; src?: string; initials: string }[];
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[9.5px] tracking-[0.13em] text-faint uppercase">
          {label}
        </span>
        <span className="font-mono text-[9.5px] text-muted">{note}</span>
      </div>

      <ul className="mt-2 flex flex-col gap-1.5">
        {people.map((p) => (
          <li key={p.name} className="flex items-center gap-2">
            <Avatar src={p.src} initials={p.initials} />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{p.name}</span>
            <span className="shrink-0 truncate font-mono text-[9.5px] text-faint">
              {p.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The portrait when there is one; initials in a ring when there is not. */
function Avatar({ src, initials }: { src?: string; initials: string }) {
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={20}
        height={20}
        className="h-5 w-5 shrink-0 rounded-full border border-line-strong object-cover"
      />
    );
  }
  return (
    <span
      className={cx(
        "grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line-strong",
        "bg-surface-2 font-mono text-[8px] text-muted uppercase",
      )}
    >
      {initials}
    </span>
  );
}
