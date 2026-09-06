import type { NextConfig } from "next";
import path from "node:path";
import os from "node:os";

/**
 * Every non-internal IPv4 address on this machine, read fresh each time the
 * dev server starts. A hardcoded LAN IP goes stale the moment DHCP hands out
 * a new one (a Wi-Fi reconnect, a different network) — this re-detects it on
 * every `next dev` boot instead, across every interface, so whichever one a
 * phone actually reaches this machine on is already covered.
 */
function lanIps(): string[] {
  const ifaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const entries of Object.values(ifaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) ips.push(entry.address);
    }
  }
  return ips;
}

const nextConfig: NextConfig = {
  // The Express backend lives one level up, so Turbopack would otherwise infer
  // the repo root and warn about the outer lockfile.
  turbopack: { root: path.resolve(__dirname) },

  // The floating dev badge overlaps bottom-left UI during design review.
  devIndicators: false,

  // Next blocks cross-origin requests to dev-only assets by default, so opening
  // the dev server from a phone on the LAN fails its HMR handshake, the client
  // runtime never boots, and the page never hydrates — skeletons forever, with
  // no failed request to show for it.
  //
  // Hosts must be literal (CIDR ranges are not accepted). Auto-detected via
  // lanIps() above, so this survives a Wi-Fi reconnect on the next `next dev`
  // restart. Set DEV_ORIGIN only if auto-detection picks the wrong interface
  // (e.g. a VPN adapter) or a host lanIps() can't see (a tunnel, a different
  // machine). Neither has any effect on a production build.
  allowedDevOrigins: [
    ...(process.env.DEV_ORIGIN ? [process.env.DEV_ORIGIN] : []),
    ...lanIps(),
  ],

  /**
   * Security headers.
   *
   * `Referrer-Policy` is the one that earns its place here rather than being
   * box-ticking: this app handles PANs, and the default policy leaks the full
   * URL to any third-party origin the page touches (fonts, logo images).
   *
   * No CSP in development. Next's dev server relies on eval for Fast Refresh
   * and injects inline styles, so a policy strict enough to be worth having
   * breaks the dev overlay — and one loose enough to survive it
   * (`unsafe-eval`, `unsafe-inline`) is worse than none, because it looks like
   * protection while permitting exactly what CSP exists to stop. Production
   * gets the real policy.
   */
  async headers() {
    const base = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "geolocation=(), microphone=(), camera=(), interest-cohort=()",
      },
    ];

    if (process.env.NODE_ENV === "production") {
      base.push(
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            // Next ships inline bootstrap/style attributes; images come from
            // the two logo hosts the IPO list resolves against.
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https://media.ipoji.com https://ipowatch.in",
            "font-src 'self' data:",
            // Same-origin only: the browser never calls the Express backend
            // directly, every upstream goes through this app's own routes.
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "upgrade-insecure-requests",
          ].join("; "),
        }
      );
    }

    return [{ source: "/:path*", headers: base }];
  },
};

export default nextConfig;
