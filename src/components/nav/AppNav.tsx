"use client";

import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { AccountButton } from "./AccountButton";
import { TimeSelect } from "./TimeSelect";
import { UsageDock } from "@/components/workspace/UsageDock";
import { MobileStrip, NavLink, Shell } from "./shared";

/**
 * The nav inside the product.
 *
 * One tab. The product is the workspaces; the catalogue is browsed from
 * inside them (the explorer), so a Data destination out here was a second
 * copy of the same shelf, and Docs went with the marketing detour it
 * belonged to. What replaces the CTA is the account, and beside it the
 * usage chip — always in the bar, never floating over a page.
 *
 * The wordmark still goes home, so the argument is reachable, just not in
 * the way.
 */
export function AppNav({ pathname }: { pathname: string }) {
  return (
    <Shell
      strip={
        <MobileStrip
          links={[
            { href: "/workspace", label: "Workspaces" },
            { href: "/usage", label: "Usage" },
          ]}
        />
      }
    >
      <Link href="/" className="mr-5 flex items-center gap-2.5">
        <Wordmark />
      </Link>

      <NavLink
        href="/workspace"
        label="Workspaces"
        active={pathname.startsWith("/workspace")}
      />

      <div className="ml-auto flex items-center gap-2.5">
        {/*
          Scoped to the workspace when the route is one — /workspace/{id} is
          the workspace's own list page — and to the whole account elsewhere.
        */}
        <UsageDock
          placement="nav"
          spaceId={pathname.match(/^\/workspace\/([^/]+)$/)?.[1]}
        />
        {/* Which clock the data reads in — source time, or a zone of yours. */}
        <TimeSelect />
        <AccountButton />
      </div>
    </Shell>
  );
}
