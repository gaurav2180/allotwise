import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightIcon, BankIcon, DeviceMobileIcon, HardDrivesIcon } from "@phosphor-icons/react/dist/ssr";
import { ThemeToggle } from "@/components/theme-toggle";
import { ContactButton } from "@/components/contact-button";
import { LogoLockup } from "@/components/logo";
import { LiveGmp } from "@/components/landing/live-gmp";
import { Ticker } from "@/components/landing/ticker";
import { ExampleCheck } from "@/components/landing/example-check";
import { WeekCalendar } from "@/components/landing/week-calendar";
import { Reveal } from "@/components/landing/reveal";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { LegalLinks } from "@/components/legal-shell";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Allotwise — IPO allotment and grey market premium",
  description:
    "Check IPO allotment for every PAN you apply with, across KFintech, MUFG Intime and Bigshare. Live GMP and subscription for open issues.",
};

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return (
    <Link
      href="/app"
      className="group inline-flex h-11 items-center gap-2 rounded-control border px-5 text-[14px] font-medium transition-transform duration-150 active:scale-[0.98]"
      style={{ background: "var(--btn-bg)", color: "var(--btn-text)", borderColor: "var(--btn-border)" }}
    >
      {children}
      <ArrowRightIcon size={16} weight="bold" aria-hidden className="transition-transform duration-200 group-hover:translate-x-1" />
    </Link>
  );
}

function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center text-[13px] text-dim underline underline-offset-4 transition-colors duration-150 hover:text-text sm:min-h-0"
    >
      {children}
    </Link>
  );
}

const STEPS = [
  { n: "01", title: "Save your PANs once", body: "Label them — You, Papa, Didi. They stay in this browser." },
  { n: "02", title: "Open the IPO", body: "GMP, subscription and the full timeline are already on the row." },
  { n: "03", title: "Tap Check", body: "Every PAN runs against the registrar and lines up, GMP beside it." },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <div className="border-b border-border">
        <header>
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
            <Link href="/" className="-my-1 flex min-h-11 items-center gap-2 rounded-control py-1 sm:min-h-0 sm:py-0">
              <LogoLockup />
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <ContactButton />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <div className="border-t border-border">
          <Ticker />
        </div>

        <section className="mx-auto max-w-6xl px-4 pt-10 pb-14 sm:px-6 sm:pt-14 sm:pb-20">
          <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
            <Reveal>
              <p className="text-[13px] text-dim">
                IPO allotment and grey market premium, for every PAN you apply with
              </p>
              <h1 className="mt-4 text-[36px] leading-[1.02] font-semibold tracking-[-0.04em] sm:text-[48px] lg:text-[56px]">
                Allotment day, without the{" "}
                <span className="whitespace-nowrap" style={{ color: "var(--highlight)" }}>tab chaos.</span>
              </h1>
              <p className="mt-5 max-w-md text-[15px] sm:text-[16px] leading-relaxed text-dim">
                One tap checks every PAN your family applied with, straight from the registrar — and
                shows what the shares are worth beside each result.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
                <PrimaryButton>Open the app</PrimaryButton>
                <TextLink href="#privacy">What happens to my PAN?</TextLink>
              </div>
            </Reveal>

            <Reveal delayMs={120}>
              <LiveGmp />
            </Reveal>
          </div>
        </section>
      </div>

      <main>
        {/* How it works: the steps, beside what one tap actually returns. */}
        <section>
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-20">
            <Reveal className="lg:order-2">
              <div className="mx-auto max-w-sm">
                <ExampleCheck />
              </div>
            </Reveal>

            <Reveal delayMs={100} className="lg:order-1">
              <h2 className="text-[28px] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-[34px]">
                Five tabs and five captchas, or{" "}
                <span style={{ color: "var(--highlight)" }}>one tap.</span>
              </h2>
              <ol className="mt-10 space-y-7">
                {STEPS.map((s) => (
                  <li key={s.n} className="grid grid-cols-[3rem_1fr] gap-x-3 border-t border-border pt-5">
                    <span className="num text-[13px] font-semibold" style={{ color: "var(--highlight)" }}>
                      {s.n}
                    </span>
                    <div>
                      <h3 className="text-[18px] font-medium tracking-[-0.01em]">{s.title}</h3>
                      <p className="mt-1 text-[15px] leading-relaxed text-dim">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Reveal>
          </div>
        </section>

        {/* The week ahead, from the live list. */}
        <section className="border-t border-border">
          <Reveal className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-[28px] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-[34px]">
                  The week ahead.
                </h2>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-dim">
                  Every IPO opening, closing, publishing allotment or listing in the next seven days.
                </p>
              </div>
              <TextLink href="/app">See every IPO</TextLink>
            </div>
            <div className="mt-8">
              <WeekCalendar />
            </div>
          </Reveal>
        </section>

        {/* Privacy — the PAN's whole journey, so "never stored" has a place on the map. */}
        <section id="privacy" className="scroll-mt-4 border-t border-border">
          <Reveal className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="max-w-2xl text-[28px] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-[34px]">
              Your PAN stays on your device.
            </h2>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-dim">
              A PAN is identity data, so the design goal was to never hold it. No sign-up, no profile,
              and nothing to delete later — because there is nothing on our side to delete.
            </p>

            <ol className="mt-12 grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-stretch lg:gap-0">
              <JourneyStop icon={DeviceMobileIcon} title="Your browser" tag="Stored here" tone="positive"
                body="Saved PANs live in this browser's local storage. Clearing browser data removes them." />
              <JourneyArrow />
              <JourneyStop icon={HardDrivesIcon} title="Allotwise" tag="Never stored" tone="highlight"
                body="Passes the PAN to the registrar for the seconds a check takes, and scrubs anything PAN-shaped from every log line." />
              <JourneyArrow />
              <JourneyStop icon={BankIcon} title="The registrar" tag="Answers the check" tone="dim"
                body="KFintech or MUFG Intime answers, exactly as it would on its own site." />
            </ol>
            <div className="mt-5">
              <TextLink href="/privacy">Full privacy policy</TextLink>
            </div>
          </Reveal>
        </section>

        {/* Close — a solid gold band: the one place the page raises its voice. */}
        <section className="aw-gold">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
            <div>
              <h2 className="text-[32px] leading-[1.05] font-semibold tracking-[-0.035em] sm:text-[44px]">
                Next allotment day, check the whole family in one tap.
              </h2>
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
                <PrimaryButton>Open the app</PrimaryButton>
                <span className="text-[14px] text-dim">Free. No sign-up.</span>
              </div>
            </div>
            <div className="border-t border-border pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
              <h3 className="text-[16px] font-semibold">Alerts are next</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-dim">
                A message the moment allotment for an IPO you applied to is published. Leave an address
                to hear when that lands.
              </p>
              <div className="mt-4">
                <WaitlistForm />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-7 sm:px-6">
          <p className="text-[12px] text-dim">
            Allotwise is an independent tool. It is not affiliated with any registrar or exchange.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <LegalLinks />
          </div>
        </div>
      </footer>
    </div>
  );
}

type Icon = React.ComponentType<{ size?: number; weight?: "regular"; className?: string }>;

function JourneyStop({
  icon: Icon,
  title,
  body,
  tag,
  tone,
}: {
  icon: Icon;
  title: string;
  body: string;
  tag: string;
  tone: "positive" | "highlight" | "dim";
}) {
  return (
    <li className={cn("rounded-card border border-border bg-surface p-6")}>
      <div className="flex items-center justify-between gap-3">
        <Icon size={22} weight="regular" className="text-dim" />
        <span className="text-[12px] font-medium" style={{ color: `var(--${tone})` }}>
          {tag}
        </span>
      </div>
      <h3 className="mt-6 text-[18px] font-medium tracking-[-0.01em]">{title}</h3>
      <p className="mt-1.5 text-[14px] leading-relaxed text-dim">{body}</p>
    </li>
  );
}

function JourneyArrow() {
  return (
    <li aria-hidden className="flex items-center justify-center py-0.5 text-dim lg:px-4 lg:py-0">
      <ArrowRightIcon size={18} className="rotate-90 lg:rotate-0" />
    </li>
  );
}
