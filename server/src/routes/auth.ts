import { Router } from 'express';
import { z } from 'zod';
import { AppError, asyncHandler } from '../errors';
import * as imap from '../services/imap';
import * as smtp from '../services/smtp';
import * as caldav from '../services/caldav';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  getCookieToken,
  getSession,
  requireSession,
  setSessionCookie,
  type AuthedRequest,
} from '../session';

const credsSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  secure: z.boolean(),
  user: z.string().min(1),
  pass: z.string().min(1),
});

const calDavSchema = z.object({
  serverUrl: z.string().url(),
  user: z.string().min(1),
  pass: z.string().min(1),
});

const loginSchema = z.object({
  imap: credsSchema,
  smtp: credsSchema,
  caldav: calDavSchema.optional(),
});

export const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'BAD_REQUEST', `Invalid login payload: ${parsed.error.message}`);
    }
    const { imap: imapCreds, smtp: smtpCreds, caldav: caldavCreds } = parsed.data;

    const [imapCaps, , caldavOk] = await Promise.all([
      imap.testCredentials(imapCreds),
      smtp.testCredentials(smtpCreds),
      caldavCreds ? caldav.testCredentials(caldavCreds) : Promise.resolve(false as const),
    ]);

    const session = createSession({
      creds: { imap: imapCreds, smtp: smtpCreds, caldav: caldavCreds },
      email: imapCreds.user,
      displayName: imapCreds.user.split('@')[0] || imapCreds.user,
      capabilities: {
        imap: imapCaps,
        smtp: true,
        caldav: caldavOk === true,
      },
      imapConnection: null,
      imapKeepAliveTimer: null,
      smtpTransport: null,
      caldavClient: null,
    });

    setSessionCookie(res, session.token);
    res.json({
      user: { email: session.email, displayName: session.displayName },
      capabilities: session.capabilities,
    });
  })
);

authRouter.post('/logout', (req, res) => {
  const token = getCookieToken(req);
  if (token) destroySession(token);
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireSession, (req, res) => {
  const { session } = req as AuthedRequest;
  res.json({
    user: { email: session.email, displayName: session.displayName },
    capabilities: session.capabilities,
  });
});

// Helper for routes that need typed session — caller still must mount requireSession.
export { requireSession };
