import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { ContactButton } from "@/components/contact-button";
import { ContactForm } from "@/components/contact-form";
import { LogoLockup } from "@/components/logo";
import { LegalLinks } from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Contact — Allotwise",
  description: "Questions, bugs, or feedback about Allotwise — send a message.",
};

export default function ContactPage() {
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
        <h1 className="text-[28px] font-semibold tracking-tight sm:text-[34px]">Contact</h1>
        <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-dim">
          A bug, a wrong number, a registrar we should support — tell us. A real person reads every
          message.
        </p>

        <div className="mt-8">
          <ContactForm />
        </div>

        <p className="mt-8 text-[12px] text-dim">
          Prefer your own mail app? Write to{" "}
          <a href="mailto:allotwise@gmail.com" className="underline underline-offset-2 hover:no-underline">
            allotwise@gmail.com
          </a>{" "}
          directly.
        </p>
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
