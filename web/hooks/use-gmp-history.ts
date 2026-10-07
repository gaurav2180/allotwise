"use client";

import { gmpHistorySchema, type GmpHistory } from "@/lib/schemas";

async function fetchGmpHistory(slug: string): Promise<GmpHistory> {
  const res = await fetch(`/api/gmp/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("unavailable");
  const parsed = gmpHistorySchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("shape");
  return parsed.data;
}

/** Link to one IPO's GMP page. A query string, so the page itself is static. */
export const gmpHref = (slug: string) => `/gmp?ipo=${encodeURIComponent(slug)}`;

/** Set by the list's Day-wise GMP link, so Back can return to the exact spot. */
export const FROM_LIST_KEY = "aw:gmp-from-list";

/** One definition, so a prefetch from the list and the GMP page share a cache entry. */
export const gmpHistoryQuery = (slug: string) => ({
  queryKey: ["gmp-history", slug] as const,
  queryFn: () => fetchGmpHistory(slug),
  staleTime: 5 * 60_000,
});
