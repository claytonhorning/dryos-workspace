import { Reveal } from "@/components/hero/Reveal";
import { ButtonLink } from "@/components/ui";
import { Eyebrow, Heading, Lead, Section } from "./Section";
import { ThemedShot } from "./ThemedShot";
import { WireDemo } from "./WireDemo";

/**
 * The product, shown rather than described.
 *
 * Every image in this section is a capture of a page composed from the
 * published recipes, compiled through the real sandbox, on the live feed — the
 * same generated source a workspace runs. Nothing is a mock-up. The one
 * exception the map itself declares: settlement points have no published
 * coordinates, so their positions are invented, and the legend in the capture
 * says so.
 *
 */
export function Workspaces() {
  return (
    <Section id="workspaces">
      <Reveal when="view">
          <Eyebrow>Workspaces</Eyebrow>
          <Heading>Build on what your team already built.</Heading>
          <Lead>
            AI made a dashboard an afternoon&rsquo;s work, so now everyone builds their own:
            the same feed, the same chart, four times over, none of them shared. A workspace
            is where that stops. Pages are put together from components somebody already
            made, a wired group lands as one drop, and every change is recorded as the
            sentence that asked for it. Do not repeat yourself, as an operating system.
          </Lead>
      </Reveal>

      {/* ── The screen ──────────────────────────────────────────────── */}
      <Reveal when="view" className="mt-10">
        <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-2xl shadow-black/40">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <span className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
              One page of a workspace
            </span>
            <span className="ml-auto truncate font-mono text-[10px] text-muted">
              Energy › Pricing · Load · Generation
            </span>
          </div>
          <ThemedShot
            name="screen"
            alt="A workspace page: a map of settlement points, a price chart and ticker wired to it, load by zone, fuel mix and a heatmap of five-minute prices"
            ratio="1440/760"
            sizes="(min-width: 1280px) 1240px, 100vw"
          />
        </div>
        <p className="mt-3 max-w-[78ch] text-[13px] leading-relaxed text-faint">
          Six tiles on this afternoon&rsquo;s ERCOT prices and none of them coded. The map,
          the chart and the ticker are one published group, already wired to each other; load
          by zone and the fuel mix are published components; the heatmap is a shape dropped
          onto a stream. Captured from the running page, on the live feed.
        </p>
      </Reveal>

      {/* ── Wires ───────────────────────────────────────────────────── */}
      <div className="mt-14 grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
        <Reveal when="view">
          <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">
            Wire it once. Everyone drops the group.
          </h3>
          <p className="mt-3 text-[15px] leading-[1.7] text-muted">
            Click a node on the map and the chart and the ticker follow it. Somebody wires that
            once and publishes it, and it lands on every other page as one drop, already
            connected. The wire is stored on the receiver and replays like any other setting,
            so it survives the copy.
          </p>
          <p className="mt-3 text-[15px] leading-[1.7] text-muted">
            On the launched screen both ends wear the pair&rsquo;s color, so whoever inherits
            the page can see what is driving what without asking who built it.
          </p>
        </Reveal>
        <Reveal when="view">
          <WireDemo />
        </Reveal>
      </div>

      {/* Whose model it is. The same shape as the return-leg strip in How it
          works, because it is the same kind of promise: a bill that does not
          pass through us. */}
      <Reveal when="view" className="mt-12">
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-accent-line bg-accent-dim/40 px-5 py-4">
          <span aria-hidden className="mt-[3px] font-mono text-[13px] text-accent">
            ⌁
          </span>
          <p className="text-[13.5px] leading-relaxed text-muted">
            <span className="font-semibold text-ink">Bring your own model key.</span> Claude,
            OpenAI, whichever you already pay for, on hosted and self-hosted alike. We do not
            mark it up; that bill stays between you and them. AI mode gets the full model, and
            what it lands on is a typed component: generated code that compiles or is refused,
            so the page your team builds this quarter still runs a year from now.
          </p>
        </div>
      </Reveal>

      <Reveal when="view" className="mt-10 flex flex-wrap items-center gap-2.5">
        <ButtonLink href="/workspace" tone="primary">
          Open Dryos
        </ButtonLink>
        <ButtonLink href="#pricing" tone="secondary">
          Three ways to use it
        </ButtonLink>
      </Reveal>
    </Section>
  );
}

