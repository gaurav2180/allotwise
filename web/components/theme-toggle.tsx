"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";

/**
 * The new theme spreads out from the toggle as a growing circle, like water
 * from where it was poured. Built on the View Transitions API: the browser
 * snapshots the page, the theme switches underneath, and the snapshot of the
 * new theme is revealed through an expanding clip. Browsers without the API,
 * and anyone who prefers reduced motion, get the plain instant switch.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    const next = isDark ? "light" : "dark";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!("startViewTransition" in document) || reduce) {
      setTheme(next);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    // Far enough to reach the corner furthest from the button.
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    const transition = document.startViewTransition(() => {
      // The new snapshot is taken as soon as this returns, so the theme has to
      // be on the page by then — next-themes applies its class in an effect,
      // which would be too late. Set it directly, then let next-themes catch
      // up and persist the choice.
      const root = document.documentElement;
      root.classList.remove(isDark ? "dark" : "light");
      root.classList.add(next);
      root.style.colorScheme = next;
      flushSync(() => setTheme(next));
    });

    transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 1000, easing: "cubic-bezier(0.25, 0.8, 0.3, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex size-10 items-center justify-center text-text sm:size-9"
      aria-label={mounted ? (isDark ? "Switch to light theme" : "Switch to dark theme") : "Switch theme"}
    >
      {/* Render a stable icon until mounted so SSR and client agree. */}
      {mounted && isDark ? <SunIcon size={16} weight="regular" /> : <MoonIcon size={16} weight="regular" />}
    </button>
  );
}
