import "server-only";
import nodemailer from "nodemailer";

/**
 * Gmail SMTP + an App Password, not a transactional-email provider — this is
 * a handful of messages a day for a pre-launch tool, not a mailing list, and
 * it uses the address that already exists (allotwise@gmail.com) rather than
 * standing up a new account. GMAIL_USER/GMAIL_APP_PASSWORD are required; a
 * missing App Password means Google will reject plain-password SMTP login,
 * so this fails loudly in the server log rather than pretending to send.
 *
 * Never throws — the caller has already durably saved the record (waitlist
 * file, contact file) by the time this runs, and an email hiccup (bad
 * credentials, Gmail rate limiting) is not a reason to fail that response.
 */
async function notify(subject: string, text: string): Promise<void> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.error(`notify: GMAIL_USER/GMAIL_APP_PASSWORD not set — skipping "${subject}".`);
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    await transporter.sendMail({ from: `Allotwise <${user}>`, to: user, subject, text });
  } catch (err) {
    console.error(`notify failed ("${subject}"):`, err instanceof Error ? err.message : err);
  }
}

export function notifyWaitlistSignup(email: string): Promise<void> {
  return notify(
    "New Allotwise waitlist signup",
    `${email} joined the allotment-alerts waitlist just now.`
  );
}

export function notifyContactMessage(fields: { name?: string; email: string; message: string }): Promise<void> {
  const from = fields.name ? `${fields.name} <${fields.email}>` : fields.email;
  return notify(
    `New Allotwise contact message from ${from}`,
    `From: ${from}\n\n${fields.message}`
  );
}
