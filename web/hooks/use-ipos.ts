"use client";

import { useQuery } from "@tanstack/react-query";
import { ipoListSchema, apiErrorSchema, type IpoList } from "@/lib/schemas";

async function fetchIpos(): Promise<IpoList> {
  const res = await fetch("/api/ipos", { cache: "no-store" });
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new Error(parsed.success ? parsed.data.error.message : "The service returned an error.");
  }

  const parsed = ipoListSchema.safeParse(body);
  if (!parsed.success) throw new Error("The IPO data was in an unexpected format.");
  return parsed.data;
}

/** The whole IPO list, shared by every screen that needs a row from it. */
export function useIpos() {
  return useQuery({ queryKey: ["ipos"], queryFn: fetchIpos });
}
