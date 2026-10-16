"use client";

import { useEffect, useRef } from "react";

export type SwipeDirection = "left" | "right";

/**
 * Whether a finished touch was a deliberate sideways swipe.
 *
 * Pure, so the thresholds are tested rather than tuned by feel on one phone:
 * - far enough to be meant: 56px, roughly a third of a thumb's sweep;
 * - clearly sideways: at least twice as wide as it is tall, so the slight drift
 *   of a vertical scroll never reads as a swipe;
 * - quick, or long: a flick inside 600ms, or a slow drag across a third of the
 *   screen. A slow, short drag is someone reading with a finger on the glass.
 */
export function swipeDirection({
  dx,
  dy,
  dt,
  width,
}: {
  dx: number;
  dy: number;
  dt: number;
  width: number;
}): SwipeDirection | null {
  const ax = Math.abs(dx);
  if (ax < 56 || ax < Math.abs(dy) * 2) return null;
  if (dt > 600 && ax < width / 3) return null;
  return dx < 0 ? "left" : "right";
}

// Gestures that start here belong to the element, not the page.
const OWN_GESTURES =
  'input, textarea, select, [contenteditable="true"], [data-no-swipe], [role="slider"]';
// The system back gesture starts at the screen edge on both iOS and Android.
const EDGE = 24;

/** True when the touch began inside something that scrolls sideways itself. */
function inHorizontalScroller(el: Element | null): boolean {
  for (
    let node = el;
    node && node !== document.body;
    node = node.parentElement
  ) {
    if (node.scrollWidth > node.clientWidth + 1) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return true;
    }
  }
  return false;
}

/**
 * Calls `onSwipe` for a sideways swipe anywhere on the page, for as long as the
 * calling component is mounted and `enabled` holds.
 *
 * Listeners are passive and nothing is prevented: vertical scrolling stays the
 * browser's own, and a gesture that turns out not to be a swipe costs nothing.
 * Touch only -- a mouse drag on a desktop selects text, as it should.
 */
export function useSwipe(
  onSwipe: (dir: SwipeDirection) => void,
  enabled = true,
) {
  // Read through refs so the listeners are attached once, not on every render.
  const handler = useRef(onSwipe);
  const on = useRef(enabled);
  useEffect(() => {
    handler.current = onSwipe;
    on.current = enabled;
  });

  useEffect(() => {
    let start: { x: number; y: number; t: number } | null = null;
    let last: { x: number; y: number } | null = null;

    const reset = () => {
      start = null;
      last = null;
    };

    const onStart = (e: TouchEvent) => {
      reset();
      if (!on.current || e.touches.length !== 1) return;
      // Zoomed in, a sideways drag is panning the page.
      if (window.visualViewport && window.visualViewport.scale > 1.01) return;
      // A dialog over the page owns every gesture.
      if (document.querySelector('[aria-modal="true"]')) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(OWN_GESTURES) || inHorizontalScroller(target)) return;
      const t = e.touches[0];
      if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return;
      start = { x: t.clientX, y: t.clientY, t: e.timeStamp };
      last = { x: t.clientX, y: t.clientY };
    };

    const onMove = (e: TouchEvent) => {
      if (!start) return;
      // A second finger makes it a pinch.
      if (e.touches.length !== 1) return reset();
      last = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const onEnd = (e: TouchEvent) => {
      if (!start || !last) return reset();
      const end = e.changedTouches[0] ?? last;
      const dir = swipeDirection({
        dx: end.clientX - start.x,
        dy: end.clientY - start.y,
        dt: e.timeStamp - start.t,
        width: window.innerWidth,
      });
      reset();
      // Text being selected by a long-press drag is not a swipe either.
      if (dir && !window.getSelection()?.toString()) handler.current(dir);
    };

    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener("touchstart", onStart, opts);
    window.addEventListener("touchmove", onMove, opts);
    window.addEventListener("touchend", onEnd, opts);
    window.addEventListener("touchcancel", reset, opts);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", reset);
    };
  }, []);
}
