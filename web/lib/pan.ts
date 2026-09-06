import { z } from "zod";

/**
 * PANs live in localStorage and nowhere else.
 *
 * They are sent to the server only as a query parameter on a check, and the
 * backend never persists them (no table stores a PAN; logs scrub anything
 * PAN-shaped). Nothing here writes a PAN to a cookie, to a server, or to any
 * analytics call.
 */

const STORAGE_KEY = "allotwise.pans.v1";

/** Same shape the backend enforces: 5 letters, 4 digits, 1 letter. */
export const PAN_REGEX = /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/;

export const panEntrySchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(24),
  pan: z.string().regex(PAN_REGEX),
});

export type PanEntry = z.infer<typeof panEntrySchema>;

export const panInputSchema = z.object({
  // Optional: a PAN with no label falls back to its own masked form, so every
  // saved entry can still be told apart without forcing an extra decision.
  label: z.string().trim().max(24, "Keep the label under 24 characters.").optional(),
  pan: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => PAN_REGEX.test(v), "A PAN is 5 letters, 4 digits, then 1 letter."),
});

/** AAAAA1234A -> AAAAA****A — enough to recognise, not enough to reuse. */
export function maskPan(pan: string): string {
  if (pan.length !== 10) return "••••••••••";
  return `${pan.slice(0, 5)}****${pan.slice(9)}`;
}

export function loadPans(): PanEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = z.array(panEntrySchema).safeParse(JSON.parse(raw));
    // A malformed store is dropped rather than crashing the app.
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function savePans(entries: PanEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Private mode / quota. The in-memory list still works for this session.
  }
}

export function newPanId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `pan_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
