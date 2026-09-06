import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell, LegalSection } from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Privacy — Allotwise",
  description: "What Allotwise does and does not do with your PAN, and everything else it touches.",
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy policy" updated="5 September 2026">
      <LegalSection title="1. The short version">
        <p>
          A PAN is identity data, so the design goal was to never hold it. There is no sign-up, no profile,
          and no account to delete later — because there is nothing on Allotwise&rsquo;s side to delete. This
          page explains exactly what does exist.
        </p>
      </LegalSection>

      <LegalSection title="2. What Allotwise does not collect">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>No accounts, passwords, or profiles.</li>
          <li>No tracking cookies, and no third-party analytics or advertising scripts of any kind.</li>
          <li>No server-side table of PANs, lookups, or results.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Your PAN">
        <p>
          A PAN you save is written to this browser&rsquo;s local storage only, under a labelled entry —
          Allotwise keeps no copy. Running a check sends that PAN to the relevant registrar&rsquo;s own API to
          fetch your result; it is held in memory for the duration of that one request and discarded when the
          response returns. It is never written to a database, never cached to disk, and scrubbed from every
          log line before anything is written, so a stray log call cannot leak one.
        </p>
        <p>
          A one-way HMAC of the PAN — not the PAN itself — is used briefly as an internal cache and
          rate-limit key. Rotating that secret invalidates every derived key at once, and the hash cannot be
          reversed back into a PAN.
        </p>
      </LegalSection>

      <LegalSection title="4. What lives in your browser">
        <p>
          Saved PANs and their labels, and your theme preference (light/dark), are stored in this
          browser&rsquo;s local storage. Allotwise has no copy and cannot recover them if you clear your
          browser data or open the site on a different device or browser.
        </p>
      </LegalSection>

      <LegalSection title="5. If you leave an email address">
        <p>
          The landing page lets you leave an email address to be notified when allotment alerts ship. That
          address is stored, with a timestamp, solely to send that one notification — it is not sold, shared,
          or used for any other message. You can ask to have it removed at any time using the contact below.
        </p>
      </LegalSection>

      <LegalSection title="6. IP address">
        <p>
          Your IP address is used transiently to enforce the per-IP rate limits described in{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:no-underline">
            Terms
          </Link>
          . It is not stored long-term and is not used to build a profile of you.
        </p>
      </LegalSection>

      <LegalSection title="7. Who else sees your data">
        <p>
          Running a check against KFintech or Link Intime / MUFG Intime sends your PAN to that registrar,
          which processes it under its own privacy practices — Allotwise doesn&rsquo;t control those. A
          Bigshare check happens entirely on Bigshare&rsquo;s own site, reached through a deep link; Allotwise
          never sees that PAN at all.
        </p>
      </LegalSection>

      <LegalSection title="8. Children">
        <p>
          This service is not directed at children. Holding a PAN implies the age and legal capacity to apply
          for shares in your own right.
        </p>
      </LegalSection>

      <LegalSection title="9. Your rights">
        <p>
          Because Allotwise holds no account data and no PAN, there is nothing to access, correct, or erase on
          that front. For the one thing it does hold — a waitlist email address, if you left one — you can
          ask what is stored, ask for a correction, or ask for it to be deleted, at any time, using the
          contact below.
        </p>
      </LegalSection>

      <LegalSection title="10. Changes to this policy">
        <p>
          This policy may change as the product develops. The date at the top of this page reflects the
          current version.
        </p>
      </LegalSection>

      <LegalSection title="11. Contact">
        <p>
          Questions about this policy, or a request about a waitlist email address:{" "}
          <a href="mailto:allotwise@gmail.com" className="underline underline-offset-2 hover:no-underline">
            allotwise@gmail.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
