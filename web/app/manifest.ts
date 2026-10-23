import type { MetadataRoute } from "next";

/** The live site's address. Set SITE_URL when the site moves to its own domain. */
const SITE_URL = (process.env.SITE_URL ?? "https://web-production-31536.up.railway.app").replace(/\/$/, "");

/**
 * What a phone or desktop browser reads to install Allotwise as an app: name,
 * icon, colours and where it opens.
 *
 * start_url is /app, not /, since installing this is a "give me the tool"
 * action — landing back on the marketing page every launch would be wrong.
 * `id` pins the app's identity, so changing start_url later does not make
 * browsers treat it as a second app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Allotwise — IPO allotment and grey market premium",
    short_name: "Allotwise",
    description:
      "Check IPO allotment across KFintech, MUFG Intime, Bigshare and Maashitla, and track grey market premium for current issues.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F5F5F3",
    theme_color: "#F5F5F3",
    categories: ["finance"],
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      // Full-bleed, glyph inside the safe zone: Android crops this to its own shape.
      { src: "/icon-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Lets the site ask Chrome on Android whether this app is already on the
    // home screen (navigator.getInstalledRelatedApps), so the Install button
    // is not offered to people who have it. Must be the manifest's full URL.
    related_applications: [{ platform: "webapp", url: `${SITE_URL}/manifest.webmanifest` }],
    // Long-press the home-screen icon.
    shortcuts: [
      { name: "IPOs", short_name: "IPOs", url: "/app", icons: [{ src: "/icon-192", sizes: "192x192" }] },
      { name: "My PANs", short_name: "PANs", url: "/pans", icons: [{ src: "/icon-192", sizes: "192x192" }] },
    ],
  };
}
