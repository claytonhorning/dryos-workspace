import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { MCP_URL, PUBLIC_API } from "@/lib/apiDocs";
import { GROUPS, groupHref, liveStreams, streamsIn } from "@/lib/dataPages";

/**
 * The foot of every public page.
 *
 * It exists for two readers at once. A person who has read to the bottom of a
 * stream page wants the next stream, and the operator list is the fastest way
 * to it. A crawler wants a path from any page to every other: without this,
 * the 134 stream pages are reachable only from their own operator's page and
 * the sitemap, which is a link graph one accident away from being a
 * collection of orphans.
 *
 * A server component with nothing but links in it, so all of it is in the
 * first HTML — and only on the public routes, because a launched workspace
 * page carries no chrome at all.
 */
export function SiteFooter() {
  const streams = liveStreams().length;
  return (
    <footer className="mt-20 border-t border-line bg-surface/40">
      <div className="mx-auto max-w-[1080px] px-6 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Wordmark />
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-muted">
              A marketplace for live energy, weather and property data. Maintainers collect
              it and are paid for it; you consume it.
            </p>
          </div>

          <nav aria-label="Data by operator">
            <h2 className="font-mono text-[10.5px] tracking-[0.14em] text-faint uppercase">
              Data
            </h2>
            <ul className="mt-3 space-y-1.5">
              {GROUPS.map((g) => (
                <li key={g.id}>
                  <Link
                    href={groupHref(g)}
                    className="text-[13px] text-muted transition-colors hover:text-ink"
                  >
                    {g.label}{" "}
                    <span className="font-mono text-[11px] text-faint">{streamsIn(g).length}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Build with Dryos">
            <h2 className="font-mono text-[10.5px] tracking-[0.14em] text-faint uppercase">
              Build
            </h2>
            <ul className="mt-3 space-y-1.5">
              {[
                { href: "/data", label: `All ${streams} streams` },
                { href: "/docs", label: "API reference" },
                { href: "/mcp", label: "MCP server" },
                { href: "/workspace", label: "Workspace" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-[13px] text-muted transition-colors hover:text-ink"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href="/llms.txt"
                  className="text-[13px] text-muted transition-colors hover:text-ink"
                >
                  /llms.txt
                </a>
              </li>
            </ul>
          </nav>

          <nav aria-label="About Dryos">
            <h2 className="font-mono text-[10.5px] tracking-[0.14em] text-faint uppercase">
              About
            </h2>
            <ul className="mt-3 space-y-1.5">
              <li>
                <Link
                  href="/maintainers"
                  className="text-[13px] text-muted transition-colors hover:text-ink"
                >
                  For maintainers
                </Link>
              </li>
              <li>
                <Link href="/#pricing" className="text-[13px] text-muted transition-colors hover:text-ink">
                  Pricing
                </Link>
              </li>
              <li>
                <a
                  href={PUBLIC_API}
                  className="text-[13px] text-muted transition-colors hover:text-ink"
                  rel="noopener"
                >
                  api.dryos.ai
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <p className="mt-10 border-t border-line pt-6 text-[12px] text-faint">
          Every stream is pulled straight from the organisation that publishes it, with no
          reseller in between. Timestamps are UTC; null means the source did not report it.
          The MCP server is at{" "}
          <span className="font-mono">{MCP_URL}</span>.
        </p>
      </div>
    </footer>
  );
}
