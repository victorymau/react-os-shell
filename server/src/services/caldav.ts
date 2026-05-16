import { DAVClient } from 'tsdav';
import { AppError } from '../errors';
import type { CalDavCreds, SessionRecord } from '../types';

async function buildClient(creds: CalDavCreds): Promise<DAVClient> {
  const client = new DAVClient({
    serverUrl: creds.serverUrl,
    credentials: { username: creds.user, password: creds.pass },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
  await client.login();
  return client;
}

export async function testCredentials(creds: CalDavCreds): Promise<true> {
  try {
    const client = await buildClient(creds);
    await client.fetchCalendars();
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CalDAV connection failed';
    throw new AppError(401, 'CALDAV_AUTH', `CalDAV authentication failed: ${message}`);
  }
}

export async function getClient(session: SessionRecord): Promise<DAVClient> {
  if (!session.creds.caldav) {
    throw new AppError(400, 'NO_CALDAV', 'No CalDAV credentials configured');
  }
  if (session.caldavClient) return session.caldavClient;
  const client = await buildClient(session.creds.caldav);
  session.caldavClient = client;
  return client;
}
