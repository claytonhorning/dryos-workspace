"use client";

import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { Select } from "@/components/Select";
import { CHOOSABLE, useDomain } from "@/lib/domain";
import { AccountButton } from "./AccountButton";
import { TimeSelect } from "./TimeSelect";
import { USAGE_METER, UsageDock } from "@/components/workspace/UsageDock";
import { MobileStrip, Shell } from "./shared";

/**
 * The bar inside the product.
 *
 * The left edge belongs to the sidebar now — the mark, the domain, the two
 * destinations — so up here is only what is about the session: what you are
 * spending, which clock the data reads in, who you are. Below `md` there is
 * no sidebar, so the mark and a compact domain picker step in at the left
 * and the strip underneath carries the destinations.
 */
export function AppNav({ pathname }: { pathname: string }) {
  const { domain, setDomain, ready } = useDomain();
  return (
    <Shell
      strip={
        <MobileStrip
          links={[
            { href: "/workspace", label: "Workspaces" },
            { href: "/docs", label: "API" },
          ]}
        />
      }
    >
      <div className="flex items-center gap-3 md:hidden">
        <Link href="/workspace" className="flex items-center">
          <Wordmark />
        </Link>
        {ready && domain && (
          <Select
            value={domain}
            onChange={setDomain}
            options={CHOOSABLE.map((s) => ({ value: s.id, label: s.label }))}
            size="sm"
            aria-label="Domain"
          />
        )}
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        {/*
          Scoped to the workspace when the route is one — /workspace/{id} is
          the workspace's own list page — and to the whole account elsewhere.
        */}
        {USAGE_METER && (
          <UsageDock
            placement="nav"
            spaceId={pathname.match(/^\/workspace\/([^/]+)$/)?.[1]}
          />
        )}
        {/* Which clock the data reads in — source time, or a zone of yours. */}
        <TimeSelect />
        <AccountButton />
      </div>
    </Shell>
  );
}
