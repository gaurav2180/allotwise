"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  allotmentResponseSchema,
  apiErrorSchema,
  ApiError,
  type AllotmentResponse,
  type KnownErrorCode,
} from "@/lib/schemas";
import type { PanEntry } from "@/lib/pan";

export type PanCheckState =
  | { status: "queued" }
  | { status: "checking" }
  | { status: "done"; data: AllotmentResponse }
  | { status: "error"; code: KnownErrorCode; message: string };

/** Minimum gap between two results appearing, per DESIGN.md. */
const REVEAL_STAGGER_MS = 260;

async function checkOne(ipo: string, pan: string): Promise<AllotmentResponse> {
  let res: Response;
  try {
    // POST so the PAN sits in the body. In a URL it would reach the browser's
    // network log, the referrer, and every proxy log between here and the
    // server — none of which this app controls.
    res = await fetch("/api/allotment", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ipo, pan }),
    });
  } catch {
    throw new ApiError("NETWORK", "Could not reach Allotwise. Check your connection.", 0);
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new ApiError(
      (parsed.success ? parsed.data.error.code : "INTERNAL") as KnownErrorCode,
      parsed.success ? parsed.data.error.message : "The check failed.",
      res.status
    );
  }

  const parsed = allotmentResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("INTERNAL", "The registrar's reply was in an unexpected format.", res.status);
  }
  return parsed.data;
}

/**
 * Runs every saved PAN against one IPO, in sequence.
 *
 * Sequential rather than parallel on purpose: the backend caps distinct PANs per
 * IP per hour and total allotment calls per window, so a parallel burst would
 * trip the limiter and lose results that a paced run returns cleanly.
 */
export function useAllotmentCheck(registrarSlug: string | undefined) {
  const [results, setResults] = useState<Record<string, PanCheckState>>({});
  const lastRevealRef = useRef(0);

  const reveal = useCallback(async (id: string, state: PanCheckState) => {
    const since = Date.now() - lastRevealRef.current;
    if (lastRevealRef.current && since < REVEAL_STAGGER_MS) {
      await new Promise((r) => setTimeout(r, REVEAL_STAGGER_MS - since));
    }
    lastRevealRef.current = Date.now();
    setResults((prev) => ({ ...prev, [id]: state }));
  }, []);

  const mutation = useMutation({
    mutationFn: async (pans: PanEntry[]) => {
      if (!registrarSlug) throw new ApiError("IPO_NOT_FOUND", "This IPO has no registrar mapping yet.");

      lastRevealRef.current = 0;
      setResults(Object.fromEntries(pans.map((p) => [p.id, { status: "queued" } as PanCheckState])));

      let firstFatal: ApiError | null = null;

      for (const entry of pans) {
        setResults((prev) => ({ ...prev, [entry.id]: { status: "checking" } }));
        try {
          const data = await checkOne(registrarSlug, entry.pan);
          await reveal(entry.id, { status: "done", data });
        } catch (err) {
          const e = err instanceof ApiError ? err : new ApiError("INTERNAL", "The check failed.");
          await reveal(entry.id, { status: "error", code: e.code, message: e.message });

          // A rate-limit rejection applies to every remaining PAN, so stop
          // rather than burn the rest of the window on calls that cannot pass.
          if (e.code === "RATE_LIMITED" || e.code === "DISTINCT_PAN_LIMIT") {
            firstFatal = e;
            const remaining = pans.slice(pans.indexOf(entry) + 1);
            setResults((prev) => ({
              ...prev,
              ...Object.fromEntries(
                remaining.map((p) => [
                  p.id,
                  { status: "error", code: e.code, message: "Skipped — the limit was already reached." },
                ])
              ),
            }));
            break;
          }
        }
      }

      if (firstFatal) throw firstFatal;
      return true;
    },
  });

  const reset = useCallback(() => {
    setResults({});
    lastRevealRef.current = 0;
    mutation.reset();
  }, [mutation]);

  return {
    run: mutation.mutate,
    isRunning: mutation.isPending,
    results,
    reset,
    hasRun: Object.keys(results).length > 0,
  };
}
