import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config';
import { AppError } from './errors';
import type { SessionRecord } from './types';

const COOKIE_NAME = 'shell_session';
const store = new Map<string, SessionRecord>();

export function createSession(record: Omit<SessionRecord, 'token' | 'createdAt' | 'lastUsed'>): SessionRecord {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const full: SessionRecord = { ...record, token, createdAt: now, lastUsed: now };
  store.set(token, full);
  return full;
}

export function getSession(token: string | undefined): SessionRecord | null {
  if (!token) return null;
  const rec = store.get(token);
  if (!rec) return null;
  if (Date.now() - rec.lastUsed > config.sessionTtlMs) {
    destroySession(token);
    return null;
  }
  rec.lastUsed = Date.now();
  return rec;
}

export function destroySession(token: string): void {
  const rec = store.get(token);
  if (!rec) return;
  if (rec.imapKeepAliveTimer) clearInterval(rec.imapKeepAliveTimer);
  if (rec.imapConnection) {
    rec.imapConnection.logout().catch(() => undefined);
  }
  if (rec.smtpTransport) rec.smtpTransport.close();
  store.delete(token);
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.sessionTtlMs,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export interface AuthedRequest extends Request {
  session: SessionRecord;
}

export function requireSession(req: Request, _res: Response, next: NextFunction): void {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
  const session = getSession(token);
  if (!session) throw new AppError(401, 'UNAUTHENTICATED', 'Not logged in');
  (req as AuthedRequest).session = session;
  next();
}

export function getCookieToken(req: Request): string | undefined {
  return (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
}

export function startSessionSweeper(): NodeJS.Timeout {
  return setInterval(() => {
    const now = Date.now();
    for (const [token, rec] of store) {
      if (now - rec.lastUsed > config.sessionTtlMs) destroySession(token);
    }
  }, config.sweepIntervalMs);
}
