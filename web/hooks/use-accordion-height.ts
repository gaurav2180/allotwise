"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

/**
 * Measured-height expand/collapse — replaces the CSS `grid-template-rows`
 * (`0fr`/`1fr`) technique previously used for this. That technique forces the
 * browser to re-run its full grid track-sizing algorithm every animation
 * frame, which is expensive enough to read as janky on mobile WebKit
 * regardless of easing curve.
 *
 * Once the open transition finishes, height is released to `auto` rather
 * than held at a measured pixel value with a ResizeObserver watching it. This
 * matters because these nest — the GMP-history accordion sits inside the IPO
 * row's own accordion. Two JS-measured wrappers both reacting to each other's
 * size changes fight: the outer one either re-triggers mid-flight on every
 * frame of the inner one's own transition (a stutter, chasing a moving
 * target), or — if that's debounced — visibly lags behind it (the chart
 * opens, and the row underneath doesn't grow to fit until well after). At
 * `auto`, neither problem exists: a nested accordion's own transition (or an
 * async fetch swapping a skeleton for real content) just reflows this
 * wrapper for free, in the same frame, with no JS involved at this level at
 * all — only this accordion's own open/close still gets an explicit
 * measured-height animation, which is the only thing that ever needs one.
 *
 * Takes the inner ref rather than creating and returning one — a ref
 * travelling back out through a hook-returned object is exactly the shape
 * the React Compiler's ref-safety lint can't verify, so the caller owns it
 * and passes it in directly as `ref={innerRef}`, the same as any other ref.
 */
export function useAccordionHeight(open: boolean, innerRef: RefObject<HTMLDivElement | null>) {
  const [height, setHeight] = useState<number | "auto">(0);

  useLayoutEffect(() => {
    const node = innerRef.current;
    if (!node) return;

    if (open) {
      setHeight(node.scrollHeight);
      // Hold the measured value for exactly one transition, then let the
      // wrapper size itself naturally — matches --dur-accordion.
      const t = setTimeout(() => setHeight("auto"), 300);
      return () => clearTimeout(t);
    }

    // Can't transition away from `auto` directly — pin to the current
    // rendered height first (a no-op visually, since it's the same value
    // `auto` was already resolving to), let that paint, then collapse to 0.
    setHeight(node.scrollHeight);
    const raf = requestAnimationFrame(() => setHeight(0));
    return () => cancelAnimationFrame(raf);
  }, [open, innerRef]);

  const outerStyle: CSSProperties = {
    height,
    overflow: height === "auto" ? "visible" : "hidden",
    transition: "height var(--dur-accordion) var(--ease-reveal)",
  };

  const innerStyle: CSSProperties = {
    opacity: open ? 1 : 0,
    transform: open ? "translateY(0)" : "translateY(-4px)",
    transition: "opacity var(--dur-accordion) ease-out, transform var(--dur-accordion) var(--ease-reveal)",
  };

  // Height + overflow only clips the panel visually — its buttons and links
  // stay focusable and stay in the accessibility tree. On the IPO list that
  // meant tabbing walked through a dozen invisible "Check PANs" buttons, one
  // per collapsed row. `inert` removes the whole subtree from both.
  return { outerStyle, innerStyle, inert: !open };
}
