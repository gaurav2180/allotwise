import { CheckIcon } from "@phosphor-icons/react";
import type { IpoListItem } from "@/lib/schemas";
import { allotmentOverdue, cn, derivePhase, describeAllotmentDate, formatDate, relativeDay } from "@/lib/utils";

type StepState = "done" | "now" | "next";

interface StepSpec {
  label: string;
  when: string;
  state: StepState;
}

function Step({ label, when, state }: StepSpec) {
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
            <span className="aw-live-ping absolute size-3 rounded-pill" style={{ background: "var(--accent)" }} />
            <span className="relative size-3 rounded-pill" style={{ background: "var(--accent)" }} />
          </>
        )}
        {state === "next" && <span className="size-3 rounded-pill border-2 border-border bg-surface" />}
      </span>
      <span className={cn("mt-1.5 text-[12px] font-medium", state === "next" && "text-dim")}>{label}</span>
      <span className="num text-[11px] text-dim">{when}</span>
    </li>
  );
}

/** "Today", "Tomorrow", or the date; "TBA" when none is announced. */
function when(iso: string | null | undefined, now: Date): string {
  if (!iso) return "TBA";
  const rel = relativeDay(iso, now);
  return rel === "today" ? "Today" : rel === "tomorrow" ? "Tomorrow" : formatDate(iso);
}

/**
 * The four dates of an issue as steps, each done, under way or to come, read
 * from today's date: the same phase the row's own line and tab are built on,
 * so an issue that has not opened never shows as closed.
 */
export function issueSteps(ipo: IpoListItem, now = new Date()): StepSpec[] {
  const phase = derivePhase(ipo, now);
  const order = phase === "upcoming" ? 0 : phase === "open" ? 1 : 2;
  const state = (i: number): StepState => (i < order ? "done" : i === order ? "now" : "next");
  return [
    { label: order > 0 ? "Opened" : "Opens", when: when(ipo.openDate, now), state: state(0) },
    { label: order > 1 ? "Closed" : "Closes", when: when(ipo.closeDate, now), state: state(1) },
    { label: "Allotment", when: when(ipo.allotmentDate, now), state: state(2) },
    { label: "Listing", when: when(ipo.listingDate, now), state: "next" },
  ];
}

/**
 * What an expanded row shows while there is no result to check, in place of a
 * button that could only fail: where the issue stands, from opening to
 * listing, and when the check will open. The list re-reads itself every
 * minute, so once results are published the check replaces this on its own.
 *
 * `now` is the page's shared date (useToday), passed in rather than read from
 * the clock here, so the strip moves to a new day in the same render as the
 * row's status line and the tab it sits under.
 */
export function AwaitingAllotment({ ipo, now }: { ipo: IpoListItem; now: Date }) {
  const steps = issueSteps(ipo, now);
  const phase = derivePhase(ipo, now);
  const due = ipo.allotmentDate;
  const dueToday = due ? relativeDay(due, now) === "today" : false;

  const result = !due
    ? "The PAN check opens here once results are out."
    : allotmentOverdue(ipo, now)
      ? `Allotment was due ${formatDate(due)}, but the registrar hasn’t published results yet. The PAN check opens here as soon as it does — no need to refresh.`
      : dueToday
      ? "Results are due today. The PAN check opens here as soon as they’re published — no need to refresh."
      : `Results are expected ${describeAllotmentDate(due, now)}. The PAN check opens here once they’re out.`;
  const lead =
    phase === "upcoming"
      ? ipo.openDate
        ? `Opens for bids ${describeAllotmentDate(ipo.openDate, now)}. `
        : "Dates not announced yet. "
      : phase === "open"
        ? ipo.closeDate
          ? relativeDay(ipo.closeDate, now) === "today"
            ? "Open for bids, closing today. "
            : `Open for bids until ${formatDate(ipo.closeDate)}. `
          : "Open for bids now. "
        : "";

  // The rail runs between the first and last dots; a stretch is solid once the
  // step it leads to has been reached, dashed before.
  const reached = steps.map((s) => s.state !== "next");

  return (
    <div className="mt-3 rounded-card border border-border bg-surface p-3" role="status">
      <ol className="relative flex" aria-label="Where this IPO stands">
        <span className="absolute top-2.5 right-[12.5%] left-[12.5%] flex" aria-hidden>
          {[1, 2, 3].map((i) =>
            reached[i] ? (
              <span key={i} className="h-0.5 flex-1" style={{ background: "var(--positive)", opacity: 0.6 }} />
            ) : (
              <span key={i} className="h-0 flex-1 border-t-2 border-dashed border-border" />
            )
          )}
        </span>
        {steps.map((s) => (
          <Step key={s.label} {...s} />
        ))}
      </ol>
      <p className="mt-3 border-t border-border pt-2.5 text-[12px] leading-relaxed text-dim">
        {lead}
        {result}
      </p>
    </div>
  );
}
