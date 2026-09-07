import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { ContactButton } from "@/components/contact-button";
import { LogoLockup } from "@/components/logo";

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/contact", label: "Contact" },
];

const LINK_CLASS =
  "inline-flex min-h-11 items-center text-[12px] text-dim underline underline-offset-2 hover:text-text hover:no-underline sm:min-h-0";

/** Inline legal links plus Contact, reused in the landing footer and the app-shell footer. */
export function LegalLinks({ except }: { except?: string }) {
  const links = LEGAL_LINKS.filter((l) => l.href !== except);
  return (
    <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={LINK_CLASS}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** Shared chrome for the three legal pages — same header/footer language as the landing page. */
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="-my-1 flex min-h-11 items-center gap-2 rounded-control py-1 sm:min-h-0 sm:py-0"
          >
            <LogoLockup />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ContactButton />
            <ThemeToggle />
            <Link
              href="/app"
              className="inline-flex h-10 items-center rounded-control border px-4 text-sm font-medium sm:h-9"
              style={{
                background: "var(--btn-bg)",
                color: "var(--btn-text)",
                borderColor: "var(--btn-border)",
              }}
            >
              Open the app
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-[28px] font-semibold tracking-tight sm:text-[34px]">{title}</h1>
        <p className="mt-2 text-[12px] text-dim">Last updated {updated}</p>
        <div className="mt-8 space-y-8">{children}</div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-6">
          <p className="text-[12px] text-dim">
            Allotwise is an independent tool. It is not affiliated with any registrar or exchange.
          </p>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      <div className="mt-2.5 space-y-3 text-[14px] leading-relaxed text-dim">{children}</div>
    </section>
  );
}

/** Visibly marks a fact this page cannot state honestly yet (no operator identity exists). */
export function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-control px-1.5 py-0.5 font-medium"
      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
    >
      {children}
    </span>
  );
}
