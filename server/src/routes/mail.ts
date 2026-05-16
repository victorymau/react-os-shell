import { Router } from 'express';
import { z } from 'zod';
import { simpleParser } from 'mailparser';
import sanitizeHtml from 'sanitize-html';
import { AppError, asyncHandler } from '../errors';
import { getConnection } from '../services/imap';
import { getTransport } from '../services/smtp';
import { hashThreadRoot, pickThreadRootId } from '../services/threading';
import { requireSession, type AuthedRequest } from '../session';
import type { ImapFlow } from 'imapflow';

export const mailRouter = Router();
mailRouter.use(requireSession);

const SPECIAL_USE_MAP: Record<string, string> = {
  '\\Inbox': 'inbox',
  '\\Sent': 'sent',
  '\\Drafts': 'drafts',
  '\\Trash': 'trash',
  '\\Junk': 'junk',
  '\\Archive': 'archive',
  '\\Flagged': 'flagged',
};

function resolveSpecialUse(flags: Set<string>, path: string): string | null {
  for (const flag of flags) {
    if (SPECIAL_USE_MAP[flag]) return SPECIAL_USE_MAP[flag];
  }
  const upper = path.toUpperCase();
  if (upper === 'INBOX') return 'inbox';
  if (upper === 'SENT' || upper === 'SENT ITEMS' || upper === 'SENT MAIL') return 'sent';
  if (upper === 'DRAFTS') return 'drafts';
  if (upper === 'TRASH' || upper === 'DELETED ITEMS' || upper === 'BIN') return 'trash';
  if (upper === 'SPAM' || upper === 'JUNK') return 'junk';
  if (upper === 'ARCHIVE') return 'archive';
  return null;
}

async function findSpecialUseFolder(client: ImapFlow, kind: string): Promise<string | null> {
  const list = await client.list();
  for (const folder of list) {
    const flagSet = new Set<string>(Array.from(folder.flags ?? []).map(String));
    const specialUse = resolveSpecialUse(flagSet, folder.path);
    if (specialUse === kind) return folder.path;
  }
  return null;
}

mailRouter.get(
  '/folders',
  asyncHandler(async (req, res) => {
    const { session } = req as AuthedRequest;
    const client = await getConnection(session);
    const list = await client.list();
    const folders: Array<Record<string, unknown>> = [];
    for (const f of list) {
      const flags = new Set<string>(Array.from(f.flags ?? []).map(String));
      let status: { unseen?: number; messages?: number } = {};
      try {
        status = await client.status(f.path, { unseen: true, messages: true });
      } catch {
        status = {};
      }
      folders.push({
        path: f.path,
        name: f.name,
        delimiter: f.delimiter,
        specialUse: resolveSpecialUse(flags, f.path),
        subscribed: f.subscribed !== false,
        unreadCount: status.unseen ?? 0,
        totalCount: status.messages ?? 0,
      });
    }
    res.json({ folders });
  })
);

const listQuery = z.object({
  folder: z.string().min(1),
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().optional(),
});

mailRouter.get(
  '/messages',
  asyncHandler(async (req, res) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) throw new AppError(400, 'BAD_REQUEST', parsed.error.message);
    const { folder, page, pageSize, search } = parsed.data;
    const { session } = req as AuthedRequest;
    const client = await getConnection(session);

    let targetFolder = folder;
    let searchQuery: Record<string, unknown> | null = null;

    if (folder === '__starred__') {
      targetFolder = 'INBOX';
      searchQuery = { flagged: true };
    } else if (folder === '__unread__') {
      targetFolder = 'INBOX';
      searchQuery = { seen: false };
    }

    const lock = await client.getMailboxLock(targetFolder);
    try {
      let uids: number[];
      if (searchQuery || search) {
        const query: Record<string, unknown> = searchQuery ? { ...searchQuery } : {};
        if (search) query.body = search;
        const found = await client.search(query, { uid: true });
        uids = (found as number[]) || [];
      } else {
        const mailbox = client.mailbox && typeof client.mailbox === 'object' ? client.mailbox : null;
        const exists = mailbox && 'exists' in mailbox ? (mailbox as { exists: number }).exists : 0;
        if (!exists) {
          res.json({ folder: targetFolder, total: 0, page, messages: [] });
          return;
        }
        const all = await client.search({ all: true }, { uid: true });
        uids = (all as number[]) || [];
      }
      uids.sort((a, b) => b - a);
      const total = uids.length;
      const start = page * pageSize;
      const pageUids = uids.slice(start, start + pageSize);
      if (pageUids.length === 0) {
        res.json({ folder: targetFolder, total, page, messages: [] });
        return;
      }

      const messages: Array<Record<string, unknown>> = [];
      for await (const msg of client.fetch(
        pageUids,
        {
          uid: true,
          envelope: true,
          flags: true,
          bodyStructure: true,
          internalDate: true,
        },
        { uid: true }
      )) {
        const env = msg.envelope;
        const rootId = pickThreadRootId({
          messageId: env?.messageId,
          inReplyTo: env?.inReplyTo,
          references: (env as { references?: string[] | null } | undefined)?.references ?? null,
        });
        const flags = Array.from(msg.flags ?? []);
        const hasAttachments = bodyHasAttachments(msg.bodyStructure);
        messages.push({
          uid: msg.uid,
          threadId: hashThreadRoot(rootId),
          from: env?.from?.[0]
            ? { name: env.from[0].name || '', address: env.from[0].address || '' }
            : { name: '', address: '' },
          to: (env?.to ?? []).map(t => ({ name: t.name || '', address: t.address || '' })),
          subject: env?.subject || '',
          snippet: '',
          date: env?.date ? new Date(env.date).toISOString() : new Date(msg.internalDate || Date.now()).toISOString(),
          flags,
          hasAttachments,
          inReplyTo: env?.inReplyTo || null,
          references: (env as { references?: string[] | null } | undefined)?.references ?? [],
        });
      }
      messages.sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime());
      res.json({ folder: targetFolder, total, page, messages });
    } finally {
      lock.release();
    }
  })
);

function bodyHasAttachments(structure: unknown): boolean {
  if (!structure || typeof structure !== 'object') return false;
  const node = structure as { disposition?: string | null; childNodes?: unknown[] };
  if (node.disposition && /attachment/i.test(node.disposition)) return true;
  if (node.childNodes) {
    for (const child of node.childNodes) {
      if (bodyHasAttachments(child)) return true;
    }
  }
  return false;
}

const detailParams = z.object({ folder: z.string().min(1), uid: z.coerce.number().int().positive() });

mailRouter.get(
  '/messages/:folder/:uid',
  asyncHandler(async (req, res) => {
    const parsed = detailParams.safeParse(req.params);
    if (!parsed.success) throw new AppError(400, 'BAD_REQUEST', parsed.error.message);
    const { folder, uid } = parsed.data;
    const { session } = req as AuthedRequest;
    const client = await getConnection(session);
    const lock = await client.getMailboxLock(folder);
    try {
      const message = await client.fetchOne(String(uid), { uid: true, source: true, envelope: true, flags: true }, { uid: true });
      if (!message || !message.source) throw new AppError(404, 'NOT_FOUND', `Message ${uid} not found in ${folder}`);
      const parsedMail = await simpleParser(message.source as Buffer);
      const env = message.envelope;
      const rootId = pickThreadRootId({
        messageId: env?.messageId,
        inReplyTo: env?.inReplyTo,
        references: (env as { references?: string[] | null } | undefined)?.references ?? null,
      });
      const baseAttachmentUrl = `/api/mail/messages/${encodeURIComponent(folder)}/${uid}/attachments`;
      const attachments = (parsedMail.attachments || []).map((att, idx) => ({
        partId: att.contentId || `att-${idx}`,
        filename: att.filename || `attachment-${idx}`,
        contentType: att.contentType,
        size: att.size,
        contentId: att.contentId || null,
      }));
      const cidMap = new Map<string, string>();
      for (const att of attachments) {
        if (att.contentId) {
          cidMap.set(att.contentId.replace(/^<|>$/g, ''), `${baseAttachmentUrl}/${encodeURIComponent(att.partId)}`);
        }
      }
      const cleanHtml = parsedMail.html
        ? sanitizeHtml(parsedMail.html.replace(/cid:([^"'\s>]+)/g, (m, cid) => cidMap.get(cid) || m), {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'style']),
            allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, '*': ['style', 'class'], img: ['src', 'alt', 'title', 'width', 'height'] },
            allowedSchemes: ['http', 'https', 'data', 'mailto'],
          })
        : null;

      res.json({
        uid: message.uid,
        threadId: hashThreadRoot(rootId),
        from: parsedMail.from?.value?.[0]
          ? { name: parsedMail.from.value[0].name || '', address: parsedMail.from.value[0].address || '' }
          : { name: '', address: '' },
        to: (parsedMail.to ? toArray(parsedMail.to) : []).flatMap(a => a.value.map(v => ({ name: v.name || '', address: v.address || '' }))),
        cc: (parsedMail.cc ? toArray(parsedMail.cc) : []).flatMap(a => a.value.map(v => ({ name: v.name || '', address: v.address || '' }))),
        subject: parsedMail.subject || '',
        date: parsedMail.date ? parsedMail.date.toISOString() : new Date().toISOString(),
        flags: Array.from(message.flags ?? []),
        text: parsedMail.text || null,
        html: cleanHtml,
        attachments,
        inReplyTo: parsedMail.inReplyTo || null,
        references: Array.isArray(parsedMail.references) ? parsedMail.references : parsedMail.references ? [parsedMail.references] : [],
      });
    } finally {
      lock.release();
    }
  })
);

function toArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}

mailRouter.get(
  '/messages/:folder/:uid/attachments/:partId',
  asyncHandler(async (req, res) => {
    const folder = req.params.folder;
    const uid = Number(req.params.uid);
    const partId = req.params.partId;
    const { session } = req as AuthedRequest;
    const client = await getConnection(session);
    const lock = await client.getMailboxLock(folder);
    try {
      const message = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
      if (!message || !message.source) throw new AppError(404, 'NOT_FOUND', `Message ${uid} not found`);
      const parsed = await simpleParser(message.source as Buffer);
      const match = (parsed.attachments || []).find((a, idx) => (a.contentId || `att-${idx}`) === partId);
      if (!match) throw new AppError(404, 'NOT_FOUND', `Attachment ${partId} not found`);
      res.setHeader('Content-Type', match.contentType || 'application/octet-stream');
      if (match.filename) {
        res.setHeader('Content-Disposition', `attachment; filename="${match.filename.replace(/"/g, '')}"`);
      }
      res.send(match.content);
    } finally {
      lock.release();
    }
  })
);

const flagsBody = z.object({ add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() });

mailRouter.post(
  '/messages/:folder/:uid/flags',
  asyncHandler(async (req, res) => {
    const folder = req.params.folder;
    const uid = Number(req.params.uid);
    const body = flagsBody.parse(req.body);
    const { session } = req as AuthedRequest;
    const client = await getConnection(session);
    const lock = await client.getMailboxLock(folder);
    try {
      if (body.add?.length) await client.messageFlagsAdd(String(uid), body.add as string[], { uid: true });
      if (body.remove?.length) await client.messageFlagsRemove(String(uid), body.remove as string[], { uid: true });
      const message = await client.fetchOne(String(uid), { uid: true, flags: true }, { uid: true });
      const flagsOut: string[] = message ? Array.from((message.flags ?? []) as Set<string>) : [];
      res.json({ flags: flagsOut });
    } finally {
      lock.release();
    }
  })
);

const moveBody = z.object({ destinationFolder: z.string().min(1) });

mailRouter.post(
  '/messages/:folder/:uid/move',
  asyncHandler(async (req, res) => {
    const folder = req.params.folder;
    const uid = Number(req.params.uid);
    const { destinationFolder } = moveBody.parse(req.body);
    const { session } = req as AuthedRequest;
    const client = await getConnection(session);
    const lock = await client.getMailboxLock(folder);
    try {
      const result = await client.messageMove(String(uid), destinationFolder, { uid: true });
      const newUid = result && 'uidMap' in result ? Array.from((result.uidMap as Map<number, number>).values())[0] ?? null : null;
      res.json({ newUid, newFolder: destinationFolder });
    } finally {
      lock.release();
    }
  })
);

mailRouter.delete(
  '/messages/:folder/:uid',
  asyncHandler(async (req, res) => {
    const folder = req.params.folder;
    const uid = Number(req.params.uid);
    const { session } = req as AuthedRequest;
    const client = await getConnection(session);
    const trashPath = (await findSpecialUseFolder(client, 'trash')) || 'Trash';

    if (folder === trashPath) {
      const lock = await client.getMailboxLock(folder);
      try {
        await client.messageDelete(String(uid), { uid: true });
      } finally {
        lock.release();
      }
    } else {
      const lock = await client.getMailboxLock(folder);
      try {
        await client.messageMove(String(uid), trashPath, { uid: true });
      } finally {
        lock.release();
      }
    }
    res.status(204).end();
  })
);

const sendBody = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().default(''),
  text: z.string().optional(),
  html: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.array(z.string()).optional(),
  attachments: z.array(z.object({
    filename: z.string(),
    contentBase64: z.string(),
    contentType: z.string(),
  })).optional(),
  saveToSent: z.boolean().default(true),
});

mailRouter.post(
  '/send',
  asyncHandler(async (req, res) => {
    const body = sendBody.parse(req.body);
    const { session } = req as AuthedRequest;
    const transport = getTransport(session);
    const info = await transport.sendMail({
      from: session.email,
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      text: body.text,
      html: body.html,
      inReplyTo: body.inReplyTo,
      references: body.references,
      attachments: body.attachments?.map(a => ({
        filename: a.filename,
        content: Buffer.from(a.contentBase64, 'base64'),
        contentType: a.contentType,
      })),
    });

    let sentUid: number | null = null;
    if (body.saveToSent) {
      try {
        const client = await getConnection(session);
        const sentFolder = (await findSpecialUseFolder(client, 'sent')) || 'Sent';
        const append = await client.append(sentFolder, info.message as string | Buffer, ['\\Seen']);
        sentUid = append ? append.uid ?? null : null;
      } catch {
        sentUid = null;
      }
    }
    res.json({ messageId: info.messageId, sentUid });
  })
);

const draftBody = sendBody.extend({ draftUid: z.number().int().positive().optional() }).omit({ saveToSent: true });

mailRouter.post(
  '/drafts',
  asyncHandler(async (req, res) => {
    const body = draftBody.parse(req.body);
    const { session } = req as AuthedRequest;
    const client = await getConnection(session);
    const draftsFolder = (await findSpecialUseFolder(client, 'drafts')) || 'Drafts';
    const transport = getTransport(session);
    const built = await transport.sendMail({
      from: session.email,
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      text: body.text,
      html: body.html,
      inReplyTo: body.inReplyTo,
      references: body.references,
      attachments: body.attachments?.map(a => ({
        filename: a.filename,
        content: Buffer.from(a.contentBase64, 'base64'),
        contentType: a.contentType,
      })),
      // Don't actually send; we just want the raw RFC822
      envelope: { from: session.email, to: [] },
    } as never).catch(() => null);
    // built may be null because we constructed an empty envelope to suppress send; fall back to manual build:
    if (!built || !built.message) {
      // Construct a minimal RFC 822 message manually
      const lines = [
        `From: ${session.email}`,
        `To: ${body.to.join(', ')}`,
        body.cc?.length ? `Cc: ${body.cc.join(', ')}` : null,
        `Subject: ${body.subject}`,
        body.inReplyTo ? `In-Reply-To: ${body.inReplyTo}` : null,
        body.references?.length ? `References: ${body.references.join(' ')}` : null,
        'MIME-Version: 1.0',
        body.html ? 'Content-Type: text/html; charset=utf-8' : 'Content-Type: text/plain; charset=utf-8',
        '',
        body.html || body.text || '',
      ]
        .filter(Boolean)
        .join('\r\n');
      const append = await client.append(draftsFolder, lines, ['\\Draft']);
      if (body.draftUid) {
        const lock = await client.getMailboxLock(draftsFolder);
        try { await client.messageDelete(String(body.draftUid), { uid: true }); } finally { lock.release(); }
      }
      res.json({ uid: append ? append.uid ?? null : null });
      return;
    }
    const append = await client.append(draftsFolder, built.message as Buffer | string, ['\\Draft']);
    if (body.draftUid) {
      const lock = await client.getMailboxLock(draftsFolder);
      try { await client.messageDelete(String(body.draftUid), { uid: true }); } finally { lock.release(); }
    }
    res.json({ uid: append ? append.uid ?? null : null });
  })
);

const threadQuery = z.object({ folder: z.string().min(1) });

mailRouter.get(
  '/threads/:threadId',
  asyncHandler(async (req, res) => {
    const { folder } = threadQuery.parse(req.query);
    const threadId = req.params.threadId;
    const { session } = req as AuthedRequest;
    const client = await getConnection(session);
    const lock = await client.getMailboxLock(folder);
    try {
      const allUids = await client.search({ all: true }, { uid: true });
      const messages: Array<Record<string, unknown>> = [];
      for await (const msg of client.fetch(allUids as number[], { uid: true, envelope: true, flags: true }, { uid: true })) {
        const rootId = pickThreadRootId({
          messageId: msg.envelope?.messageId,
          inReplyTo: msg.envelope?.inReplyTo,
          references: (msg.envelope as { references?: string[] | null } | undefined)?.references ?? null,
        });
        if (hashThreadRoot(rootId) !== threadId) continue;
        messages.push({
          uid: msg.uid,
          subject: msg.envelope?.subject || '',
          from: msg.envelope?.from?.[0] ? { name: msg.envelope.from[0].name || '', address: msg.envelope.from[0].address || '' } : null,
          date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : new Date().toISOString(),
          flags: Array.from(msg.flags ?? []),
        });
      }
      messages.sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime());
      res.json({ messages });
    } finally {
      lock.release();
    }
  })
);

mailRouter.get(
  '/unread-counts',
  asyncHandler(async (req, res) => {
    const { session } = req as AuthedRequest;
    const client = await getConnection(session);
    const counts: Record<string, number> = {};
    const list = await client.list();
    for (const f of list) {
      try {
        const s = await client.status(f.path, { unseen: true });
        counts[f.path] = s.unseen ?? 0;
      } catch {
        counts[f.path] = 0;
      }
    }
    res.json({ counts });
  })
);
