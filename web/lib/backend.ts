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
        // the real user rather than to this server. Requires TRUST_PROXY_HOPS
        // to be set on the backend in a deployed environment.
        ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
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
