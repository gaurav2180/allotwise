import type { MetadataRoute } from "next";

/**
 * Chrome's "Add to Home Screen" / install prompt reads this — without it,
 * icon.svg and apple-icon.tsx (Apple-only) are invisible to it, and it falls
 * back to a generic tile the same way Safari did without an apple-touch-icon.
 *
 * start_url is /app, not /, since installing this is a "give me the tool"
 * action — landing back on the marketing page every launch would be wrong.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Allotwise — IPO allotment and grey market premium",
    short_name: "Allotwise",
    description:
      "Check IPO allotment across KFintech, MUFG Intime and Bigshare, and track grey market premium for open issues.",
    start_url: "/app",
    display: "standalone",
    background_color: "#F5F5F3",
    theme_color: "#F5F5F3",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
