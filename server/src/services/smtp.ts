import nodemailer, { type Transporter } from 'nodemailer';
import { AppError } from '../errors';
import type { SessionRecord, SmtpCreds } from '../types';

function buildTransport(creds: SmtpCreds): Transporter {
  return nodemailer.createTransport({
    host: creds.host,
    port: creds.port,
    secure: creds.secure,
    auth: { user: creds.user, pass: creds.pass },
    pool: true,
    maxConnections: 1,
  });
}

export async function testCredentials(creds: SmtpCreds): Promise<true> {
  const transport = buildTransport(creds);
  try {
    await transport.verify();
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SMTP verify failed';
    throw new AppError(401, 'SMTP_AUTH', `SMTP authentication failed: ${message}`);
  } finally {
    transport.close();
  }
}

export function getTransport(session: SessionRecord): Transporter {
  if (session.smtpTransport) return session.smtpTransport;
  const transport = buildTransport(session.creds.smtp);
  session.smtpTransport = transport;
  return transport;
}
