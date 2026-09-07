import Link from "next/link";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react/dist/ssr";

/** Bare icon, matching ThemeToggle's treatment — a control, not a badge. */
export function ContactButton() {
  return (
    <Link
      href="/contact"
      className="inline-flex size-10 items-center justify-center text-text sm:size-9"
      aria-label="Contact Allotwise"
    >
      <EnvelopeSimpleIcon size={16} weight="regular" />
    </Link>
  );
}
