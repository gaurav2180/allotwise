import { NextResponse } from "next/server";
import { backendGet, clientIp } from "@/lib/backend";
import { PAN_REGEX } from "@/lib/pan";

export const dynamic = "force-dynamic";

/**
 * Allotment check for one PAN against one IPO.
 *
 * The PAN transits this handler and is forwarded to the registrar. It is never
 * written to disk, never logged, and never cached here — `no-store` and the
 * absence of any logging call are the whole of the mechanism, deliberately.
 *
 * POST, not GET, because the PAN travels in the body: a query string is logged
 * verbatim by proxies, CDNs and hosting platforms that this app does not
 * control, which would put every checked PAN into somebody else's logs.
 */
export async function POST(request: Request) {
  // Bounded before parsing: this endpoint is unauthenticated.
  const raw = await request.text().catch(() => null);
  if (raw === null || raw.length > 1024) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Send a JSON body." } },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  let body: { ipo?: unknown; pan?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Send a JSON body." } },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  const ipo = typeof body.ipo === "string" ? body.ipo.trim() : "";
  const pan = typeof body.pan === "string" ? body.pan.trim().toUpperCase() : "";

  if (!ipo) {
    return NextResponse.json(
      { error: { code: "IPO_REQUIRED", message: "Pick an IPO to check." } },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }
  // Validate before leaving this process, so an obviously bad PAN never travels.
  if (!PAN_REGEX.test(pan)) {
    return NextResponse.json(
      { error: { code: "PAN_INVALID", message: "A PAN is 5 letters, 4 digits, then 1 letter." } },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  const res = await backendGet<Record<string, unknown>>("/allotment", {
    timeoutMs: 25_000,
    forwardedFor: clientIp(request.headers),
    json: { ipo, pan },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: { code: res.code, message: res.message } },
      { status: res.status, headers: { "cache-control": "no-store" } }
    );
  }

  // Tag the variant so the client can discriminate without re-sniffing fields.
  // A captcha-gated registrar answers 200 with `supported: false`; that is a
  // real answer, not an error.
  const data = res.data as Record<string, unknown>;
  const kind = data.supported === false ? "deeplink" : "result";

  return NextResponse.json({ kind, ...data }, { headers: { "cache-control": "no-store" } });
}
