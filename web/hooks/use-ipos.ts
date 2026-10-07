"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ipoListSchema, apiErrorSchema, type IpoList } from "@/lib/schemas";

declare global {
  interface Window {
    /** Started by the inline script in app/layout.tsx, before any bundle runs. */
    __awIpos?: Promise<Response>;
  }
}

const QUERY_KEY = ["ipos"] as const;
const STORE_KEY = "aw:ipos:v1";
// A remembered list older than this is not worth showing even briefly.
const STORE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function remember(data: IpoList) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {}
}

function recall(): { at: number; data: IpoList } | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (typeof at !== "number" || Date.now() - at > STORE_MAX_AGE_MS) return null;
    const parsed = ipoListSchema.safeParse(data);
    return parsed.success ? { at, data: parsed.data } : null;
  } catch {
    return null;
  }
}

async function fetchIpos(): Promise<IpoList> {
  // Use the request the page head already started, once; later refetches go
  // to the network as usual.
  const early = typeof window !== "undefined" ? window.__awIpos : undefined;
  if (early) window.__awIpos = undefined;
  const res = (early && (await early.catch(() => null))) || (await fetch("/api/ipos", { cache: "no-store" }));
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new Error(parsed.success ? parsed.data.error.message : "The service returned an error.");
  }

  const parsed = ipoListSchema.safeParse(body);
  if (!parsed.success) throw new Error("The IPO data was in an unexpected format.");
  remember(parsed.data);
  return parsed.data;
}

/**
 * The whole IPO list, shared by every screen that needs a row from it.
 *
 * The last list this device saw is shown straight away while the fresh one
 * loads, so a returning visitor never waits on a skeleton. It is restored
 * after mount rather than passed as initial data, so the server-rendered
 * skeleton and the first client render still agree.
 */
export function useIpos() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (queryClient.getQueryData(QUERY_KEY)) return;
    const saved = recall();
    if (saved) queryClient.setQueryData(QUERY_KEY, saved.data, { updatedAt: saved.at });
  }, [queryClient]);

  return useQuery({ queryKey: QUERY_KEY, queryFn: fetchIpos });
}
