import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell, LegalSection } from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Disclaimer — Allotwise",
  description: "What the numbers on Allotwise are, and are not — GMP, estimates, and allotment results.",
};

export default function DisclaimerPage() {
  return (
    <LegalShell title="Disclaimer" updated="5 September 2026">
      <LegalSection title="1. Independent, unofficial tool">
        <p>
          Allotwise is an independent tool built to read data that registrars, exchanges, and public trackers
          already publish. It is not affiliated with, endorsed by, or connected to KFintech, Link Intime
          (MUFG Intime), Bigshare, NSE, BSE, SEBI, IPO Watch, or any issuer company named on this site.
        </p>
      </LegalSection>

      <LegalSection title="2. Not investment advice">
        <p>
          Nothing on this site is investment, trading, or legal advice, and nothing here is a recommendation
          to buy, sell, hold, or apply for any security. Allotwise is not a SEBI-registered investment
          adviser. Speak to a licensed adviser before making a financial decision.
        </p>
      </LegalSection>

      <LegalSection title="3. Grey market premium is unofficial">
        <p>
          GMP shown here is scraped from public trackers and reflects informal grey-market sentiment — it is
          not a regulated price, not a quoted price, and not traded on any exchange. It moves daily, can be
          wrong or stale, and is not a forecast of where an issue will list.
        </p>
      </LegalSection>

      <LegalSection title="4. Estimated figures are illustrative">
        <p>
          &ldquo;Est. profit / lot&rdquo; and &ldquo;Est. gain&rdquo; are computed directly from GMP (GMP ×
          lot size, and GMP as a percentage of issue price). Because the input is unofficial, the output is an
          illustration, not a guarantee — actual listing performance can differ substantially, including a
          loss.
        </p>
      </LegalSection>

      <LegalSection title="5. Allotment results">
        <p>
          Allotment status is fetched directly from the registrar you&rsquo;re checking against (KFintech or
          Link Intime / MUFG Intime) at the moment you run the check. Allotwise passes that result through —
          it does not decide, delay, or influence an allotment outcome. Errors, delays, or downtime at the
          registrar&rsquo;s end are outside Allotwise&rsquo;s control.
        </p>
        <p>
          Bigshare enforces a captcha that cannot be solved automatically, so Allotwise links to
          Bigshare&rsquo;s own status page instead of returning a result directly.
        </p>
      </LegalSection>

      <LegalSection title="6. Other third-party data">
        <p>
          Subscription figures come from NSE for mainboard issues and IPO Ji for SME issues. IPO metadata and
          GMP come from public IPO-tracking pages. These sources can lag the registrar, disagree with each
          other, or be temporarily unreachable — see{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:no-underline">
            Terms
          </Link>{" "}
          for how the site behaves when a source is down.
        </p>
      </LegalSection>

      <LegalSection title="7. No warranty">
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of
          any kind, express or implied, including accuracy, completeness, or fitness for a particular
          purpose.
        </p>
      </LegalSection>

      <LegalSection title="8. Limitation of liability">
        <p>
          To the fullest extent the law allows, Allotwise and its operator are not liable for any loss —
          financial or otherwise — arising from a decision made in reliance on information shown on this
          site.
        </p>
      </LegalSection>

      <LegalSection title="9. Changes">
        <p>
          This disclaimer may be updated as the product changes. The date at the top of this page reflects the
          current version.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
