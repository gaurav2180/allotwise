import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell, LegalSection } from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Terms — Allotwise",
  description: "The terms that govern using Allotwise to check IPO allotment and view grey market premium.",
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of use" updated="5 September 2026">
      <LegalSection title="1. Agreement">
        <p>
          These terms govern use of Allotwise — the allotment-status, grey market premium, subscription and
          IPO-calendar tool at this site. Using it means agreeing to these terms. If you don&rsquo;t agree,
          don&rsquo;t use the site.
        </p>
        <p>
          Allotwise is operated by an individual, not (yet) a registered company. See{" "}
          <Link href="/disclaimer" className="underline underline-offset-2 hover:no-underline">
            Disclaimer
          </Link>{" "}
          for what that means for the data shown here.
        </p>
      </LegalSection>

      <LegalSection title="2. What the service does">
        <p>
          Allotwise looks up IPO allotment status against the registrar for the IPO you pick (KFintech or Link
          Intime / MUFG Intime today; Bigshare is a deep link to Bigshare&rsquo;s own status page, since its
          captcha can&rsquo;t be solved automatically). Alongside that, it shows grey market premium, live
          subscription figures, and an IPO calendar, gathered from the public sources named in the{" "}
          <Link href="/disclaimer" className="underline underline-offset-2 hover:no-underline">
            Disclaimer
          </Link>
          .
        </p>
        <p>
          Some features referenced in the product — allotment alerts — are still being built and are not
          available yet.
        </p>
      </LegalSection>

      <LegalSection title="3. No account, and who may use it">
        <p>
          There is no sign-up. Anything you save (a PAN, a label) lives in your browser only — see{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:no-underline">
            Privacy
          </Link>
          .
        </p>
        <p>
          By running a check you confirm the PAN belongs to you, or to someone who has authorised you to check
          allotment on their behalf (a family member, for instance), and that you are not violating any law or
          any third party&rsquo;s rights by entering it.
        </p>
      </LegalSection>

      <LegalSection title="4. Acceptable use">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Don&rsquo;t use a PAN you are not authorised to check.</li>
          <li>
            Don&rsquo;t attempt to bypass, exceed, or automate around the rate limits described on this site,
            or scrape the service at volumes beyond normal individual use.
          </li>
          <li>Don&rsquo;t attempt to interfere with, disrupt, or reverse-engineer the service.</li>
          <li>Don&rsquo;t use the service for any unlawful purpose.</li>
        </ul>
        <p>Access may be limited or blocked for anyone who doesn&rsquo;t follow these.</p>
      </LegalSection>

      <LegalSection title="5. Rate limits">
        <p>
          The service limits how many allotment checks an IP address or a single PAN can run in a given
          window, to keep it available for everyone. Hitting a limit means waiting for the window to reset —
          it is not a fault in the check itself.
        </p>
      </LegalSection>

      <LegalSection title="6. Third-party data and services">
        <p>
          Allotment results, GMP, subscription figures, and calendar dates come from registrars, exchanges,
          and public trackers Allotwise does not operate or control. Their availability, accuracy, and
          timeliness are outside Allotwise&rsquo;s control — see{" "}
          <Link href="/disclaimer" className="underline underline-offset-2 hover:no-underline">
            Disclaimer
          </Link>{" "}
          for the full list and its limits.
        </p>
      </LegalSection>

      <LegalSection title="7. Intellectual property">
        <p>
          The Allotwise name, logo, and site design belong to its operator. Market data shown on the site
          belongs to its respective source (the registrar, exchange, or tracker named alongside it) and is
          displayed for reference, not redistribution.
        </p>
      </LegalSection>

      <LegalSection title="8. No warranty">
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of
          any kind, express or implied — including accuracy, uninterrupted availability, or fitness for a
          particular purpose. Full detail is in{" "}
          <Link href="/disclaimer" className="underline underline-offset-2 hover:no-underline">
            Disclaimer
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="9. Limitation of liability">
        <p>
          To the fullest extent the law allows, Allotwise and its operator are not liable for any loss —
          financial or otherwise — arising from use of, or reliance on, this site.
        </p>
      </LegalSection>

      <LegalSection title="10. Changes">
        <p>
          The service and these terms may change as the product develops. Continuing to use the site after a
          change means you accept the updated terms. The date at the top of this page reflects the current
          version.
        </p>
      </LegalSection>

      <LegalSection title="11. Governing law">
        <p>
          These terms are governed by the laws of India, and the courts of India have jurisdiction over any
          dispute arising from them.
        </p>
      </LegalSection>

      <LegalSection title="12. Contact">
        <p>
          Questions about these terms:{" "}
          <a href="mailto:allotwise@gmail.com" className="underline underline-offset-2 hover:no-underline">
            allotwise@gmail.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
