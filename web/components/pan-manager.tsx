"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircleIcon,
  CopyIcon,
  IdentificationCardIcon,
  ShieldCheckIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/field";
import { monogram } from "@/components/ipo-logo";
import { usePans } from "@/hooks/use-pans";
import { useAccordionHeight } from "@/hooks/use-accordion-height";
import { maskPan, panInputSchema, PAN_REGEX, type PanEntry } from "@/lib/pan";

/** Icon in a soft accent circle — a recurring badge for the two section headings. */
function IconBadge({ icon }: { icon: React.ReactNode }) {
  return (
    <span
      className="grid size-6 shrink-0 place-items-center rounded-control"
      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
      aria-hidden
    >
      {icon}
    </span>
  );
}

/**
 * One row: identity chip, tap-to-reveal PAN with copy, and a two-step remove.
 * State is local to the row (not lifted) since none of it — which PAN is
 * revealed, which is armed to delete — needs to survive a re-render of the
 * list, let alone leave this component.
 */
function PanRow({
  p,
  index,
  justAdded,
  onRemove,
}: {
  p: PanEntry;
  index: number;
  justAdded: boolean;
  onRemove: (id: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exiting, setExiting] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const accordion = useAccordionHeight(!exiting, rowRef);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    []
  );

  function toggleReveal() {
    setRevealed((was) => {
      const next = !was;
      if (revealTimer.current) clearTimeout(revealTimer.current);
      // Auto-remask: this is still the masked-by-default product, revealing is
      // a deliberate, momentary act, not a new resting state.
      if (next) revealTimer.current = setTimeout(() => setRevealed(false), 4000);
      return next;
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(p.pan);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (insecure context, older browser) — no-op.
    }
  }

  function handleRemoveClick() {
    if (!confirming) {
      setConfirming(true);
      confirmTimer.current = setTimeout(() => setConfirming(false), 2500);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    // Collapse first, then actually remove — the same measured-height
    // technique the row's own expand/collapse uses (useAccordionHeight), so a
    // deleted row shrinks away instead of just vanishing. 300ms matches
    // --dur-accordion.
    setExiting(true);
    setTimeout(() => onRemove(p.id), 300);
  }

  return (
    <li style={accordion.outerStyle}>
      <div ref={rowRef} style={accordion.innerStyle}>
        <div
          className="aw-pop-in group flex items-center gap-2.5 rounded-card border border-border bg-surface p-2.5 transition-[box-shadow,border-color] duration-200"
          style={{
            animationDelay: `${Math.min(index, 4) * 60}ms`,
            boxShadow: "0 0 #0000",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow =
              "0 10px 24px -12px color-mix(in oklab, var(--text) 30%, transparent)";
            e.currentTarget.style.borderColor = "var(--accent-soft)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "0 0 #0000";
            e.currentTarget.style.borderColor = "var(--border)";
          }}
        >
          <span className="relative shrink-0">
            {justAdded && (
              <span
                className="aw-ripple absolute inset-0 rounded-control"
                style={{ background: "var(--positive)" }}
                aria-hidden
              />
            )}
            <span
              className="relative grid size-8 place-items-center rounded-control border border-border"
              style={{ background: "var(--chip-bg)" }}
              aria-hidden
            >
              <span className="num text-[10px] font-medium text-text">{monogram(p.label)}</span>
            </span>
          </span>

          <button
            type="button"
            onClick={toggleReveal}
            className="min-w-0 flex-1 text-left active:scale-[0.98]"
            aria-label={revealed ? `Hide ${p.label}'s PAN` : `Show ${p.label}'s PAN`}
          >
            {/* No custom label was given, so it fell back to the masked PAN —
                showing that same string again underneath would just look like
                a rendering bug, so it gets one line, not two. */}
            {p.label === maskPan(p.pan) ? (
              <div className="num truncate text-[14px] font-medium">
                {revealed ? p.pan : maskPan(p.pan)}
              </div>
            ) : (
              <>
                <div className="truncate text-[14px] font-medium">{p.label}</div>
                <div className="num text-[12px] font-normal text-dim">
                  {revealed ? p.pan : maskPan(p.pan)}
                </div>
              </>
            )}
          </button>

          {revealed &&
            (copied ? (
              <span
                className="aw-pop-in shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-medium"
                style={{ background: "var(--positive-soft)", color: "var(--positive)" }}
              >
                Copied
              </span>
            ) : (
              <button
                type="button"
                onClick={copy}
                className="shrink-0 rounded-control p-1.5 text-dim transition-colors duration-150 hover:bg-row-hover hover:text-text active:scale-[0.9]"
                aria-label="Copy PAN"
              >
                <CopyIcon size={15} weight="regular" />
              </button>
            ))}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemoveClick}
            aria-label={confirming ? `Confirm remove ${p.label}` : `Remove ${p.label}`}
            className={confirming ? "rounded-pill" : undefined}
            style={
              confirming
                ? { background: "var(--negative-soft)", color: "var(--negative)" }
                : undefined
            }
          >
            <TrashIcon size={15} weight={confirming ? "fill" : "regular"} />
            {confirming ? "Confirm?" : "Remove"}
          </Button>
        </div>
      </div>
    </li>
  );
}

export function PanManager() {
  const { pans, ready, add, remove } = usePans();
  const [label, setLabel] = useState("");
  const [pan, setPan] = useState("");
  const [errors, setErrors] = useState<{ label?: string; pan?: string }>({});
  const [shake, setShake] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const panRef = useRef<HTMLInputElement>(null);

  // Live, per-segment: 5 letters, 4 digits, 1 letter — so the input can show
  // progress before the whole thing validates, not just pass/fail at the end.
  const seg1Valid = /^[A-Za-z]{5}$/.test(pan.slice(0, 5));
  const seg2Valid = /^[0-9]{4}$/.test(pan.slice(5, 9));
  const seg3Valid = /^[A-Za-z]$/.test(pan.slice(9, 10));
  const panValid = PAN_REGEX.test(pan);

  // 6px/4px shake, reverting well inside the 3s window from DESIGN.md.
  function rejectPan(message: string) {
    setErrors((e) => ({ ...e, pan: message }));
    setShake(true);
    window.setTimeout(() => setShake(false), 400);
    panRef.current?.focus();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const parsed = panInputSchema.safeParse({ label, pan });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      if (flat.pan?.[0]) rejectPan(flat.pan[0]);
      if (flat.label?.[0]) setErrors((prev) => ({ ...prev, label: flat.label![0] }));
      return;
    }

    // No label typed: fall back to the PAN's own masked form, so an entry is
    // always identifiable without forcing a decision that isn't required.
    const finalLabel = parsed.data.label || maskPan(parsed.data.pan);
    const result = add(finalLabel, parsed.data.pan);
    if (!result.ok) {
      rejectPan("That PAN is already saved.");
      return;
    }

    setLabel("");
    setPan("");
  }

  // The newly-added row gets a one-shot ripple; usePans doesn't hand back the
  // generated id, so the id of the row that appears next after a successful
  // add is inferred from the list itself once it updates. `null` means "the
  // first load from storage hasn't happened yet" — that load must not itself
  // read as an add, or every pre-existing PAN would ripple on page open.
  const prevIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!ready) return;
    const ids = new Set(pans.map((p) => p.id));
    if (prevIds.current === null) {
      prevIds.current = ids;
      return;
    }
    const added = pans.find((p) => !prevIds.current!.has(p.id));
    prevIds.current = ids;
    if (added) {
      setJustAddedId(added.id);
      const t = setTimeout(() => setJustAddedId(null), 700);
      return () => clearTimeout(t);
    }
  }, [pans, ready]);

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-6">
      <section>
        <form
          onSubmit={onSubmit}
          noValidate
          className="rounded-card border border-border p-3"
          style={{
            background:
              "radial-gradient(140% 100% at 100% 0%, var(--accent-soft), var(--surface) 55%)",
          }}
        >
          <h2 className="flex items-center gap-2 text-[15px] font-medium">
            <IconBadge icon={<IdentificationCardIcon size={14} weight="bold" aria-hidden />} />
            Add a PAN
          </h2>

          {/* Stated where the PAN is entered, not buried in a settings page.
              Kept to one line on a phone — the full account is a tap away. */}
          <p className="mt-1.5 flex items-start gap-1.5 text-[12px] text-dim">
            <ShieldCheckIcon size={13} weight="regular" aria-hidden className="mt-0.5 shrink-0" />
            <span>
              Stays in this browser.{" "}
              <Link href="/privacy" className="underline underline-offset-2 hover:no-underline">
                Privacy policy
              </Link>
            </span>
          </p>

          <div className="mt-2.5 space-y-2">
            <div>
              <div className="flex items-baseline justify-between">
                <Label htmlFor="pan-label">Label</Label>
                <span className="text-[11px] text-dim">Optional</span>
              </div>
              <div className="mt-1.5 rounded-control transition-shadow duration-150 focus-within:[box-shadow:0_0_0_4px_var(--accent-soft)]">
                <Input
                  id="pan-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="You, Papa, Sister"
                  maxLength={24}
                  autoComplete="off"
                  invalid={Boolean(errors.label)}
                  aria-describedby={errors.label ? "pan-label-error" : undefined}
                />
              </div>
              <FieldError id="pan-label-error">{errors.label}</FieldError>
            </div>

            <div className={shake ? "aw-shake" : undefined}>
              <div className="flex items-baseline justify-between">
                <Label htmlFor="pan-value">PAN</Label>
                <span className="num text-[11px] text-dim">{pan.length}/10</span>
              </div>
              <div className="relative mt-1.5 rounded-control transition-shadow duration-150 focus-within:[box-shadow:0_0_0_4px_var(--accent-soft)]">
                <Input
                  id="pan-value"
                  ref={panRef}
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  autoComplete="off"
                  spellCheck={false}
                  inputMode="text"
                  invalid={Boolean(errors.pan)}
                  aria-describedby={errors.pan ? "pan-value-error" : "pan-value-hint"}
                  className="num tracking-[0.08em] uppercase pr-9"
                />
                {panValid && (
                  <CheckCircleIcon
                    size={18}
                    weight="fill"
                    aria-hidden
                    className="aw-pop-in absolute top-1/2 right-2.5 -translate-y-1/2"
                    style={{ color: "var(--positive)" }}
                  />
                )}
              </div>

              {/* Letters · digits · letter — fills in as each segment
                  validates, so the format is shown, not just stated. */}
              <div className="mt-1.5 flex gap-1" aria-hidden>
                <span
                  className="h-1 flex-5 rounded-pill transition-colors duration-150"
                  style={{ background: seg1Valid ? "var(--positive)" : "var(--border)" }}
                />
                <span
                  className="h-1 flex-4 rounded-pill transition-colors duration-150"
                  style={{ background: seg2Valid ? "var(--positive)" : "var(--border)" }}
                />
                <span
                  className="h-1 flex-1 rounded-pill transition-colors duration-150"
                  style={{ background: seg3Valid ? "var(--positive)" : "var(--border)" }}
                />
              </div>

              <FieldError id="pan-value-error">{errors.pan}</FieldError>
              {/* Visual hint is the placeholder + segment bars; this stays for
                  screen readers, which announce it via aria-describedby. */}
              {!errors.pan && (
                <p id="pan-value-hint" className="sr-only">
                  5 letters, 4 digits, 1 letter — e.g. ABCDE1234F
                </p>
              )}
            </div>
          </div>

          <Button type="submit" variant="primary" className="mt-3 w-full">
            Save PAN
          </Button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-[15px] font-medium">
          <IconBadge icon={<IdentificationCardIcon size={14} weight="bold" aria-hidden />} />
          Saved PANs
          {ready && pans.length > 0 && (
            <span className="num text-[13px] font-normal text-dim">{pans.length}</span>
          )}
        </h2>

        {!ready && <div className="aw-skeleton h-14 rounded-card" />}

        {ready && pans.length === 0 && (
          <div
            className="flex items-center gap-2.5 rounded-card border border-dashed p-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div
              className="grid size-8 shrink-0 place-items-center rounded-control"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              <IdentificationCardIcon size={16} weight="regular" aria-hidden />
            </div>
            <p className="text-[12px] text-dim">
              Nothing saved yet. Add one above — every IPO check runs all of them at once.
            </p>
          </div>
        )}

        {ready && pans.length > 0 && (
          <ul className="space-y-1.5">
            {pans.map((p, i) => (
              <PanRow
                key={p.id}
                p={p}
                index={i}
                justAdded={p.id === justAddedId}
                onRemove={remove}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
