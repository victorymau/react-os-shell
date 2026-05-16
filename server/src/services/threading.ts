import crypto from 'node:crypto';

export function hashThreadRoot(messageId: string | null | undefined): string {
  const normalized = (messageId || '').trim().replace(/^<|>$/g, '');
  if (!normalized) return crypto.randomBytes(8).toString('hex');
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export function pickThreadRootId(envelope: {
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string[] | null;
}): string {
  if (envelope.references && envelope.references.length > 0) return envelope.references[0];
  if (envelope.inReplyTo) return envelope.inReplyTo;
  return envelope.messageId || '';
}
