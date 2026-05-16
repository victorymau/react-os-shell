import { ImapFlow } from 'imapflow';
import { config } from '../config';
import { AppError } from '../errors';
import type { ImapCreds, SessionRecord } from '../types';

function buildClient(creds: ImapCreds): ImapFlow {
  return new ImapFlow({
    host: creds.host,
    port: creds.port,
    secure: creds.secure,
    auth: { user: creds.user, pass: creds.pass },
    logger: false,
  });
}

export async function testCredentials(creds: ImapCreds): Promise<{ thread: boolean; condstore: boolean; idle: boolean }> {
  const client = buildClient(creds);
  try {
    await client.connect();
    const rawCaps = (client.serverInfo as { capability?: string[] } | undefined)?.capability || [];
    const caps: string[] = rawCaps;
    const thread = caps.some((c: string) => /^THREAD=/i.test(c));
    const condstore = caps.includes('CONDSTORE');
    const idle = caps.includes('IDLE');
    return { thread, condstore, idle };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'IMAP connection failed';
    throw new AppError(401, 'IMAP_AUTH', `IMAP authentication failed: ${message}`);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function getConnection(session: SessionRecord): Promise<ImapFlow> {
  if (session.imapConnection?.usable) return session.imapConnection;
  const client = buildClient(session.creds.imap);
  client.on('close', () => {
    if (session.imapConnection === client) session.imapConnection = null;
  });
  await client.connect();
  session.imapConnection = client;
  if (session.imapKeepAliveTimer) clearInterval(session.imapKeepAliveTimer);
  session.imapKeepAliveTimer = setInterval(() => {
    if (client.usable) client.noop().catch(() => undefined);
  }, config.imapKeepAliveMs);
  return client;
}
