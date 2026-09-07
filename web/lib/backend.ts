import "server-only";

/**
 * Server-side access to the Express backend.
 *
 * `json` turns a call into a POST. That exists for the allotment check, whose
 * PAN must travel in a body rather than a query string — URLs are logged
 * verbatim by proxies and hosts this app does not control.
 *
 * The backend ships no CORS middleware, so the browser cannot call it directly.
 * Everything goes through Next route handlers on the same origin. That also
 * keeps the backend's base URL out of the client bundle.
 */
export const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3000";

/** Shared with the backend; identifies this proxy so its x-forwarded-for is believed. */
const PROXY_SECRET = process.env.PROXY_SHARED_SECRET;

export type BackendResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

interface BackendOptions {
  timeoutMs?: number;
  forwardedFor?: string | null;
  /** Sent as a JSON body, which also makes the request a POST. */
  json?: unknown;
}

export async function backendGet<T = unknown>(
  path: string,
  { timeoutMs = 20_000, forwardedFor, json }: BackendOptions = {}
): Promise<BackendResult<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      signal: ctrl.signal,
      cache: "no-store",
      method: json === undefined ? "GET" : "POST",
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
      headers: {
        accept: "application/json",
        ...(json === undefined ? {} : { "content-type": "application/json" }),
        // Preserve the caller's IP so the backend's per-IP rate limits apply to
        // the real user rather than to this server.
        ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
        // Proof that the forwarded address above came from this proxy. The
        // backend ignores x-forwarded-for without it, so a caller reaching the
        // backend directly cannot invent an address per request and walk
        // through the per-IP budgets. Optional: unset, the backend falls back
        // to trusting a fixed number of proxy hops.
        ...(PROXY_SECRET ? { "x-allotwise-proxy": PROXY_SECRET } : {}),
      },
    });

    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      return { ok: false, status: res.status, code: "INTERNAL", message: "Registrar service returned a malformed response." };
    }

    if (!res.ok) {
      const err = body as { error?: { code?: string; message?: string } } | null;
      return {
        ok: false,
        status: res.status,
        code: err?.error?.code ?? "INTERNAL",
        message: err?.error?.message ?? "Request failed.",
      };
    }

    return { ok: true, data: body as T };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    if (!aborted) {
      // The caller only ever sees "could not reach", which is the right thing to
      // show a user and useless to operate on: DNS failure, refused connection
      // and wrong port all look identical. undici keeps the real errno on
      // `cause`, so record that. Path only — never the query string, which is
      // where a PAN would be.
      const cause = (err as { cause?: { code?: string; message?: string } }).cause;
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          scope: "backend",
          msg: "request failed",
          path: path.split("?")[0],
          host: (() => {
            try {
              return new URL(BACKEND_URL).host;
            } catch {
              return "invalid BACKEND_URL";
            }
          })(),
          code: cause?.code ?? null,
          message: cause?.message ?? (err as Error).message,
        })
      );
    }
    return {
      ok: false,
      status: aborted ? 504 : 502,
      code: aborted ? "UPSTREAM_TIMEOUT" : "NETWORK",
      message: aborted
        ? "The registrar did not respond in time."
        : "Could not reach the Allotwise service.",
    };
  }
}

/** Best-effort client IP for rate-limit attribution. */
export function clientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip");
}
