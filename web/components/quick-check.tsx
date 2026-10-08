"use client";

import { useId, useState } from "react";
import { ArrowClockwiseIcon, SealCheckIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { FieldError, Input } from "@/components/ui/field";
import { PanResult } from "@/components/pan-result";
import type { useAllotmentCheck } from "@/hooks/use-allotment-check";
import { usePans } from "@/hooks/use-pans";
import { loadPans, maskPan, panInputSchema } from "@/lib/pan";

/**
 * Check one PAN without saving anything first.
 *
 * Saved PANs live in the browser, so a first-time visitor has none, and the
 * card used to send them off to the PANs page to type one in before they could
 * see a result. Here they type it and get the answer in place. It is held in
 * memory only for the check; saving it is a choice made after seeing the
 * result, and until then nothing is written anywhere.
 */
export function QuickCheck({ check }: { check: ReturnType<typeof useAllotmentCheck> }) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const { add } = usePans();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = panInputSchema.safeParse({ pan: value });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid PAN.");
      return;
    }
    setError(null);
    setChecked(parsed.data.pan);
    check.run([{ id: "quick", label: maskPan(parsed.data.pan), pan: parsed.data.pan }]);
  }

  // Saving moves the PAN into the saved list, which takes over the card, so
  // the check is run again straight away to land on a result rather than a
  // card full of "Waiting". The registrar's answer is cached, so it is quick.
  function save() {
    if (!checked) return;
    const r = add(maskPan(checked), checked);
    if (r.ok || r.reason === "duplicate") check.run(loadPans());
  }

  const state = check.results.quick;
  const done = state?.status === "done" || state?.status === "error";

  return (
    <div
      className="mt-3 rounded-card border border-border p-3"
      style={{ background: "radial-gradient(140% 100% at 100% 0%, var(--accent-soft), var(--surface) 55%)" }}
    >
      <h3 className="flex items-center gap-2 text-[14px] font-medium">
        <span
          className="grid size-6 shrink-0 place-items-center rounded-control"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          aria-hidden
        >
          <SealCheckIcon size={14} weight="bold" />
        </span>
        Check allotment
      </h3>

      <form onSubmit={submit} noValidate className="mt-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="sr-only">
            PAN
          </label>
          <Input
            id={inputId}
            value={value}
            onChange={(e) => {
              setValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
              if (error) setError(null);
            }}
            placeholder="Enter PAN, e.g. ABCDE1234F"
            maxLength={10}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            className="num h-8 px-2.5 tracking-wide sm:h-8"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          className="h-8 px-3 text-[12px] sm:h-8 sm:px-3"
          disabled={check.isRunning}
        >
          {check.isRunning && <ArrowClockwiseIcon size={14} weight="bold" className="animate-spin" aria-hidden />}
          {check.isRunning ? "Checking…" : checked ? "Check again" : "Check PAN"}
        </Button>
      </form>
      <FieldError id={errorId}>{error}</FieldError>

      {checked && (
        <ul className="mt-3">
          <PanResult entry={{ id: "quick", label: maskPan(checked), pan: checked }} state={state} />
        </ul>
      )}

      {done && (
        <button
          type="button"
          onClick={save}
          className="mt-2.5 text-[12px] text-dim underline underline-offset-2 hover:text-text hover:no-underline"
        >
          Save this PAN to check every IPO in one tap
        </button>
      )}

      <p className="mt-2.5 text-[11px] text-dim">
        Your PAN stays in this browser. It is sent to the registrar only for the seconds a check takes,
        and never stored on our servers.
      </p>
    </div>
  );
}
