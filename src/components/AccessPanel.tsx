"use client";

import { useState } from "react";
import { sortTiers, tierDef } from "@/lib/tiers";
import type { Dataset } from "@/lib/types";
import { Modal } from "./Modal";
import { Button } from "./ui";

/**
 * Access panel, pre-launch.
 *
 * There are no API keys to issue yet — no auth, no metering, no data. So this
 * collects interest instead of pretending to provision something. When the
 * collectors are live and metering exists, this becomes the key-issuing flow.
 */
export function AccessPanel({ dataset }: { dataset: Dataset }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [useCase, setUseCase] = useState("");
  const [sent, setSent] = useState(false);

  const tiers = sortTiers(dataset.availableTiers);

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
          Pricing
        </div>
        <ul className="mt-3 space-y-3">
          {tiers.map((id) => {
            const t = tierDef(id);
            const price = dataset.pricing[id];
            return (
              <li key={id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-ink">{t.name}</span>
                  {price && (
                    <span className="font-mono text-[13px] text-accent tabular-nums">
                      ${price.unitPriceUsd.toFixed(2)}
                      <span className="text-[11px] text-faint"> / {price.unit}</span>
                    </span>
                  )}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-faint">
                  {t.latencySlo}
                </div>
                {price && (
                  <div className="mt-0.5 text-[11.5px] text-muted">
                    {price.freeAllowance} free
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>


      <div className="p-5">
        <Button tone="primary" className="w-full" onClick={() => setOpen(true)}>
          Get early access
        </Button>
        <p className="mt-2.5 text-center text-[12px] text-faint">
          We are onboarding the first few teams by hand
        </p>
      </div>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setTimeout(() => setSent(false), 200);
        }}
        title={sent ? "Thanks — we'll be in touch" : `Early access · ${dataset.name}`}
        subtitle={
          sent
            ? "We read every one of these. If your use case is close to what the first collectors cover, you will hear from us within a couple of days."
            : "This collector is being built now. Tell us what you would use it for and we will get you on it as soon as it passes validation."
        }
        footer={
          sent ? (
            <Button
              tone="primary"
              onClick={() => {
                setOpen(false);
                setTimeout(() => setSent(false), 200);
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button tone="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button tone="primary" onClick={() => setSent(true)} disabled={!email.trim()}>
                Request access
              </Button>
            </>
          )
        }
      >
        {sent ? (
          <p className="dr-rise text-[13.5px] leading-relaxed text-muted">
            Nothing is provisioned yet — there is no API key to hand you until the
            collector is running and metered. We will email you when there is.
          </p>
        ) : (
          <div className="space-y-4">
            <Field label="Work email">
              <input
                autoFocus
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="h-10 w-full rounded-md border border-line bg-surface-2 px-3 text-[13.5px] text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
              />
            </Field>
            <Field label="What would you build on it?">
              <textarea
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                rows={4}
                placeholder="Specific beats polite — it tells us which nodes, which history depth, and which delivery shape you actually need."
                className="dr-scroll w-full resize-y rounded-md border border-line bg-surface-2 px-3 py-2.5 text-[13.5px] leading-relaxed text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
              />
            </Field>
            <p className="text-[12px] leading-relaxed text-faint">
              This form is not wired to a backend in this build — submitting it only
              updates the page.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}
