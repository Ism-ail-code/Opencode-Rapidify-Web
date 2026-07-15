import { Resend } from "resend";
import { logger } from "@/lib/infrastructure";

const FROM = process.env.EMAIL_FROM || "Rapidify <hello@rapidify.app>";

let _resend: Resend | null = null;

function getClient(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error(
        "RESEND_API_KEY is not set. Emails will not be sent. " +
        "Set it in your environment variables or .env file."
      );
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}

export type EmailResult = { success: true; id: string } | { success: false; error: string };

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<EmailResult> {
  try {
    const resend = getClient();
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
    });

    if (error) {
      logger.error("Email delivery failed", {
        to,
        subject,
        error: error.message,
      });
      return { success: false, error: error.message };
    }

    logger.info("Email sent successfully", {
      to,
      subject,
      id: data?.id,
    });
    return { success: true, id: data?.id ?? "unknown" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Email send exception", { to, subject, error: message });
    return { success: false, error: message };
  }
}
