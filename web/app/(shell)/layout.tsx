import { SiteHeader } from "@/components/site-header";
import { BottomNav } from "@/components/bottom-nav";
import { PageTransition } from "@/components/page-transition";
import { IpoSearchProvider } from "@/hooks/use-ipo-search";

/**
 * Shared shell for /app and /pans. Before this, each page rendered its own
 * SiteHeader and BottomNav, so switching between the two tabs unmounted and
 * remounted the whole chrome — a visible flicker on every nav click. Now the
 * header and bottom nav persist across the navigation; only the page body
 * (wrapped in PageTransition) swaps and cross-fades.
 */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <IpoSearchProvider>
      <div className="min-h-dvh pb-16 sm:pb-0">
        <SiteHeader />
        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          <PageTransition>{children}</PageTransition>
        </main>
        <BottomNav />
      </div>
    </IpoSearchProvider>
  );
}
