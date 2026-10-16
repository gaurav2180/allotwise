"use client";

import { useSyncExternalStore } from "react";
import { localDate } from "@/lib/utils";

/**
 * Today's date for the reader, kept current while the page stays open, and
 * shared: every component that reads it — the tabs, each row's status line,
 * an open row's progress strip — moves to the new day in the same render, so
 * they can never disagree about where an issue stands.
 *
 * One clock for the whole page, not one per component: it is read every
 * minute, and whenever the page comes back into view (a phone resumes a tab
 * without firing timers), and subscribers hear about it only when the date
 * itself has changed.
 *
 * The value is local noon of that date: date-only comparisons give the same
 * answer for any hour, and noon keeps them clear of DST edges. It is the same
 * Date object until the date changes, so memos keyed on it recompute once a day.
 */
const listeners = new Set<() => void>();
let current = localDate();
let snapshot = new Date(`${current}T12:00:00`);
let stop: (() => void) | null = null;

function check() {
  const d = localDate();
  if (d === current) return;
  current = d;
  snapshot = new Date(`${d}T12:00:00`);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!stop) {
    // The tab may have slept through midnight before anything subscribed.
    check();
    const id = window.setInterval(check, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    stop = () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stop) {
      stop();
      stop = null;
    }
  };
}

const getSnapshot = () => snapshot;

export function useToday(): Date {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
