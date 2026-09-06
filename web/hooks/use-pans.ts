"use client";

import { useCallback, useEffect, useState } from "react";
import { loadPans, savePans, newPanId, type PanEntry } from "@/lib/pan";

const CHANGED_EVENT = "allotwise:pans-changed";

/**
 * The saved-PAN list, backed by localStorage.
 *
 * `ready` distinguishes "still reading storage" from "storage is genuinely
 * empty" — the main screen shows different things for those two, so they must
 * not be conflated during the first paint.
 */
export function usePans() {
  const [pans, setPans] = useState<PanEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPans(loadPans());
    setReady(true);

    // Keep every mounted consumer in sync, including other tabs.
    const sync = () => setPans(loadPans());
    window.addEventListener(CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const commit = useCallback((next: PanEntry[]) => {
    savePans(next);
    setPans(next);
    window.dispatchEvent(new Event(CHANGED_EVENT));
  }, []);

  const add = useCallback(
    (label: string, pan: string) => {
      const current = loadPans();
      if (current.some((p) => p.pan === pan)) return { ok: false as const, reason: "duplicate" as const };
      commit([...current, { id: newPanId(), label, pan }]);
      return { ok: true as const };
    },
    [commit]
  );

  const remove = useCallback(
    (id: string) => commit(loadPans().filter((p) => p.id !== id)),
    [commit]
  );

  const rename = useCallback(
    (id: string, label: string) =>
      commit(loadPans().map((p) => (p.id === id ? { ...p, label } : p))),
    [commit]
  );

  return { pans, ready, add, remove, rename };
}
