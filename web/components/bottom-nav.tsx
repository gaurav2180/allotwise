"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartLineUpIcon, IdentificationCardIcon } from "@phosphor-icons/react";
import { usePans } from "@/hooks/use-pans";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/app", label: "IPOs", Icon: ChartLineUpIcon },
  { href: "/pans", label: "PANs", Icon: IdentificationCardIcon },
];

/**
 * Thumb-reachable navigation on phones only; the top bar keeps the same two
 * destinations from `sm` up, so nothing is duplicated on screen at once.
 */
export function BottomNav() {
  const pathname = usePathname();
  // `ready` gates the count so the first client render matches the server's
  // (both render nothing) rather than tripping hydration on localStorage.
  const { pans, ready } = usePans();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <div className="flex">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                active ? "text-text" : "text-dim"
              )}
            >
              <Icon size={19} weight={active ? "fill" : "regular"} aria-hidden />
              <span className="flex items-center gap-1">
                {label}
                {href === "/pans" && ready && pans.length > 0 && (
                  <span
                    className="num rounded-pill px-1.5 text-[10px] leading-normal font-medium"
                    style={{ background: "var(--chip-bg)", color: "var(--dim)" }}
                  >
                    {pans.length}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
