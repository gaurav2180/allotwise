"use client";

import { useEffect } from "react";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FROM_LIST_KEY, gmpHistoryQuery, gmpHref } from "@/hooks/use-gmp-history";
import { GmpSparkline } from "@/components/gmp-sparkline";
import {
  ArrowClockwiseIcon,
  BankIcon,
  CalendarBlankIcon,
  CalendarCheckIcon,
  CalendarXIcon,
  CaretRightIcon,
  MoneyIcon,
  StackIcon,
  StorefrontIcon,
  TrendUpIcon,
} from "@phosphor-icons/react";
import type { IpoListItem } from "@/lib/schemas";
import { estProfitPerLot, formatIssueSize, formatLongDate, formatPriceBand, inr } from "@/lib/utils";

type Icon = React.ComponentType<{ size?: number; weight?: "regular"; className?: string }>;

function Fact({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: Icon;
  label: string;
  value: string | null;
  color?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 py-3">
      <Icon size={16} weight="regular" className="mt-0.5 shrink-0 text-dim" />
      <div className="min-w-0">
        <div className="text-[12px] text-dim">{label}</div>
        <div className="num mt-0.5 truncate text-[15px] font-medium" style={color ? { color } : undefined}>
          {value ?? "—"}
        </div>
      </div>
    </div>
  );
}

/** The button's icon, swapped for a spinner the instant it is tapped, so a slow
 *  first load never looks like an ignored tap. Must render inside the Link. */
function DaywiseIcon() {
  const { pending } = useLinkStatus();
  return pending ? (
    <ArrowClockwiseIcon size={14} weight="bold" className="shrink-0 animate-spin text-dim" aria-hidden />
  ) : (
    <CaretRightIcon
      size={14}
      weight="bold"
      className="shrink-0 text-dim transition-transform duration-200 group-hover:translate-x-0.5"
      aria-hidden
    />
  );
}

const signColor = (n: number | null) =>
  n === null || n === 0 ? undefined : n > 0 ? "var(--positive)" : "var(--negative)";

/**
 * The issue at a glance: lot, price, estimated profit, size and the four
 * dates. Everything is on the row already, so nothing is fetched here.
 */
export function IpoDetailPanel({ ipo }: { ipo: IpoListItem }) {
  const profit = estProfitPerLot(ipo.lotSize, ipo.gmp);
  const router = useRouter();

  // Opening a row is the signal someone may open the GMP page next, so both
  // the page and its history start loading now. The history also feeds the
  // sparkline below, so it is read here rather than only prefetched.
  useEffect(() => {
    router.prefetch(gmpHref(ipo.slug));
  }, [router, ipo.slug]);
  const history = useQuery(gmpHistoryQuery(ipo.slug));
  const values = history.data?.history.map((p) => p.gmp) ?? [];

  return (
    <div className="pt-2">
      <Link
        href={gmpHref(ipo.slug)}
        onClick={() => {
          try {
            sessionStorage.setItem(FROM_LIST_KEY, ipo.slug);
          } catch {}
        }}
        className="group -mx-2 flex items-center gap-3 rounded-control px-2 py-2 transition-colors duration-150 hover:bg-row-hover"
      >
        <span className="shrink-0 text-[12px] text-dim">GMP history</span>
        <span className="num min-w-0 flex-1 truncate text-[13px] font-medium">
          {values.length >= 2 ? (
            <>
              ₹{inr(values[0])} <span className="text-dim">→</span> ₹{inr(values[values.length - 1])}
              <span className="ml-1.5 text-[11px] font-normal text-dim">{values.length}d</span>
            </>
          ) : history.isPending ? (
            <span className="aw-skeleton inline-block h-3 w-20 rounded-pill align-middle" />
          ) : (
            <span className="font-normal text-dim">Day-wise GMP</span>
          )}
        </span>
        {values.length >= 2 && <GmpSparkline values={values} width={56} height={18} />}
        <DaywiseIcon />
      </Link>

      <div className="grid grid-cols-2 gap-x-4 divide-y divide-border border-t border-border [&>*:nth-child(2)]:border-t-0">
        <Fact icon={StackIcon} label="Lot Size" value={ipo.lotSize ? inr(ipo.lotSize) : null} />
        <Fact icon={MoneyIcon} label="Price Range" value={formatPriceBand(ipo.priceBand)} />
        <Fact
          icon={TrendUpIcon}
          label="Est. Profit / Lot"
          value={profit !== null ? `₹${inr(profit)}` : null}
          color={signColor(profit)}
        />
        <Fact icon={BankIcon} label="Issue Size" value={formatIssueSize(ipo.issueSize)} />
        <Fact icon={CalendarBlankIcon} label="Open Date" value={formatLongDate(ipo.openDate)} />
        <Fact icon={CalendarXIcon} label="Close Date" value={formatLongDate(ipo.closeDate)} />
        <Fact icon={CalendarCheckIcon} label="Allotment" value={formatLongDate(ipo.allotmentDate)} />
        <Fact icon={StorefrontIcon} label="Listing" value={formatLongDate(ipo.listingDate)} />
      </div>

      <p className="mt-2 text-[11px] text-dim">
        Est. profit is lot size × GMP. GMP is unofficial and moves daily.{" "}
        <Link href="/disclaimer" className="underline underline-offset-2 hover:no-underline">
          Disclaimer
        </Link>
      </p>
    </div>
  );
}
