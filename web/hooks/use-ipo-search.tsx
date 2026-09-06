"use client";

import { createContext, useContext, useMemo, useState } from "react";

type IpoSearchValue = { query: string; setQuery: (q: string) => void };

const IpoSearchContext = createContext<IpoSearchValue | null>(null);

/**
 * Lets the header's search box and the IPO list agree on a query without a
 * prop path between them — the header sits outside <main> in the shell
 * layout, so this is the only thing they share.
 */
export function IpoSearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const value = useMemo(() => ({ query, setQuery }), [query]);
  return <IpoSearchContext.Provider value={value}>{children}</IpoSearchContext.Provider>;
}

export function useIpoSearch() {
  const ctx = useContext(IpoSearchContext);
  if (!ctx) throw new Error("useIpoSearch must be used within IpoSearchProvider");
  return ctx;
}
