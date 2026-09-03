"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BillChart } from "@/components/landing/BillChart";
import { ThemedShot } from "@/components/landing/ThemedShot";
import { WireDemo } from "@/components/landing/WireDemo";
import { Wordmark } from "@/components/Logo";
import { cx } from "@/components/ui";

/**
 * One slide at a time, arrow keys to move, the slide number in the URL hash so
 * a link lands on the slide it was copied from. Rendering only the current
 * slide is deliberate: the bill chart and the wire demo are real components
 * with their own animations, and they should play when their slide arrives,
 * not once at load somewhere below the fold.
 */
export type Facts = {
  streams: number;
  domains: number;
  nodes: number;
  cadence: string;
};

type Slide = {
  kicker: string;
  title: ReactNode;
  body?: ReactNode;
  aside?: ReactNode;
  /** Stack the aside under the copy rather than beside it. */
  stacked?: boolean;
};

export function Deck({ facts }: { facts: Facts }) {
  const slides = build(facts);
  const [i, setI] = useState(0);
  const n = slides.length;

  const go = useCallback(
    (k: number) =>
      setI((cur) =>
        Math.min(n - 1, Math.max(0, typeof k === "number" ? k : cur)),
      ),
    [n],
  );

  useEffect(() => {
    const h = Number(window.location.hash.replace("#", ""));
    if (Number.isInteger(h) && h >= 1 && h <= n) setI(h - 1);
  }, [n]);

  useEffect(() => {
    window.history.replaceState(null, "", `#${i + 1}`);
  }, [i]);

  // A hash typed into the bar, or back/forward through ones already visited,
  // moves the deck the same way the arrow keys do.
  useEffect(() => {
    const on = () => {
      const h = Number(window.location.hash.replace("#", ""));
      if (Number.isInteger(h) && h >= 1 && h <= n) setI(h - 1);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, [n]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        setI((c) => Math.min(n - 1, c + 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setI((c) => Math.max(0, c - 1));
      } else if (e.key === "Home") setI(0);
      else if (e.key === "End") setI(n - 1);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [n]);

  const s = slides[i];

  return (
    <div className="flex min-h-[100svh] flex-col">
      <div
        key={i}
        className="dr-rise mx-auto flex w-full max-w-[1180px] flex-1 flex-col justify-center px-8 py-10 lg:px-12"
      >
        <div className="font-mono text-[11px] tracking-[0.16em] text-accent uppercase">
          {s.kicker}
        </div>
        <div
          className={cx(
            "mt-5 grid gap-10",
            Boolean(s.aside && !s.stacked) &&
              "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center",
          )}
        >
          <div>
            <h1 className="max-w-[20ch] text-[clamp(2rem,4.2vw,3.4rem)] leading-[1.04] font-semibold tracking-[-0.035em] text-balance text-ink">
              {s.title}
            </h1>
            {s.body && (
              <div className="mt-7 space-y-4 text-[16.5px] leading-[1.65] text-muted">
                {s.body}
              </div>
            )}
          </div>
          {s.aside && <div className="min-w-0">{s.aside}</div>}
        </div>
      </div>

      <div className="sticky bottom-0 flex items-center gap-4 border-t border-line bg-bg/85 px-6 py-3 backdrop-blur-md">
        <Wordmark />
        <span className="font-mono text-[11px] tracking-[0.1em] text-faint uppercase">
          the invisible hand · confidential
        </span>
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => go(i - 1)}
            disabled={i === 0}
            className="rounded-md border border-line px-2.5 py-1 font-mono text-[12px] text-muted disabled:opacity-30"
            aria-label="Previous slide"
          >
            ←
          </button>
          <span className="font-mono text-[12px] tabular-nums text-faint">
            {i + 1} / {n}
          </span>
          <button
            type="button"
            onClick={() => go(i + 1)}
            disabled={i === n - 1}
            className="rounded-md border border-line px-2.5 py-1 font-mono text-[12px] text-muted disabled:opacity-30"
            aria-label="Next slide"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Building blocks ────────────────────────────────────────────────────── */

function P({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cx("max-w-[60ch]", className)}>{children}</p>;
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="max-w-[62ch] space-y-2.5">
      {items.map((it, k) => (
        <li key={k} className="flex gap-3">
          <span className="mt-[11px] h-[3px] w-[3px] shrink-0 rounded-full bg-accent" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Stat({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-5 py-4">
      <div
        className={cx(
          "font-mono text-[30px] tabular-nums tracking-tight",
          accent ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[13px] text-muted">{label}</div>
    </div>
  );
}

function Cards({
  items,
}: {
  items: { title: string; body: string; dim?: boolean }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((c) => (
        <div
          key={c.title}
          className={cx(
            "rounded-lg border p-4",
            c.dim
              ? "border-dashed border-line bg-surface/50"
              : "border-line bg-surface",
          )}
        >
          <div className="text-[14px] font-semibold text-ink">{c.title}</div>
          <div className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {c.body}
          </div>
        </div>
      ))}
    </div>
  );
}

function Loop() {
  const steps = [
    "Maintainers claim sources",
    "Streams go live",
    "Buyers subscribe",
    "70% flows back",
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {steps.map((s, k) => (
        <div
          key={s}
          className="relative rounded-lg border border-accent-line bg-accent-dim/30 p-4"
        >
          <div className="font-mono text-[11px] text-accent">0{k + 1}</div>
          <div className="mt-1 text-[14px] font-semibold text-ink">{s}</div>
          <span
            aria-hidden
            className="absolute right-3 bottom-3 font-mono text-[13px] text-faint"
          >
            {k === 3 ? "↺" : "→"}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── The argument, in order ─────────────────────────────────────────────── */

function build(f: Facts): Slide[] {
  return [
    {
      kicker: "Dryos",
      title: "Do not repeat yourself.",
      body: (
        <>
          <P>
            A marketplace for public data, paid to the people who keep it
            correct.
          </P>
          <P className="text-faint">
            This page is not linked from anywhere. Please keep the address to
            yourself.
          </P>
        </>
      ),
    },
    {
      kicker: "The name",
      title: "Do not repeat yourself, applied to a whole industry.",
      body: (
        <>
          <P>
            DRY is one of the oldest rules in software: every piece of knowledge
            should live in exactly one place. Copy it and the copies drift, and
            a fix has to be made everywhere, forever. Engineers treat repeated
            code as a defect. The data industry runs on it.
          </P>
          <Cards
            items={[
              {
                title: "Repeated on the way in",
                body: "Every company that needs ERCOT prices writes the same parser, hits the same Central-time bug, and then pays a vendor who wrote it a third time and priced in the org chart around it.",
              },
              {
                title: "Repeated on the way out",
                body: "Every team builds its own dashboard of the same feed, faster than ever now that an agent does it, and none of it is shared. The cheaper a thing is to make, the more times it gets made.",
              },
            ]}
          />
          <P>
            Collect a source once, with one named person accountable for it.
            Build a component once, publish it, and let the next team drop it
            in. What that frees is the thing a company is actually for, without
            a vendor lock or a bill sized for somebody else&rsquo;s payroll: the
            stream is the unit, the data lands in their own warehouse, and the
            whole thing can be self-hosted.
          </P>
        </>
      ),
    },
    {
      kicker: "The problem, part one",
      title: "Public data is public. That was never the hard part.",
      body: (
        <>
          <P>
            Grid operators, weather services and counties publish almost
            everything worth building on. It arrives in the state they leave it.
          </P>
          <List
            items={[
              "ERCOT: zipped CSVs on a listing that keeps a few days, Central time, a repeated-hour flag on every report except one, forecasts republished hourly as new vintages.",
              "NWS: a pagination cursor that never says stop, a null that means two different things, units that change by station.",
              "Counties: one schema per office, spreadsheets and PDFs, the same parcel described three ways.",
            ]}
          />
          <P>Formatting, normalising and cleaning it is the whole job.</P>
        </>
      ),
    },
    {
      kicker: "The problem, part two",
      title: "Every vendor grew an org chart around one person.",
      body: (
        <>
          <P>
            Each started as somebody who understood a source. Then came sales,
            success, marketing, a lease and an executive floor, all on the
            invoice, all for one vertical. Illustrative shares; the proportions
            are the point.
          </P>
        </>
      ),
      aside: <BillChart />,
      stacked: true,
    },
    {
      kicker: "Why now",
      title: "Then AI made the dashboard free.",
      body: (
        <>
          <P>
            An agent builds a dashboard in an afternoon, so the value left the
            chart and moved to the feed underneath it. The only thing worth
            paying for is the person who keeps the feed correct.
          </P>
          <P>
            It also created a second waste. Everyone on a team now builds their
            own dashboard: the same feed, the same chart, four times, none of it
            shared. Cheap to make means expensive to repeat.
          </P>
        </>
      ),
    },
    {
      kicker: "The bet",
      title: "Collection is horizontal. Nobody has built it that way.",
      body: (
        <>
          <P>
            A vertical vendor builds a collector, a validator, hosting, billing
            and a sales team, then charges one industry for the lot. The next
            vertical over, another company builds the same five things. The data
            was public both times; the plumbing was paid for twice.
          </P>
          <P>
            Dryos builds the plumbing once. The pipeline that stages, validates
            and promotes an ERCOT report is the one a weather station goes
            through and the one a county roll will. The marginal cost of a new
            vertical is a maintainer.
          </P>
        </>
      ),
      aside: (
        <div className="grid grid-cols-2 gap-3">
          <Stat value="1" label="pipeline: stage, validate, promote" accent />
          <Stat
            value={String(f.streams)}
            label={`live streams across ${f.domains} domains`}
          />
          <Stat
            value="100%"
            label="checked against the source before promotion"
          />
          <Stat value="3" label="verticals: energy, weather, property next" />
        </div>
      ),
    },
    {
      kicker: "The product",
      title: "One pipeline, one meter, three ways out.",
      body: (
        <List
          items={[
            <>
              <b className="text-ink">Workspaces.</b> Screens a team arranges
              from typed components and published, wired groups. No code; a
              model only where a shape cannot reach.
            </>,
            <>
              <b className="text-ink">API and MCP.</b> The same streams for your
              own systems and your AI code companion.
            </>,
            <>
              <b className="text-ink">Warehouse delivery.</b> Streams shared
              into Snowflake or Databricks, where the customer&rsquo;s truth
              already lives.
            </>,
            <>
              <b className="text-ink">Maintainers own the source.</b> The person
              who collects a stream is named on it and answers for it. A
              question about data quality goes to them directly, not into a
              support queue, and the fix is their job. That is what their share
              of the subscription pays for.
            </>,
          ]}
        />
      ),
      aside: (
        <ThemedShot
          name="screen"
          alt="A workspace page on live ERCOT data"
          ratio="1440/760"
          sizes="50vw"
          className="rounded-lg border border-line shadow-2xl shadow-black/40"
        />
      ),
    },
    {
      kicker: "The product",
      title: "Build on what your team already built.",
      body: (
        <>
          <P>
            Somebody wires the map to the chart once and publishes it. It lands
            on every other page as one drop, already connected. Every change is
            stored as the sentence that asked for it, so a page has a history a
            colleague can read.
          </P>
          <P>
            Bring your own model key, Claude or OpenAI, on hosted and
            self-hosted alike, with no markup. What AI lands on is a typed
            component that compiles or is refused, so it still runs in a year.
          </P>
        </>
      ),
      aside: <WireDemo />,
    },
    {
      kicker: "Business model",
      title: "Streams, not queries. Flat, per month.",
      body: (
        <>
          <P>
            A stream is a thing somebody maintains, so it is the thing a
            customer subscribes to. It costs the same whether one screen watches
            it or fifty. The platform is a flat fee that covers the plumbing.
          </P>
          <P>
            70% of every stream&rsquo;s subscription goes to its maintainer.
            Usage survives only as an opt-in overage past a fair-use quota,
            capped by default.
          </P>
        </>
      ),
      aside: (
        <Cards
          items={[
            {
              title: "Free · $0",
              body: "1 workspace, 3 streams. The funnel and the proof.",
            },
            {
              title: "Team · $150/mo",
              body: "5 seats, 5 streams, $15 per extra. API and MCP within quota.",
            },
            {
              title: "Business · $500/mo",
              body: "20 seats, 15 streams, SSO, warehouse delivery, account manager.",
            },
            {
              title: "Self-hosted · $500/mo + $25/stream",
              body: "Their hardware, unlimited queries. Minimum 10 streams.",
            },
            {
              title: "Consultant",
              body: "A Team plan per client, their usage plus the consultant's margin.",
            },
            {
              title: "Predictability",
              body: "Annual commit 15 to 20% off. Prepaid twelve-month credit packs.",
            },
          ]}
        />
      ),
    },
    {
      kicker: "Business model",
      title: "Why this model wins the decade.",
      body: (
        <Cards
          items={[
            {
              title: "Recurring, and it expands on its own",
              body: "A customer adds streams, not seats. Every new question a team asks is another stream under subscription, so net retention runs above a hundred by construction.",
            },
            {
              title: "Structural margin",
              body: "Public data carries no licence cost. The maintainer's share is the only cost of goods and scales exactly with revenue; the platform fee is software margin on top.",
            },
            {
              title: "The supply side already exists",
              body: "The gig economy produced thousands of domain experts who know one source cold and would rather be paid for keeping it right than employed by a company built around it. Creators get 70% on every platform that kept them; so do maintainers.",
            },
            {
              title: "It matches how buyers buy now",
              body: "Procurement approves flat subscriptions and annual commits, finance forecasts them, and data teams already purchase per dataset. The seat is dying as agents replace users; the stream is the unit that survives that.",
            },
            {
              title: "AI is the demand, not the threat",
              body: "The dashboard was the product and it is free now. What is left to sell is the verified feed under it, and every agent that reads one over MCP is a subscriber that never sleeps.",
            },
            {
              title: "A moat that compounds",
              body: "Every month of reconciled history and every maintainer who claims a source makes the network harder to copy. A vertical vendor cannot go horizontal without dismantling the org chart it sells.",
            },
          ]}
        />
      ),
      stacked: true,
    },
    {
      kicker: "Distribution",
      title: "Deliver where the truth already lives.",
      body: (
        <>
          <P>
            Customers keep their source of truth in a warehouse and will not
            move it. So the stream goes to them: shared into Snowflake or
            Databricks, joined against their own tables with a line of SQL.
            &ldquo;Bring your own data&rdquo; stops being a feature we build.
          </P>
          <List
            items={[
              "Delta Sharing first: one open protocol that Snowflake, BigQuery, Spark and pandas all consume.",
              "Parquet drops to S3 or GCS with a manifest, for everyone else and for self-hosted.",
              "Native Snowflake sharing when a Snowflake customer requires it.",
              "Vintages are append-only, so a sync is an append; restatements upsert with the same discipline.",
            ]}
          />
        </>
      ),
    },
    {
      kicker: "Distribution",
      title: "Where we will not compete.",
      body: (
        <>
          <P>
            The warehouse marketplaces are where public-data resellers sell
            tables at enterprise prices. That is the org chart we are arguing
            against, on its own turf, under its own rules.
          </P>
          <List
            items={[
              "There, the table is the product. The maintainer, the verification and the workspace are invisible; only price and freshness show.",
              "A deep undercut reads as a bargain to some buyers and as unmaintained to the rest.",
              "The marketplace takes a cut, a third line on an invoice we said should have two.",
            ]}
          />
          <P>
            So: warehouse delivery for our own subscribers, a free sample
            listing as a lead magnet beside the expensive ones, and paid
            listings only when a buyer can purchase no other way.
          </P>
        </>
      ),
    },
    {
      kicker: "Go to market",
      title: "Land in energy, where the proof already exists.",
      body: (
        <List
          items={[
            <>
              <b className="text-ink">Energy first.</b> The full ERCOT public
              report catalogue is collected and reconciled against the source.
              Every buyer in that market can check our numbers against
              ERCOT&rsquo;s own files, and we invite them to.
            </>,
            <>
              <b className="text-ink">Weather live, property next.</b> Weather
              proves the pipeline is not an ERCOT pipeline. Property proves a
              vertical with no API at all can be maintained.
            </>,
            <>
              <b className="text-ink">Consultants as the channel.</b> They
              already build these dashboards for clients; a Team plan per client
              with their margin on top makes them a sales force with no quota.
            </>,
            <>
              <b className="text-ink">
                Account managers for the accounts that want one.
              </b>{" "}
              Mid and large companies have them; the point was never to remove
              the person, only to stop billing the feed for the floor they sit
              on.
            </>,
          ]}
        />
      ),
    },
    {
      kicker: "The flywheel",
      title:
        "Maintainers bring streams. Streams bring buyers. Buyers pay maintainers.",
      body: (
        <>
          <P>
            The 70% is not generosity, it is the recruitment budget. A
            maintainer who earns on every subscription claims the next source,
            and the shelf of components they publish is what a new buyer sees
            first.
          </P>
          <P>
            The roster today is honest about itself: every stream is
            Dryos-maintained. The first outside maintainer claiming a feed is
            the milestone that matters.
          </P>
        </>
      ),
      aside: <Loop />,
    },
    {
      kicker: "Risks",
      title: "What could go wrong, and what answers it.",
      body: (
        <Cards
          items={[
            {
              title: "Sources change without notice",
              body: "That is the job the maintainer is paid for, and vintages mean a bad republication is a new version, not a corrupted history. Nothing is promoted that fails reconciliation.",
            },
            {
              title: "AI commoditises collection",
              body: "Parsing is easy; noticing is not. On the other end of every feed is a human changing things unpredictably, and a model does not know what it failed to fetch.",
            },
            {
              title: "Redistribution",
              body: "A stream in a customer's warehouse is one GRANT from being resold. Per-stream pricing plus terms that name it, the way every data licence does.",
            },
            {
              title: "Concentration in one market",
              body: "The pipeline was built horizontal on purpose. Weather is live; property is the test that a vertical with no API can be onboarded on the same rails.",
            },
          ]}
        />
      ),
      stacked: true,
    },
    {
      kicker: "Where it stands",
      title: "Built, running, checkable.",
      aside: (
        <div className="grid grid-cols-2 gap-3">
          <Stat
            value={String(f.streams)}
            label="live streams, one per collected report"
            accent
          />
          <Stat
            value={f.nodes.toLocaleString()}
            label={`settlement points, repriced ${f.cadence}`}
          />
          <Stat
            value="29"
            label="collectors reconciled against live responses"
          />
          <Stat value="2 + 1" label="domains live, property declared next" />
        </div>
      ),
      body: (
        <List
          items={[
            "The workspace ships: typed components, wired groups, a community shelf, revisions stored as intent, a compile gate on every change.",
            "The ERCOT feed diffed against the source on the full node set: every node matched exactly.",
            "Identity, per-user storage and metering in place; the usage ledger already attributes spend to the screen that made it.",
            "Every screenshot on the landing page is a capture of the running product on the live feed.",
          ]}
        />
      ),
    },
    {
      kicker: "The plan",
      title: "The next four quarters.",
      body: (
        <Cards
          items={[
            {
              title: "Pricing launch",
              body: "Stream subscriptions, the platform fee, annual commits and prepaid packs. Hard caps and budget alerts before overages exist.",
            },
            {
              title: "Warehouse delivery",
              body: "Delta Sharing and parquet drops for Business and self-hosted. A free sample listing on both marketplaces.",
            },
            {
              title: "Property",
              body: "The first vertical with no API. County rolls, transfers and permits, one maintainer per state to start.",
            },
            {
              title: "Maintainer onboarding and payouts",
              body: "Claiming a source, publishing components, getting paid. The first outside maintainer is the milestone.",
            },
            {
              title: "Teams and sharing",
              body: "Shared workspaces across an account. The DRY story only holds once two people can see the same page.",
            },
            {
              title: "Bring your own model key",
              body: "Key entry on hosted plans, so the promise on the landing page is a setting rather than a roadmap.",
            },
          ]}
        />
      ),
      stacked: true,
    },
    {
      kicker: "People",
      title: "A small team and a growing roster.",
      body: (
        <List
          items={[
            <>
              <b className="text-ink">Clayton Horning</b>, founder. Built the
              pipeline, the workspace and the argument.
            </>,
            <>
              <b className="text-ink">Zach Hay</b> and{" "}
              <b className="text-ink">Cameron Horning</b>, investors and account
              managers. The people a mid-size account calls about anything that
              is not a broken feed.
            </>,
            <>
              <b className="text-ink">Maintainers</b>, one per source, the
              roster this whole thing exists to fill. Energy and weather today,
              property next.
            </>,
          ]}
        />
      ),
    },
  ];
}
