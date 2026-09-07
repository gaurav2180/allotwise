import { NextResponse } from "next/server";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { notifyContactMessage } from "@/lib/mail";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter an email address you can receive mail at.")),
  message: z
    .string()
    .trim()
    .min(1, "Say something before sending.")
    .max(4000, "Keep it under 4000 characters."),
});

/**
 * Append-only local store, same shape as /api/waitlist — the record of truth
 * even if the email below fails to send. File-backed means a single-instance
 * host only.
 */
const FILE = path.join(process.cwd(), "data", "contact.jsonl");

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Send a JSON body." } },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: {
          code: issue?.path[0] === "email" ? "EMAIL_INVALID" : "MESSAGE_INVALID",
          message: issue?.message ?? "That submission is not valid.",
        },
      },
      { status: 400 }
    );
  }

  try {
    await mkdir(path.dirname(FILE), { recursive: true });
    await appendFile(
      FILE,
      `${JSON.stringify({ ...parsed.data, at: new Date().toISOString() })}\n`,
      "utf8"
    );
    // Fire-and-forget: the message is already durably saved above, so a slow
    // or failed email must not hold up or fail the response to the sender.
    void notifyContactMessage(parsed.data);
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Could not send your message. Try again shortly." } },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
