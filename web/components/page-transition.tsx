"use client";

import { usePathname } from "next/navigation";

/**
 * Keyed by pathname so the wrapper remounts on every navigation within the
 * app shell, replaying `aw-page-fade-in` instead of the content just snapping
 * in. The shell itself (SiteHeader, BottomNav) lives in the layout above this
 * and is untouched by the remount — only the page body swaps.
 *
 * IPOs <-> PANs is the app's core tab switch, clicked repeatedly in one
 * session — `aw-fade-in` (400ms, blurred) is tuned for a skeleton resolving
 * into data and read as the switch itself lagging. This is a fast,
 * blur-free variant that just softens the hard cut.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="aw-page-fade-in">
      {children}
    </div>
  );
}
