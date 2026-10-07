import type { Metadata } from "next";
import { Suspense } from "react";
import { GmpPage, GmpPageSkeleton } from "@/components/gmp-history";

export const metadata: Metadata = {
  title: "IPO GMP — Allotwise",
};

// Static, like /app and /pans, so opening it from the list never waits on the
// server: the IPO comes from `?ipo=` and its data from the client cache.
export default function IpoGmpPage() {
  return (
    <Suspense fallback={<GmpPageSkeleton />}>
      <GmpPage />
    </Suspense>
  );
}
