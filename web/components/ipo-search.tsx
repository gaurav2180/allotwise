"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { Input } from "@/components/ui/field";
import { useIpoSearch } from "@/hooks/use-ipo-search";

/**
 * Only the IPO list (at /app) has anything to search — /pans is a list of
 * saved PANs, not issues. Hidden rather than disabled elsewhere, and cleared
 * on the way out so it doesn't silently filter the list on return.
 */
export function IpoSearch() {
  const pathname = usePathname();
  const { query, setQuery } = useIpoSearch();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const onAppPage = pathname === "/app";

  useEffect(() => {
    if (!onAppPage) {
      setOpen(false);
      setQuery("");
    }
    // Only fires on navigation away from /app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAppPage]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!onAppPage) return null;

  function close() {
    setOpen(false);
    setQuery("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search IPOs"
        className="inline-flex size-10 items-center justify-center text-text sm:size-9"
      >
        <MagnifyingGlassIcon size={16} weight="regular" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        placeholder="Search IPOs…"
        aria-label="Search IPOs"
        className="h-10 w-36 sm:h-9 sm:w-48"
      />
      <button
        type="button"
        onClick={close}
        aria-label="Close search"
        className="inline-flex size-10 shrink-0 items-center justify-center text-dim hover:text-text sm:size-9"
      >
        <XIcon size={16} weight="regular" />
      </button>
    </div>
  );
}
