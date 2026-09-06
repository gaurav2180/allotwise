import Link from "next/link";
import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoLockup } from "@/components/logo";
import { LiveGmp } from "@/components/landing/live-gmp";
import { Reveal } from "@/components/landing/reveal";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { LegalLinks } from "@/components/legal-shell";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Allotwise — IPO allotment and grey market premium",
  description:
    "Check IPO allotment for every PAN you apply with, across KFintech, MUFG Intime and Bigshare. Live GMP and subscription for open issues.",
};

/** Small text link with the one hover accent this page uses. */
function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center text-[12px] text-dim underline underline-offset-2 transition-colors duration-150 hover:text-(--highlight) hover:no-underline sm:min-h-0"
    >
      {children}
    </Link>
  );
}

const REGISTRARS = [
  { name: "KFintech", how: "Queried directly", live: true },
  { name: "MUFG Intime", how: "Queried directly", live: true },
  { name: "Bigshare", how: "Deep link — captcha", live: false },
];

const STEPS = [
  {
    n: "01",
    title: "Add your PANs",
    body: "Yours, your father's, your sister's — labelled and saved to this browser only.",
  },
  {
    n: "02",
    title: "Pick an open IPO",
    body: "See grey market premium and subscription for every mainboard and SME issue, live.",
  },
  {
    n: "03",
    title: "Check the whole list",
    body: "One tap runs every saved PAN against the registrar and lines up the results.",
  },
];

const PRIVACY_POINTS = [
  {
    title: "Stored in your browser only",
    body: "Saved PANs live in this browser's local storage. There is no account, and no copy on our side.",
  },
  {
    title: "Passed through, not kept",
    body: "During a check the PAN travels to the registrar and is discarded when the response returns. No table stores it.",
  },
  {
    title: "Kept out of the logs",
    body: "The service scrubs anything PAN-shaped from every log line, so a stray log call cannot leak one.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="-my-1 flex min-h-11 items-center gap-2 rounded-control py-1 sm:min-h-0 sm:py-0"
          >
            <LogoLockup />
          </Link>
          {/* No CTA up here. A header "Open the app" would only ever be on
              screen at the same moment as the hero's — this header does not
              stick, so it scrolls away with the hero rather than persisting
              past it. Two identical buttons 200px apart, and the hero is the
              one in the reading flow. The footer keeps a quiet link for
              anyone who reaches the bottom. */}
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main>
        {/* Hero — asymmetric: argument on the left, the working product on the right. */}
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
            <Reveal>
              <h1 className="text-[34px] leading-[1.1] font-semibold tracking-tight sm:text-[44px]">
                Allotment day, without the{" "}
                <span style={{ color: "var(--highlight)" }}>browser-tab chaos</span>.
              </h1>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-dim">
                Allotment day used to mean five browser tabs, five captchas, and five PANs typed one at
                a time — yours, your father&rsquo;s, your sister&rsquo;s, your spouse&rsquo;s. Allotwise
                runs the whole list in one pass, against every registrar that matters, with the grey
                market premium sitting right beside it.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/app"
                  className="inline-flex h-10 items-center rounded-control border px-5 text-sm font-medium"
                  style={{
                    background: "var(--btn-bg)",
                    color: "var(--btn-text)",
                    borderColor: "var(--btn-border)",
                  }}
                >
                  Open the app
                </Link>
                <Link
                  href="#privacy"
                  className="inline-flex h-10 items-center rounded-control px-2 text-sm text-dim underline underline-offset-4 hover:text-text"
                >
                  What happens to my PAN?
                </Link>
              </div>
            </Reveal>

            <Reveal delayMs={120} className="lg:pl-4">
              <LiveGmp />
            </Reveal>
          </div>
        </section>

        {/* How it works — a bordered panel with real internal dividers, not floating text. */}
        <section className="border-t border-border">
          <Reveal className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
            <p className="text-[11px] font-semibold tracking-wide text-dim uppercase">How it works</p>
            <h2 className="mt-1.5 text-[22px] font-semibold tracking-tight">Three steps, once a day</h2>
            <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-dim">
              Set it up once. From then on, allotment day is a single tap.
            </p>

            <div className="mt-8 overflow-hidden rounded-card border border-border">
              <ol className="grid sm:grid-cols-3">
                {STEPS.map((s, i) => (
                  <li
                    key={s.n}
                    className={cn(
                      "bg-surface p-6",
                      i > 0 && "border-t border-border sm:border-t-0 sm:border-l"
                    )}
                  >
                    <span className="num text-[32px] font-semibold" style={{ color: "var(--highlight)" }}>
                      {s.n}
                    </span>
                    <h3 className="mt-2 text-[15px] font-medium">{s.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-dim">{s.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </section>

        {/* Features — deliberately unequal blocks rather than three matching cards. */}
        <section className="border-t border-border">
          <Reveal className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Wide block: the thing the product is actually for. */}
              <div className="rounded-card border border-border bg-surface p-6 lg:col-span-2">
                <span className="num text-[11px] font-semibold tracking-wide" style={{ color: "var(--highlight)" }}>
                  01
                </span>
                <h2 className="mt-2 text-[17px] font-medium">One check, every PAN</h2>
                <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-dim">
                  Save the PANs you apply with and label them. Expanding an IPO runs all of them in
                  sequence and shows each result on its own line — allotted with the share count,
                  not allotted, or no application found under that PAN. Those are three different
                  answers and Allotwise says which one you got.
                </p>
                <ul className="mt-5 flex flex-wrap gap-2">
                  {REGISTRARS.map((r) => (
                    <li
                      key={r.name}
                      className="flex items-center gap-2 rounded-pill border border-border bg-chip px-3 py-1.5"
                    >
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: r.live ? "var(--positive)" : "var(--dim)" }}
                        aria-hidden
                      />
                      <span className="text-[13px] font-medium">{r.name}</span>
                      <span className="text-[11px] text-dim">{r.how}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Narrow block: the honest caveat, given its own space. */}
              <div className="rounded-card border border-border bg-surface p-6">
                <span className="num text-[11px] font-semibold tracking-wide" style={{ color: "var(--highlight)" }}>
                  02
                </span>
                <h2 className="mt-2 text-[17px] font-medium">Where the numbers come from</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-dim">
                  Allotment comes from the registrars themselves. Subscription figures come from NSE
                  for mainboard issues and IPO Ji for SME. Grey market premium is scraped from public
                  trackers and is unofficial by nature — it is an indication of sentiment, not a
                  quoted price.
                </p>
                <div className="mt-3">
                  <TextLink href="/disclaimer">Full disclaimer</TextLink>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* Privacy — a product feature, so it gets a section, not a settings page. */}
        <section id="privacy" className="border-t border-border scroll-mt-4">
          <Reveal className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,5fr)] lg:gap-12">
              <div>
                <h2 className="text-[22px] font-semibold tracking-tight">
                  Your PAN stays on your device
                </h2>
                <p className="mt-3 text-[14px] leading-relaxed text-dim">
                  A PAN is identity data, so the design goal was to never hold it. There is no
                  sign-up, no profile, and nothing to delete later — because there is nothing on our
                  side to delete.
                </p>
                <p className="mt-3 text-[13px] leading-relaxed text-dim">
                  Clearing your browser data removes every PAN you saved.
                </p>
                <div className="mt-3">
                  <TextLink href="/privacy">Full privacy policy</TextLink>
                </div>
              </div>
              <ol className="space-y-4">
                {PRIVACY_POINTS.map((p, i) => (
                  <li key={p.title} className="flex gap-4">
                    <span className="num mt-0.5 text-[12px] font-normal text-dim">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="text-[14px] font-medium">{p.title}</h3>
                      <p className="mt-1 text-[13px] leading-relaxed text-dim">{p.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </section>

        {/* What's next — reframed from a gap to a benefit, still honest about status. */}
        <section className="border-t border-border">
          <Reveal className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
            <h2 className="text-[22px] font-semibold tracking-tight">
              Checking works today. Alerts are next.
            </h2>
            <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-dim">
              Allotment checking and grey market premium work right now — no sign-up, and your PAN
              never leaves the browser.
            </p>

            {/* The closing action, and the only one on the page after the hero.
                The header CTA that used to cover this scrolled away with the
                hero, so a reader convinced by the privacy section had nothing
                to act on but a 12px footer link. */}
            <div className="mt-6">
              <Link
                href="/app"
                className="inline-flex h-10 items-center rounded-control border px-5 text-sm font-medium"
                style={{
                  background: "var(--btn-bg)",
                  color: "var(--btn-text)",
                  borderColor: "var(--btn-border)",
                }}
              >
                Open the app
              </Link>
            </div>

            {/* Secondary, and deliberately below the working product: an email
                for a feature that does not exist yet is the smaller ask, and
                it used to be the page's final word. */}
            <div className="mt-8 max-w-xl border-t border-border pt-6">
              <p className="text-[14px] leading-relaxed text-dim">
                Alerts — a message the instant allotment for an IPO you applied to is published —
                are being built next. Leave an address to hear when that lands.
              </p>
              <div className="mt-4">
                <WaitlistForm />
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-6">
          <p className="text-[12px] text-dim">
            Allotwise is an independent tool. It is not affiliated with any registrar or exchange.
          </p>
          {/* No "Open the app" here either: the closing section directly above
              ends on that exact button, so a footer link repeats it inside the
              same viewport — the same duplication the header had, just at the
              other end of the page. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <LegalLinks />
          </div>
        </div>
      </footer>
    </div>
  );
}
