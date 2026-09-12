import { appIconResponse } from "@/lib/app-icon";

/**
 * iOS Safari's "Add to Home Screen" needs a real apple-touch-icon — it does
 * not read icon.svg (SVG isn't supported there at all), and without one it
 * falls back to a generic tile showing the page's first letter. This
 * generates the same mark at Apple's recommended 180x180.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIconResponse(180);
}
