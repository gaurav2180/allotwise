"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Fades a section up into place the first time it crosses into view, then
 * leaves it alone — a one-way reveal, not a scroll-linked toggle, and
 * landing-page only. The app shell's MOTION budget is reserved for state
 * changes (tabs, accordion, numbers); this is the one place entrance
 * decoration earns its keep, since the page's whole job on a first visit is
 * to be scrolled through.
 *
 * `prefers-reduced-motion` needs no extra handling here — the global guard in
 * globals.css collapses every transition duration to ~0, so this still
 * reveals correctly, just without the motion.
 */
export function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Old-browser fallback: show the content rather than leave it hidden.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        // Once. Scrolling back up must not re-hide and replay it.
        observer.disconnect();
      },
      // Fires a little before the section is fully on-screen, so the
      // animation finishes by the time it's actually being read rather than
      // still settling under the reader's eye.
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("aw-reveal", visible && "aw-reveal-visible", className)}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
