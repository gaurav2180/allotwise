import type { Metadata } from "next";
import { fontVariables } from "@/lib/fonts";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Allotwise — IPO allotment and GMP",
  description:
    "Check IPO allotment across KFintech, MUFG Intime and Bigshare, and track grey market premium for open issues.",
  // Rows are full of date-like text ("Closes in 4d", "Listed 4 Sept") and PANs
  // that look number-ish. Without this, iOS Safari's data detectors rewrite
  // that text into links before React hydrates, which is a genuine hydration
  // mismatch — not a bug in this app's render output.
  formatDetection: { telephone: false, date: false, email: false, address: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning is required by next-themes, which sets the
    // class on <html> before React hydrates.
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
