import type { Metadata } from "next";
import { PanManager } from "@/components/pan-manager";
import { AppFooter } from "@/components/app-footer";

export const metadata: Metadata = {
  title: "PANs — Allotwise",
};

export default function PansPage() {
  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">PANs</h1>
        <p className="mt-1 text-[13px] text-dim">
          The PANs you apply with — every check runs all of them.
        </p>
      </div>
      <PanManager />
      <AppFooter />
    </>
  );
}
