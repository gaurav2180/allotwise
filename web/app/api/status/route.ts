import { NextResponse } from "next/server";
import { backendGet } from "@/lib/backend";

export const dynamic = "force-dynamic";

type Health = {
  ok: boolean;
  degraded: boolean;
  problems: string[];
  registrars: Record<string, unknown> | null;
  allotment: Record<string, unknown> | null;
};

/**
 * Whether the sources behind the app are working, readable without access to
 * the hosting dashboard: each registrar's list sync (when it last succeeded,
 * its last error, the newest company it has picked up) and self-test, plus the
 * in-app coverage summary.
 *
 * Read-only, and only that part of the backend's health: no rate-limit or
 * proxy settings, and nothing about any user. Nothing here takes a PAN.
 */
export async function GET() {
  const res = await backendGet<Health>("/health", { timeoutMs: 10_000 });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.message }, { status: 502, headers: { "cache-control": "no-store" } });
  }
  const { ok, degraded, problems, registrars, allotment } = res.data;
  return NextResponse.json(
    { ok, degraded, problems, registrars, allotment, checkedAt: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } }
  );
}
