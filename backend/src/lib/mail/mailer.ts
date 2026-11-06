import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | null = null;

/** `true` when SMTP is configured (host and sender). */
export function isMailConfigured(): boolean {
  const config = env();
  return !!config.SMTP_HOST && !!config.MAIL_FROM;
}

/**
 * Sends an email through the configured SMTP server (Brevo, Resend, any provider).
 * Without SMTP in development the message is printed to the console, so the links can be
 * tested locally; in production it is not sent and a warning is logged (never the content:
 * it contains one-time tokens).
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  const config = env();
  if (!isMailConfigured()) {
    if (config.NODE_ENV === 'production') {
      console.warn(`[mail] not sent (SMTP not configured): "${message.subject}"`);
    } else {
      console.info(`[mail] (dev, not sent) to=${message.to} subject="${message.subject}"\n${message.text}`);
    }
    return false;
  }

  transporter ??= nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });

  try {
    await transporter.sendMail({ from: config.MAIL_FROM, ...message });
    return true;
  } catch (error) {
    console.error('[mail] sending failed:', (error as Error).message);
    return false;
  }
}

/** Test helper. */
export function resetMailer(): void {
  transporter = null;
}
