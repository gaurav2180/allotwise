/**
 * Next's official server-startup hook — runs once when a live server instance
 * boots (`next dev`, `next start`), not during `next build` and not per
 * request. This is where the frontend's own background data refresh starts;
 * see `lib/background-refresh.ts` for what it actually keeps warm and why.
 */
export async function register() {
  // Guard against the Edge runtime, which this app does not use for anything
  // that touches these caches, and where `setInterval`-based background work
  // is not a supported pattern.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackgroundRefresh } = await import("@/lib/background-refresh");
    startBackgroundRefresh();
  }
}
