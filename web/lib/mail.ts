import "server-only";
import nodemailer from "nodemailer";

/**
 * Sends the waitlist-signup notification to the inbox that actually reads it.
 *
 * Gmail SMTP + an App Password, not a transactional-email provider — this is
 * a handful of signups a day for a pre-launch tool, not a mailing list, and
 * it uses the address that already exists (allotwise@gmail.com) rather than
 * standing up a new account. GMAIL_USER/GMAIL_APP_PASSWORD are required; a
 * missing App Password means Google will reject plain-password SMTP login,
 * so this fails loudly in the server log rather than pretending to send.
 *
 * Never throws — a signup is already durably recorded in the waitlist file
 * by the time this runs, and an email hiccup (bad credentials, Gmail rate
 * limiting) is not a reason to tell that visitor their signup failed.
 */
export async function notifyWaitlistSignup(email: string): Promise<void> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.error("notifyWaitlistSignup: GMAIL_USER/GMAIL_APP_PASSWORD not set — skipping email.");
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `Allotwise <${user}>`,
      to: user,
      subject: "New Allotwise waitlist signup",
      text: `${email} joined the allotment-alerts waitlist just now.`,
    });
  } catch (err) {
    console.error("notifyWaitlistSignup failed:", err instanceof Error ? err.message : err);
  }
}
