import { GeistSans } from "geist/font/sans";
import { JetBrains_Mono } from "next/font/google";

/**
 * Geist for UI, JetBrains Mono for every number.
 *
 * The mono face carries `tabular-nums` via the `.num` class in globals.css so
 * that a column of GMP figures lines up vertically when scanning a list.
 */
export const sans = GeistSans;

export const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const fontVariables = `${sans.variable} ${mono.variable}`;
