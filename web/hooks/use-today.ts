"use client";

import { useEffect, useMemo, useState } from "react";
import { localDate } from "@/lib/utils";

/**
 * Today's date for the reader, kept current while the page stays open.
 *
 * Everything that sorts IPOs into tabs is decided by the calendar date, so a
 * list left open overnight would otherwise keep showing yesterday's tabs. The
 * clock is read every minute and whenever the page comes back into view (a
 * phone resumes a tab without firing timers), but the returned Date only
 * changes when the date does, so memos keyed on it recompute once a day.
 *
 * It is local noon of that date: date-only comparisons give the same answer
 * for any hour, and noon keeps them clear of DST edges.
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => localDate());

  useEffect(() => {
    const check = () => setToday(localDate());
    const id = window.setInterval(check, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, []);

  return useMemo(() => new Date(`${today}T12:00:00`), [today]);
}
