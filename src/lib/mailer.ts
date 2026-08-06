import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export function makeTransport(user: string, pass: string) {
  const options: SMTPTransport.Options = {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  };
  return nodemailer.createTransport(options);
}

// Verifies that email + app password authenticate against Gmail SMTP.
export async function verifyAccount(user: string, pass: string): Promise<void> {
  const t = makeTransport(user, pass);
  try {
    await t.verify();
  } finally {
    t.close();
  }
}
