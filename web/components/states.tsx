import Link from "next/link";
import { ArrowClockwiseIcon, CaretRightIcon, PlugsConnectedIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

/**
 * Three genuinely different situations, three different screens. Each names the
 * cause and the next action; none of them says "no data available".
 */

function Shell({
  title,
  body,
  action,
  icon,
  tone = "neutral",
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  /** "negative" marks a genuine failure (can't reach the service) with the
   *  same red used for a failed PAN check elsewhere — a filter or search
   *  turning up nothing is not that, and stays neutral. */
  tone?: "neutral" | "negative";
}) {
  const toneColor = tone === "negative" ? "var(--negative)" : undefined;
  return (
    <div className="rounded-card border border-border bg-surface px-6 py-12 text-center">
      {icon && (
        <div className="mb-3 flex justify-center" style={{ color: toneColor ?? "var(--dim)" }}>
          {icon}
        </div>
      )}
      <h2 className="text-[15px] font-medium" style={{ color: toneColor }}>
        {title}
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] text-dim">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * First run. The market list is already useful without a PAN, so this is a
 * single tappable row above it — the same height as an IPO row, not a card
 * with its own boxed button — rather than a full empty state that would push
 * the data the user came for below the fold. The privacy note lives on
 * /pans itself; repeating it here just to fill space cost the row a second
 * line and made it wrap on a phone.
 */
export function NoPansBanner() {
  return (
    <Link
      href="/pans"
      className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 hover:bg-row-hover"
    >
      <p className="min-w-0 truncate text-[13px]">
        <span className="font-medium text-text">Add a PAN</span>{" "}
        <span className="text-dim">to check allotment</span>
      </p>
      <CaretRightIcon size={14} weight="bold" aria-hidden className="shrink-0 text-dim" />
    </Link>
  );
}

/** The filter is valid but matches nothing right now. */
export function NoMatchesState({ filter, onReset }: { filter: string; onReset: () => void }) {
  return (
    <Shell
      title={`No ${filter} IPOs right now`}
      body="The Indian primary market runs in bursts — some weeks have none in this state. The other tabs may still have issues in them."
      action={
        <button
          onClick={onReset}
          className="inline-flex h-10 items-center rounded-control border border-border bg-surface px-4 text-sm font-medium hover:bg-row-hover sm:h-9"
        >
          Take me to one that does
        </button>
      }
    />
  );
}

/** A search query matched nothing in the current cycle. */
export function NoSearchMatchesState({ query, onReset }: { query: string; onReset: () => void }) {
  return (
    <Shell
      title={`No IPOs match "${query}"`}
      body="Check the spelling, or it may be sitting in the listing history rather than the current cycle."
      action={
        <button
          onClick={onReset}
          className="inline-flex h-10 items-center rounded-control border border-border bg-surface px-4 text-sm font-medium hover:bg-row-hover sm:h-9"
        >
          Clear search
        </button>
      }
    />
  );
}

/** The backend or a registrar could not be reached. */
export function UnreachableState({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry: () => void;
  /** True while a retry is in flight — without this, clicking "Try again"
   *  gives no feedback until it either succeeds or fails the same way. */
  retrying?: boolean;
}) {
  return (
    <Shell
      tone="negative"
      icon={<PlugsConnectedIcon size={24} weight="regular" />}
      title="Can't reach the IPO data service"
      body={`${message} Your saved PANs are untouched — they never left this browser.`}
      action={
        <button
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex h-10 items-center gap-2 rounded-control border border-border bg-surface px-4 text-sm font-medium hover:bg-row-hover disabled:pointer-events-none disabled:opacity-60 sm:h-9"
        >
          <ArrowClockwiseIcon
            size={15}
            weight="regular"
            className={cn(retrying && "animate-spin")}
            aria-hidden
          />
          {retrying ? "Retrying…" : "Try again"}
        </button>
      }
    />
  );
}

/** Bounded skeleton for the initial list load. */
export function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading IPOs">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-card border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="aw-skeleton h-4 w-48 rounded-pill" />
              <div className="aw-skeleton mt-2 h-3 w-32 rounded-pill" />
            </div>
            <div className="flex gap-6">
              <div className="aw-skeleton h-8 w-14 rounded-control" />
              <div className="aw-skeleton h-8 w-16 rounded-control" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
