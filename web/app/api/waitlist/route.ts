import { NextResponse } from "next/server";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { clientIp } from "@/lib/backend";
import { notifyWaitlistSignup } from "@/lib/mail";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter an email address you can receive mail at.")),
});

/**
 * Append-only local store.
 *
 * This is a real, working sink so the form on the landing page is not
 * decorative — but it is file-backed, which means a single-instance host only.
 * Swap the append for a database call before running this on more than one node.
 *
 * Being unauthenticated and write-to-disk, it is also the one endpoint here an
 * anonymous caller can grow without limit, so it carries its own guards: a body
 * cap, a per-IP rate limit, and a dedupe set. The in-memory state is consistent
 * with the single-instance constraint above — it resets on restart, which is
 * acceptable because the file is the record and the guards are about abuse, not
 * correctness.
 */
const FILE = path.join(process.cwd(), "data", "waitlist.jsonl");

/** An email is ~254 chars at most; this leaves room for JSON and nothing else. */
const MAX_BODY_BYTES = 2048;

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 5;

const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);

  // Bound the map itself, or it becomes its own slow memory leak.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (!times.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
}

let seen: Set<string> | null = null;

/** Addresses already on file, so a repeat submission appends nothing. */
async function seenEmails(): Promise<Set<string>> {
  if (seen) return seen;
  const set = new Set<string>();
  try {
    const raw = await readFile(FILE, "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const email = JSON.parse(line)?.email;
        if (typeof email === "string") set.add(email);
      } catch {
        // A malformed line is not worth failing a signup over.
      }
    }
  } catch {
    // No file yet: nothing has been saved.
  }
  seen = set;
  return set;
}

export async function POST(request: Request) {
  const ip = clientIp(request.headers) ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many signups from here. Try again later." } },
      { status: 429 }
    );
  }

  // Read as text first: `request.json()` would parse an arbitrarily large body
  // into memory before any validation could reject it.
  const raw = await request.text().catch(() => null);
  if (raw === null || raw.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Send a JSON body." } },
      { status: 400 }
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Send a JSON body." } },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "EMAIL_INVALID",
          message: parsed.error.issues[0]?.message ?? "That email address is not valid.",
        },
      },
      { status: 400 }
    );
  }

  const email = parsed.data.email;

  try {
    const already = await seenEmails();
    // Idempotent: the caller is told it worked either way, because from their
    // side it did, and saying "already registered" would leak who is on the list.
    if (already.has(email)) return NextResponse.json({ ok: true });

    await mkdir(path.dirname(FILE), { recursive: true });
    await appendFile(FILE, `${JSON.stringify({ email, at: new Date().toISOString() })}\n`, "utf8");
    already.add(email);
    // Fire-and-forget: the signup is already durably saved above, so a slow
    // or failed email must not hold up or fail the response to the visitor.
    void notifyWaitlistSignup(email);
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Could not save your address. Try again shortly." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
