import { LegalLinks } from "@/components/legal-shell";

/** Slim legal footer for the app shell — scrolls with content, sits above the fixed bottom nav on mobile. */
export function AppFooter() {
  return (
    <footer className="mt-10 border-t border-border pt-4">
      <LegalLinks />
    </footer>
  );
}
