"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { IpoSearch } from "@/components/ipo-search";
import { LogoLockup } from "@/components/logo";
import { usePans } from "@/hooks/use-pans";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/app", label: "IPOs" },
  { href: "/pans", label: "PANs" },
];

export function SiteHeader() {
  const pathname = usePathname();
  // `ready` gates the count so the first client render matches the server's.
  const { pans, ready } = usePans();

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/app" className="-my-1 flex min-h-11 items-center gap-2 rounded-control py-1 sm:min-h-0 sm:py-0">
          <LogoLockup />
        </Link>

        {/* Hidden on phones, where BottomNav carries the same destinations. */}
        <nav className="ml-2 hidden items-center gap-1 sm:flex" aria-label="Main">
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-pill px-3.5 py-2.5 text-[13px] font-medium transition-colors duration-150 sm:px-3 sm:py-1.5",
                  active ? "bg-chip text-text" : "text-dim hover:text-text"
                )}
              >
                {n.label}
                {/* Same label-then-count shape the filter tabs use, so the two
                    read as one convention rather than two. */}
                {n.href === "/pans" && ready && pans.length > 0 && (
                  <span className="num text-[12px] font-normal text-dim">{pans.length}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <IpoSearch />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
