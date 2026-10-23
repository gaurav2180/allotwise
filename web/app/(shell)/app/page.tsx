import type { Metadata } from "next";
import { IpoList } from "@/components/ipo-list";
import { AppFooter } from "@/components/app-footer";
import { InstallCard } from "@/components/pwa";

export const metadata: Metadata = {
  title: "IPOs — Allotwise",
};

export default function AppPage() {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">IPOs</h1>
        <p className="mt-1 text-[13px] text-dim">
          Grey market premium and subscription for current issues. Expand a row to check allotment
          for your saved PANs.
        </p>
      </div>
      <InstallCard />
      <IpoList />
      <AppFooter />
    </>
  );
}
