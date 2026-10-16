import { CheckIcon } from "@phosphor-icons/react";
import type { IpoListItem } from "@/lib/schemas";
import {
  cn,
  describeAllotmentDate,
  formatDate,
  relativeDay,
} from "@/lib/utils";

type StepState = "done" | "now" | "next";

function Step({
  label,
  when,
  state,
}: {
  label: string;
  when: string;
  state: StepState;
}) {
  return (
    <li className="relative flex min-w-0 flex-1 flex-col items-center text-center">
      <span className="relative grid size-5 place-items-center" aria-hidden>
        {state === "done" && (
          <span
            className="grid size-5 place-items-center rounded-pill"
            style={{ background: "var(--positive)", color: "var(--surface)" }}
          >
            <CheckIcon size={11} weight="bold" />
          </span>
        )}
        {state === "now" && (
          <>
            <span
              className="aw-live-ping absolute size-3 rounded-pill"
              style={{ background: "var(--accent)" }}
            />
            <span
              className="relative size-3 rounded-pill"
              style={{ background: "var(--accent)" }}
            />
          </>
        )}
        {state === "next" && (
          <span className="size-3 rounded-pill border-2 border-border bg-surface" />
        )}
      </span>
      <span
        className={cn(
          "mt-1.5 text-[12px] font-medium",
          state === "next" && "text-dim",
        )}
      >
        {label}
      </span>
      <span className="num text-[11px] text-dim">{when}</span>
    </li>
  );
}

/**
 * What an expanded row shows while its allotment is still to come, in place of
 * a check button that could only fail: where the issue stands between closing
 * and listing, and that the check opens here on its own once results are out.
 * The list re-reads itself every minute, so "on its own" is literal.
 */
export function AwaitingAllotment({ ipo }: { ipo: IpoListItem }) {
  const due = ipo.allotmentDate;
  const rel = due ? relativeDay(due) : null;
  const allotWhen = !due
    ? "TBA"
    : rel === "today"
      ? "Today"
      : rel === "tomorrow"
        ? "Tomorrow"
        : formatDate(due);

  const message = !due
    ? "The allotment date hasn’t been announced yet. The PAN check opens here once results are out."
    : rel === "today"
      ? "Results are due today. The PAN check opens here as soon as they’re published — no need to refresh."
      : `Results are expected ${describeAllotmentDate(due)}. The PAN check opens here once they’re out.`;

  return (
    <div
      className="mt-3 rounded-card border border-border bg-surface p-3"
      role="status"
    >
      <ol className="relative flex" aria-label="Where this IPO stands">
        {/* The rail between the three dots: solid up to allotment, dashed after. */}
        <span
          className="absolute top-2.5 right-[16.7%] left-[16.7%] flex"
          aria-hidden
        >
          <span
            className="h-0.5 flex-1"
            style={{ background: "var(--positive)", opacity: 0.6 }}
          />
          <span
            className="h-0 flex-1 border-t-2 border-dashed border-border"
            style={{ marginTop: 0 }}
          />
        </span>
        <Step
          label="Closed"
          when={ipo.closeDate ? formatDate(ipo.closeDate) : "—"}
          state="done"
        />
        <Step label="Allotment" when={allotWhen} state="now" />
        <Step
          label="Listing"
          when={ipo.listingDate ? formatDate(ipo.listingDate) : "TBA"}
          state="next"
        />
      </ol>
      <p className="mt-3 border-t border-border pt-2.5 text-[12px] leading-relaxed text-dim">
        {message}
      </p>
    </div>
  );
}
