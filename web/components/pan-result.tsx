"use client";

import { ArrowSquareOutIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { monogram } from "@/components/ipo-logo";
import type { PanCheckState } from "@/hooks/use-allotment-check";
import type { PanEntry } from "@/lib/pan";
import { maskPan } from "@/lib/pan";
import { inr } from "@/lib/utils";

/** Shared shape for the terminal states, so they read as one family. */
function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "positive" | "negative" | "dim" | "accent";
}) {
  const bg = {
    positive: "var(--positive-soft)",
    negative: "var(--negative-soft)",
    accent: "var(--accent-soft)",
    dim: "var(--chip-bg)",
  }[tone];
  const fg = {
    positive: "var(--positive)",
    negative: "var(--negative)",
    accent: "var(--accent)",
    dim: "var(--dim)",
  }[tone];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-medium"
      style={{ background: bg, color: fg }}
    >
      {children}
    </span>
  );
}

/**
 * One line per saved PAN. Every branch names what happened and, where the user
 * can act, what to do next — there is no generic "no data" outcome here.
 *
 * `index` staggers the rows in, using the 260ms between-results beat from
 * DESIGN.md, so a multi-PAN check resolves as a sequence rather than a flash.
 */
export function PanResult({
  entry,
  state,
  index = 0,
}: {
  entry: PanEntry;
  state: PanCheckState | undefined;
  index?: number;
}) {
  const allotted =
    state?.status === "done" &&
    state.data.kind !== "deeplink" &&
    state.data.found &&
    (state.data.summary?.totalSharesAllotted ?? 0) > 0;

  // No custom label was given, so it fell back to the masked PAN — printing
  // that same string twice reads as a rendering bug.
  const unlabelled = entry.label === maskPan(entry.pan);

  return (
    <li
      className="aw-pop-in flex items-center gap-2.5 rounded-control border px-2.5 py-2 transition-colors duration-200"
      style={{
        animationDelay: `${Math.min(index, 4) * 60}ms`,
        background: allotted ? "var(--positive-soft)" : "var(--surface)",
        borderColor: allotted ? "transparent" : "var(--border)",
      }}
    >
      <span className="relative shrink-0">
        {/* One-shot ring on the outcome worth celebrating. */}
        {allotted && (
          <span
            className="aw-ripple absolute inset-0 rounded-control"
            style={{ background: "var(--positive)" }}
            aria-hidden
          />
        )}
        <span
          className="relative grid size-7 place-items-center rounded-control border border-border"
          style={{ background: "var(--chip-bg)" }}
          aria-hidden
        >
          <span className="num text-[10px] font-medium text-text">{monogram(entry.label)}</span>
        </span>
      </span>

      <div className="min-w-0 flex-1">
        {unlabelled ? (
          <div className="num truncate text-[13px] font-medium">{maskPan(entry.pan)}</div>
        ) : (
          <>
            <div className="truncate text-[13px] font-medium">{entry.label}</div>
            <div className="num text-[11px] font-normal text-dim">{maskPan(entry.pan)}</div>
          </>
        )}
      </div>

      <div className="shrink-0 text-right">
        <Outcome state={state} />
      </div>
    </li>
  );
}

function Outcome({ state }: { state: PanCheckState | undefined }) {
  if (!state || state.status === "queued") {
    return <Pill tone="dim">Waiting</Pill>;
  }

  if (state.status === "checking") {
    return <span className="aw-skeleton inline-block h-6 w-24 rounded-pill align-middle" />;
  }

  if (state.status === "error") {
    return (
      <Pill tone="negative">
        <WarningCircleIcon size={13} weight="fill" aria-hidden />
        {state.message}
      </Pill>
    );
  }

  const data = state.data;

  // Captcha-gated registrar: an answer, not a failure.
  if (data.kind === "deeplink") {
    return (
      <a
        href={data.deepLink.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-medium transition-opacity duration-150 hover:opacity-80"
        style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
      >
        Check on {data.deepLink.label}
        <ArrowSquareOutIcon size={13} weight="bold" aria-hidden />
      </a>
    );
  }

  if (!data.found) {
    return <Pill tone="dim">No application</Pill>;
  }

  const summary = data.summary;
  if (!summary || summary.totalSharesAllotted === 0) {
    return <Pill tone="negative">Not allotted</Pill>;
  }

  const partial = summary.status === "partially_allotted";
  return (
    <span className="inline-flex items-baseline gap-1.5">
      {/* The one number the screen exists for. */}
      <span
        className="num aw-pop-in text-[19px] font-semibold tabular-nums"
        style={{ color: "var(--positive)" }}
      >
        {inr(summary.totalSharesAllotted)}
      </span>
      <span className="text-[12px] font-medium" style={{ color: "var(--positive)" }}>
        {summary.totalSharesAllotted === 1 ? "share" : "shares"}
      </span>
      {partial && <span className="text-[11px] text-dim">of {inr(summary.totalSharesApplied)}</span>}
    </span>
  );
}
