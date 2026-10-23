import type { Metadata } from "next";
import { WifiSlashIcon } from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "Offline — Allotwise",
  robots: { index: false },
};

/**
 * Shown by the service worker for a page it never saved while offline. The
 * pages it has saved (the IPO list among them) open as normal; this is only
 * for the rest. A plain link rather than a client-side one, so the retry is a
 * real request the worker can answer.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <span
        className="grid size-12 place-items-center rounded-card"
        style={{ background: "var(--chip-bg)", color: "var(--dim)" }}
        aria-hidden
      >
        <WifiSlashIcon size={22} weight="bold" />
      </span>
      <h1 className="mt-4 text-[18px] font-semibold">You&rsquo;re offline</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-dim">
        This page hasn&rsquo;t been saved for offline use yet. The IPO list opens without a connection, showing the last
        figures you saw; allotment checks need one.
      </p>
      <a
        href="/app"
        className="mt-6 inline-flex h-10 items-center rounded-control border px-4 text-[14px] font-medium"
        style={{ background: "var(--btn-bg)", color: "var(--btn-text)", borderColor: "var(--btn-border)" }}
      >
        Open the IPO list
      </a>
    </main>
  );
}
