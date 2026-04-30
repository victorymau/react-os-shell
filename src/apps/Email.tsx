import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import useGoogleAuth from '../hooks/useGoogleAuth';
import { isDemoMode, getDemoEmails } from './google-demo-fixtures';
import toast from '../shell/toast';
import Modal, { ModalActions } from '../shell/Modal';
import EditableGrid from '../shell/EditableGrid';
import { formatDate, formatDateTime } from '../utils/date';

// ── Gmail API helpers ──
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailThread {
  id: string;
  snippet: string;
  historyId: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: {
    headers: { name: string; value: string }[];
    mimeType: string;
    body?: { data?: string };
    parts?: { mimeType: string; body?: { data?: string; attachmentId?: string }; filename?: string; headers?: { name: string; value: string }[]; parts?: any[] }[];
  };
  labelIds: string[];
  internalDate: string;
  historyId?: string;
}

interface EmailItem {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  date: Date;
  isUnread: boolean;
  isStarred: boolean;
  hasAttachment: boolean;
  attachmentCount: number;
  labelIds: string[];
  threadCount: number;
}

interface AttachmentInfo {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size?: number;
}

import { setEmailUnreadCount } from '../hooks/useEmailUnread';
import { glassStyle as getGlassStyle } from '../utils/glass';

function getHeader(msg: GmailMessage, name: string): string {
  return msg.payload.headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function parseFrom(from: string): { name: string; email: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].replace(/"/g, ''), email: match[2] };
  return { name: from, email: from };
}

function decodeBase64(data: string): string {
  try {
    return decodeURIComponent(escape(atob(data.replace(/-/g, '+').replace(/_/g, '/'))));
  } catch {
    try { return atob(data.replace(/-/g, '+').replace(/_/g, '/')); } catch { return ''; }
  }
}

function buildCidMap(parts: any[] | undefined): Record<string, { attachmentId: string; mimeType: string }> {
  const map: Record<string, { attachmentId: string; mimeType: string }> = {};
  if (!parts) return map;
  for (const part of parts) {
    if (part.body?.attachmentId) {
      const cidHeader = (part.headers || []).find((h: any) => h.name.toLowerCase() === 'content-id');
      if (cidHeader) {
        const cid = cidHeader.value.replace(/^<|>$/g, '');
        map[cid] = { attachmentId: part.body.attachmentId, mimeType: part.mimeType };
      }
    }
    if (part.parts) Object.assign(map, buildCidMap(part.parts));
  }
  return map;
}

function getAttachments(msg: GmailMessage): AttachmentInfo[] {
  const attachments: AttachmentInfo[] = [];
  const walk = (parts: any[] | undefined) => {
    if (!parts) return;
    for (const part of parts) {
      if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
        attachments.push({ filename: part.filename, mimeType: part.mimeType, attachmentId: part.body.attachmentId, size: part.body.size });
      }
      if (part.parts) walk(part.parts);
    }
  };
  walk(msg.payload.parts);
  return attachments;
}

function getMessageBody(msg: GmailMessage): string {
  const findPart = (parts: any[] | undefined, mime: string): string | null => {
    if (!parts) return null;
    for (const part of parts) {
      if (part.mimeType === mime && part.body?.data) return decodeBase64(part.body.data);
      if (part.parts) { const found = findPart(part.parts, mime); if (found) return found; }
    }
    return null;
  };

  let html: string | null = null;

  if (msg.payload.parts) {
    html = findPart(msg.payload.parts, 'text/html');
    if (!html) {
      const text = findPart(msg.payload.parts, 'text/plain');
      if (text) return `<pre style="white-space:pre-wrap;font-family:inherit;">${text.replace(/</g, '&lt;')}</pre>`;
    }
  }

  if (!html && msg.payload.body?.data) {
    const decoded = decodeBase64(msg.payload.body.data);
    if (msg.payload.mimeType === 'text/html') html = decoded;
    else return `<pre style="white-space:pre-wrap;font-family:inherit;">${decoded.replace(/</g, '&lt;')}</pre>`;
  }

  if (!html) return '<p style="color:#999;">No content</p>';

  const cidMap = buildCidMap(msg.payload.parts);
  html = html.replace(/src=["']cid:([^"']+)["']/gi, (_match, cid) => {
    const info = cidMap[cid];
    if (info) {
      return `src="" data-cid-attachment="${info.attachmentId}" data-cid-mime="${info.mimeType}" data-msg-id="${msg.id}"`;
    }
    return _match;
  });

  return html;
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return formatDate(date.toISOString());
}

function avatarColor(name: string): string {
  const colors = ['bg-blue-500', 'bg-red-500', 'bg-green-500', 'bg-purple-500', 'bg-yellow-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function isImageAttachment(att: AttachmentInfo): boolean {
  return /^image\/(jpe?g|png|gif|webp|bmp|svg)$/i.test(att.mimeType);
}

/** Batch API: fetch up to 100 messages in a single HTTP request */
async function batchFetchMessages(token: string, msgIds: { id: string; threadId: string }[]): Promise<EmailItem[]> {
  if (msgIds.length === 0) return [];
  const boundary = `batch_${Date.now()}`;
  const parts = msgIds.map((m, i) =>
    `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <item${i}>\r\n\r\nGET /gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&fields=id,threadId,snippet,internalDate,labelIds,historyId,payload(headers,parts(filename))\r\n`
  );
  const body = parts.join('') + `--${boundary}--`;

  const res = await fetch('https://www.googleapis.com/batch/gmail/v1', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/mixed; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const results = await Promise.all(
      msgIds.map(m =>
        fetch(`${GMAIL_API}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&fields=id,threadId,snippet,internalDate,labelIds,historyId,payload(headers,parts(filename))`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json())
      )
    );
    return addThreadCounts(results.map(parseMessageToItem));
  }

  const text = await res.text();
  const responseBoundary = res.headers.get('content-type')?.match(/boundary=(.+)/)?.[1] || '';
  const responseParts = text.split(`--${responseBoundary}`).filter(p => p.includes('HTTP/'));
  const items: EmailItem[] = [];
  for (const part of responseParts) {
    const jsonMatch = part.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const msg = JSON.parse(jsonMatch[0]);
        if (msg.id) items.push(parseMessageToItem(msg));
      } catch {}
    }
  }
  return addThreadCounts(items);
}

function parseMessageToItem(msg: any): EmailItem {
  const from = parseFrom(getHeader(msg, 'From'));
  const parts = msg.payload?.parts || [];
  const attachments = parts.filter((p: any) => p.filename && p.filename.length > 0);
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: from.name,
    fromEmail: from.email,
    subject: getHeader(msg, 'Subject') || '(no subject)',
    snippet: msg.snippet || '',
    date: new Date(parseInt(msg.internalDate)),
    isUnread: (msg.labelIds || []).includes('UNREAD'),
    isStarred: (msg.labelIds || []).includes('STARRED'),
    hasAttachment: attachments.length > 0,
    attachmentCount: attachments.length,
    labelIds: msg.labelIds || [],
    threadCount: 1,
  };
}

function addThreadCounts(items: EmailItem[]): EmailItem[] {
  const threadCounts = new Map<string, number>();
  for (const item of items) {
    threadCounts.set(item.threadId, (threadCounts.get(item.threadId) || 0) + 1);
  }
  return items.map(item => ({ ...item, threadCount: threadCounts.get(item.threadId) || 1 }));
}

function getCategoryLabel(labelIds: string[]): { text: string; color: string } | null {
  if (labelIds.includes('CATEGORY_SOCIAL')) return { text: 'Social', color: 'bg-blue-100 text-blue-700' };
  if (labelIds.includes('CATEGORY_PROMOTIONS')) return { text: 'Promo', color: 'bg-green-100 text-green-700' };
  if (labelIds.includes('CATEGORY_UPDATES')) return { text: 'Updates', color: 'bg-yellow-100 text-yellow-700' };
  if (labelIds.includes('CATEGORY_FORUMS')) return { text: 'Forums', color: 'bg-purple-100 text-purple-700' };
  return null;
}

// ── Undo-send toast ──
function showUndoToast(message: string, onUndo: () => void, durationMs = 5000): { dismiss: () => void } {
  const container = (() => {
    let el = document.getElementById('toast-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast-container';
      el.className = 'fixed top-4 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none';
      document.body.appendChild(el);
    }
    return el;
  })();

  const toastEl = document.createElement('div');
  toastEl.className = 'bg-gray-800 text-white px-5 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-3 max-w-lg pointer-events-auto';
  toastEl.style.opacity = '0';
  toastEl.style.transform = 'translateX(20px)';
  toastEl.style.transition = 'opacity 300ms ease, transform 300ms ease';

  const span = document.createElement('span');
  span.textContent = message;
  toastEl.appendChild(span);

  const progressBar = document.createElement('div');
  progressBar.className = 'absolute bottom-0 left-0 h-0.5 bg-blue-400 rounded-b-lg';
  progressBar.style.width = '100%';
  progressBar.style.transition = `width ${durationMs}ms linear`;
  toastEl.style.position = 'relative';
  toastEl.style.overflow = 'hidden';
  toastEl.appendChild(progressBar);

  const undoBtn = document.createElement('button');
  undoBtn.textContent = 'Undo';
  undoBtn.className = 'text-blue-300 hover:text-blue-100 font-semibold text-sm shrink-0';
  undoBtn.onclick = () => {
    onUndo();
    dismiss();
  };
  toastEl.appendChild(undoBtn);

  container.appendChild(toastEl);

  requestAnimationFrame(() => {
    toastEl.style.opacity = '1';
    toastEl.style.transform = 'translateX(0)';
    requestAnimationFrame(() => { progressBar.style.width = '0%'; });
  });

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateX(20px)';
    setTimeout(() => toastEl.remove(), 300);
  };

  const timer = setTimeout(dismiss, durationMs);

  return {
    dismiss: () => { clearTimeout(timer); dismiss(); },
  };
}

// ── Contact cache for autocomplete ──
const RECENT_RECIPIENTS_KEY = 'email_recent_recipients';

function getRecentRecipients(): { name: string; email: string }[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_RECIPIENTS_KEY) || '[]');
  } catch { return []; }
}

function addRecentRecipient(email: string, name?: string) {
  const list = getRecentRecipients();
  const existing = list.findIndex(r => r.email === email);
  if (existing >= 0) list.splice(existing, 1);
  list.unshift({ name: name || email, email });
  localStorage.setItem(RECENT_RECIPIENTS_KEY, JSON.stringify(list.slice(0, 50)));
}

// ── Main Component ──
export default function Email() {
  const { isConnected, user, accessToken, connect, disconnect, loading: authLoading, error: authError, hasClientId, setClientId } = useGoogleAuth();
  const [messages, setMessages] = useState<EmailItem[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMsg, setSelectedMsg] = useState<GmailMessage | null>(null);
  const [threadMsgs, setThreadMsgs] = useState<GmailMessage[]>([]);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [composing, setComposing] = useState(false);
  const [replyTo, setReplyTo] = useState<{ to: string; subject: string; threadId: string; messageId: string } | null>(null);
  const [forwardBody, setForwardBody] = useState<string | null>(null);
  const [label, setLabel] = useState('INBOX');
  const [clientIdInput, setClientIdInput] = useState('');
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [splitPane, setSplitPane] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const [userLabels, setUserLabels] = useState<{ id: string; name: string; type: string }[]>([]);
  const [spreadsheetData, setSpreadsheetData] = useState<{ name: string; sheetNames: string[]; sheets: Record<string, string[][]> } | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; filename: string } | null>(null);
  const [collapsedThreadMsgs, setCollapsedThreadMsgs] = useState<Set<string>>(new Set());

  const isSpreadsheet = (filename: string) => /\.(xlsx|xls|csv|tsv|ods)$/i.test(filename);

  const openSpreadsheet = async (msgId: string, attachmentId: string, filename: string) => {
    if (!accessToken) return;
    try {
      toast.info(`Opening ${filename}...`);
      const res = await fetch(`${GMAIL_API}/messages/${msgId}/attachments/${attachmentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!data.data) { toast.error('No attachment data'); return; }
      const b64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
      const byteChars = atob(b64);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);

      const XLSX = (await import('xlsx'));
      const wb = XLSX.read(byteArr, { type: 'array' });
      const sheets: Record<string, string[][]> = {};
      for (const name of wb.SheetNames) {
        const rows: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
        // Normalize: ensure all rows have the same column count
        const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
        sheets[name] = rows.map(r => { while (r.length < maxCols) r.push(''); return r.map(c => String(c ?? '')); });
      }
      setSpreadsheetData({ name: filename, sheetNames: wb.SheetNames, sheets });
    } catch (err: any) {
      toast.error(`Failed to open spreadsheet: ${err.message || 'Unknown error'}`);
    }
  };

  const unreadCount = useMemo(() => messages.filter(m => m.isUnread).length, [messages]);

  // Update global unread count from all cached labels (deduplicated by message ID)
  useEffect(() => {
    const allIds = new Set<string>();
    let total = 0;
    // Count from current view
    for (const m of messages) { if (m.isUnread && !allIds.has(m.id)) { allIds.add(m.id); total++; } }
    // Count from cached labels
    for (const [, cached] of Object.entries(msgCacheRef.current)) {
      for (const m of cached.items) { if (m.isUnread && !allIds.has(m.id)) { allIds.add(m.id); total++; } }
    }
    setEmailUnreadCount(total);
  }, [messages]);

  const msgBodyCacheRef = useRef<Record<string, { msgs: GmailMessage[]; ts: number }>>({});
  const MSG_BODY_TTL = 5 * 60 * 1000;

  // History API state
  const latestHistoryIdRef = useRef<string | null>(null);
  const HISTORY_ID_KEY = 'email_history_id';

  useEffect(() => {
    try {
      latestHistoryIdRef.current = localStorage.getItem(HISTORY_ID_KEY);
    } catch {}
  }, []);

  const updateHistoryId = useCallback((historyId: string | undefined) => {
    if (!historyId) return;
    const current = latestHistoryIdRef.current;
    if (!current || BigInt(historyId) > BigInt(current)) {
      latestHistoryIdRef.current = historyId;
      try { localStorage.setItem(HISTORY_ID_KEY, historyId); } catch {}
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${GMAIL_API}/labels`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.json())
      .then(data => {
        const labels = (data.labels || [])
          .filter((l: any) => l.type === 'user')
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
        setUserLabels(labels);
      })
      .catch(() => {});
  }, [accessToken]);

  const msgCacheRef = useRef<Record<string, { items: EmailItem[]; ts: number }>>({});
  const MSG_CACHE_TTL = 2 * 60 * 1000;
  const PERSIST_KEY = 'email_msg_cache';

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(PERSIST_KEY) || '{}');
      for (const [key, val] of Object.entries(stored)) {
        const v = val as any;
        if (v.items) {
          v.items = v.items.map((m: any) => ({ ...m, date: new Date(m.date) }));
          msgCacheRef.current[key] = v;
        }
      }
    } catch {}
  }, []);

  const persistCache = useCallback(() => {
    try {
      const toSave: Record<string, any> = {};
      for (const [key, val] of Object.entries(msgCacheRef.current)) {
        if (['INBOX', 'STARRED', 'SENT', 'DRAFT'].includes(key)) toSave[key] = val;
      }
      localStorage.setItem(PERSIST_KEY, JSON.stringify(toSave));
    } catch {}
  }, []);

  const fetchMessages = useCallback(async (labelId: string, pageToken?: string, query?: string, force = false) => {
    if (!accessToken) return;
    const cacheKey = query ? `q:${query}` : labelId;

    if (!force && !pageToken && msgCacheRef.current[cacheKey]) {
      const cached = msgCacheRef.current[cacheKey];
      if (Date.now() - cached.ts < MSG_CACHE_TTL) {
        setMessages(cached.items);
        setLoadingMsgs(false);
        return;
      }
      setMessages(cached.items);
    }

    if (!msgCacheRef.current[cacheKey]) setLoadingMsgs(true);
    try {
      const params = new URLSearchParams({ maxResults: '30' });
      if (query) { params.set('q', query); } else { params.set('labelIds', labelId); }
      if (pageToken) params.set('pageToken', pageToken);
      const res = await fetch(`${GMAIL_API}/messages?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to fetch messages');
      const data = await res.json();
      const msgIds: { id: string; threadId: string }[] = data.messages || [];
      setNextPageToken(data.nextPageToken || null);

      const details = await batchFetchMessages(accessToken, msgIds);

      // Track historyId from responses
      for (const item of details) {
        // Items don't have historyId directly, but we capture from raw responses in batchFetch
      }

      if (pageToken) {
        setMessages(prev => {
          const merged = [...prev, ...details];
          msgCacheRef.current[cacheKey] = { items: merged, ts: Date.now() };
          persistCache();
          return merged;
        });
      } else {
        setMessages(details);
        msgCacheRef.current[cacheKey] = { items: details, ts: Date.now() };
        persistCache();
      }
    } catch (err: any) {
      if (!msgCacheRef.current[cacheKey]) toast.error(err.message || 'Failed to load emails');
    }
    setLoadingMsgs(false);
  }, [accessToken]);

  useEffect(() => {
    if (isConnected) fetchMessages(label, undefined, activeSearch || undefined);
  }, [isConnected, label, fetchMessages, activeSearch]);

  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (!isConnected || prefetchedRef.current) return;
    prefetchedRef.current = true;
    const timer = setTimeout(() => {
      ['STARRED', 'SENT', 'DRAFT'].forEach(l => {
        if (l !== label && !msgCacheRef.current[l]) fetchMessages(l);
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [isConnected, label, fetchMessages]);

  // Incremental sync via History API
  const incrementalSync = useCallback(async () => {
    if (!accessToken || !latestHistoryIdRef.current) return false;
    try {
      const params = new URLSearchParams({
        startHistoryId: latestHistoryIdRef.current,
        labelId: label,
        historyTypes: 'messageAdded,messageDeleted,labelAdded,labelRemoved',
      });
      const res = await fetch(`${GMAIL_API}/history?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 404) return false; // History too old
      if (!res.ok) return false;
      const data = await res.json();
      if (data.historyId) updateHistoryId(data.historyId);
      if (!data.history || data.history.length === 0) return true; // No changes
      return false; // Has changes, need full refresh
    } catch {
      return false;
    }
  }, [accessToken, label, updateHistoryId]);

  // No auto-refresh — use manual refresh button or WebSocket for real-time updates

  // Capture historyId from opened messages
  const captureHistoryId = useCallback((msg: GmailMessage) => {
    if (msg.historyId) updateHistoryId(msg.historyId);
  }, [updateHistoryId]);

  const openDraft = async (msgId: string) => {
    if (!accessToken) return;
    try {
      // Find the draft by message ID
      const draftsRes = await fetch(`${GMAIL_API}/drafts`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const draftsData = await draftsRes.json();
      const draft = (draftsData.drafts || []).find((d: any) => d.message?.id === msgId);
      if (!draft) { openMessage(msgId); return; }
      // Fetch full draft content
      const res = await fetch(`${GMAIL_API}/drafts/${draft.id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const draftData = await res.json();
      const msg: GmailMessage = draftData.message;
      const to = getHeader(msg, 'To');
      const subject = getHeader(msg, 'Subject');
      const body = getMessageBody(msg);
      setReplyTo({ to, subject, threadId: msg.threadId || '', messageId: '' });
      setForwardBody(null);
      setComposing(true);
      // Set editor content after compose mounts
      setTimeout(() => {
        const editor = document.querySelector('[contenteditable="true"]') as HTMLElement;
        if (editor) editor.innerHTML = body;
      }, 100);
    } catch {
      toast.error('Failed to open draft');
    }
  };

  const openMessage = async (id: string, threadId?: string) => {
    if (!accessToken) return;
    setSelectedId(id);
    setCollapsedThreadMsgs(new Set());
    const tId = threadId || id;

    const cached = msgBodyCacheRef.current[tId];
    if (cached && Date.now() - cached.ts < MSG_BODY_TTL) {
      setThreadMsgs(cached.msgs);
      setSelectedMsg(cached.msgs[cached.msgs.length - 1]);
      // Collapse all but last
      const collapsed = new Set(cached.msgs.slice(0, -1).map(m => m.id));
      setCollapsedThreadMsgs(collapsed);
    } else {
      setLoadingMsg(true);
      setThreadMsgs([]);
    }

    const msgItem = messages.find(m => m.id === id);
    if (msgItem?.isUnread) {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, isUnread: false } : m));
      fetch(`${GMAIL_API}/messages/${id}/modify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      }).catch(() => {});
    }

    if (!cached || Date.now() - cached.ts >= MSG_BODY_TTL) {
      try {
        const threadRes = await fetch(`${GMAIL_API}/threads/${tId}?format=full`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (threadRes.ok) {
          const threadData = await threadRes.json();
          const allMsgs: GmailMessage[] = threadData.messages || [];
          if (allMsgs.length > 0) {
            setThreadMsgs(allMsgs);
            setSelectedMsg(allMsgs[allMsgs.length - 1]);
            msgBodyCacheRef.current[tId] = { msgs: allMsgs, ts: Date.now() };
            // Collapse all but last
            const collapsed = new Set(allMsgs.slice(0, -1).map(m => m.id));
            setCollapsedThreadMsgs(collapsed);
            allMsgs.forEach(captureHistoryId);
          }
        } else {
          const res = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const msg: GmailMessage = await res.json();
          setSelectedMsg(msg);
          setThreadMsgs([msg]);
          msgBodyCacheRef.current[tId] = { msgs: [msg], ts: Date.now() };
          captureHistoryId(msg);
        }
      } catch { toast.error('Failed to load message'); }
      setLoadingMsg(false);
    }
  };

  const toggleStar = async (id: string, isStarred: boolean) => {
    if (!accessToken) return;
    const body = isStarred ? { removeLabelIds: ['STARRED'] } : { addLabelIds: ['STARRED'] };
    await fetch(`${GMAIL_API}/messages/${id}/modify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setMessages(prev => prev.map(m => m.id === id ? { ...m, isStarred: !isStarred } : m));
  };

  const archiveMessage = async (id: string) => {
    if (!accessToken) return;
    setMessages(prev => prev.filter(m => m.id !== id));
    if (selectedId === id) { setSelectedId(null); setSelectedMsg(null); setThreadMsgs([]); }
    toast.success('Archived.');
    fetch(`${GMAIL_API}/messages/${id}/modify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
    }).catch(() => toast.error('Failed to archive'));
  };

  const trashMessage = async (id: string) => {
    if (!accessToken) return;
    setMessages(prev => prev.filter(m => m.id !== id));
    if (selectedId === id) { setSelectedId(null); setSelectedMsg(null); setThreadMsgs([]); }
    toast.success('Moved to Trash.');
    fetch(`${GMAIL_API}/messages/${id}/trash`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => toast.error('Failed to delete'));
  };

  const modifyMessages = async (ids: string[], addLabels: string[], removeLabels: string[]) => {
    if (!accessToken) return;
    await Promise.all(ids.map(id =>
      fetch(`${GMAIL_API}/messages/${id}/modify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ addLabelIds: addLabels, removeLabelIds: removeLabels }),
      })
    ));
  };

  const bulkArchive = async () => {
    const ids = [...selectedIds];
    await modifyMessages(ids, [], ['INBOX']);
    setMessages(prev => prev.filter(m => !selectedIds.has(m.id)));
    setSelectedIds(new Set());
    toast.success(`Archived ${ids.length} message(s).`);
  };

  const bulkDelete = async () => {
    const ids = [...selectedIds];
    await Promise.all(ids.map(id => fetch(`${GMAIL_API}/messages/${id}/trash`, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
    })));
    setMessages(prev => prev.filter(m => !selectedIds.has(m.id)));
    setSelectedIds(new Set());
    toast.success(`Deleted ${ids.length} message(s).`);
  };

  const bulkMarkRead = async () => {
    const ids = [...selectedIds];
    await modifyMessages(ids, [], ['UNREAD']);
    setMessages(prev => prev.map(m => selectedIds.has(m.id) ? { ...m, isUnread: false } : m));
    setSelectedIds(new Set());
    toast.success('Marked as read.');
  };

  const bulkMarkUnread = async () => {
    const ids = [...selectedIds];
    await modifyMessages(ids, ['UNREAD'], []);
    setMessages(prev => prev.map(m => selectedIds.has(m.id) ? { ...m, isUnread: true } : m));
    setSelectedIds(new Set());
    toast.success('Marked as unread.');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === messages.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(messages.map(m => m.id)));
  };

  const isImage = (filename: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(filename);

  const downloadAttachment = async (msgId: string, attachmentId: string, filename: string) => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${GMAIL_API}/messages/${msgId}/attachments/${attachmentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (data.data) {
        const b64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
        const byteChars = atob(b64);
        const byteArr = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArr]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      }
    } catch { toast.error('Failed to download attachment'); }
  };

  const openAttachment = async (msgId: string, attachmentId: string, filename: string, mimeType: string) => {
    if (!accessToken) return;
    if (isImage(filename) || mimeType.startsWith('image/')) {
      try {
        const res = await fetch(`${GMAIL_API}/messages/${msgId}/attachments/${attachmentId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        if (data.data) {
          const b64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
          setLightbox({ src: `data:${mimeType};base64,${b64}`, filename });
        }
      } catch { toast.error('Failed to open image'); }
    } else {
      downloadAttachment(msgId, attachmentId, filename);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchQuery);
    setSelectedId(null); setSelectedMsg(null); setThreadMsgs([]);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setActiveSearch('');
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if (e.key === 'c' && !composing) { setComposing(true); return; }
      if (e.key === 'e' && selectedId) { archiveMessage(selectedId); return; }
      if (e.key === '#' && selectedId) { trashMessage(selectedId); return; }
      if (e.key === 'r' && selectedMsg) {
        e.preventDefault();
        setReplyTo({
          to: parseFrom(getHeader(selectedMsg, 'From')).email,
          subject: `Re: ${getHeader(selectedMsg, 'Subject')}`,
          threadId: selectedMsg.threadId,
          messageId: getHeader(selectedMsg, 'Message-ID') || selectedMsg.id,
        });
        setComposing(true);
        return;
      }
      if (e.key === 'j') { setFocusIdx(prev => Math.min(prev + 1, messages.length - 1)); return; }
      if (e.key === 'k') { setFocusIdx(prev => Math.max(prev - 1, 0)); return; }
      if (e.key === 'Enter' && focusIdx >= 0 && focusIdx < messages.length && !selectedMsg) {
        const msg = messages[focusIdx];
        openMessage(msg.id, msg.threadId);
        return;
      }
      if (e.key === 'x' && focusIdx >= 0 && focusIdx < messages.length) {
        toggleSelect(messages[focusIdx].id);
        return;
      }
      if (e.key === 'Escape') {
        if (selectedMsg) { setSelectedId(null); setSelectedMsg(null); setThreadMsgs([]); }
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, selectedMsg, messages, focusIdx]);

  const LABELS = [
    { id: 'INBOX', label: 'Inbox', icon: 'M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z' },
    { id: 'STARRED', label: 'Starred', icon: 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z' },
    { id: 'SENT', label: 'Sent', icon: 'M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5' },
    { id: 'DRAFT', label: 'Drafts', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
  ];

  if (!isConnected) {
    // Demo mode: render a small static preview instead of the connect screen
    // so the public Pages demo has populated UI without requiring a real
    // Google OAuth Client ID.
    if (isDemoMode()) return <EmailDemoView />;
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md space-y-4 px-6">
          <svg className="h-16 w-16 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
          <h2 className="text-lg font-semibold text-gray-900">Connect Gmail</h2>
          <p className="text-sm text-gray-500">Sign in with your Google account to access Gmail, Calendar, and Gemini AI.</p>

          {!hasClientId && (
            <div className="text-left space-y-2 bg-gray-50 rounded-lg p-4">
              <label className="block text-xs font-medium text-gray-700">Google OAuth Client ID</label>
              <input
                value={clientIdInput}
                onChange={e => setClientIdInput(e.target.value)}
                placeholder="123456789.apps.googleusercontent.com"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <button onClick={() => { if (clientIdInput.trim()) setClientId(clientIdInput.trim()); }}
                disabled={!clientIdInput.trim()}
                className="w-full bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40">
                Save Client ID
              </button>
              <p className="text-[10px] text-gray-400">Create one at console.cloud.google.com &gt; APIs &gt; Credentials &gt; OAuth 2.0 Client ID (Web application)</p>
            </div>
          )}

          {hasClientId && (
            <button onClick={connect} disabled={authLoading}
              className="inline-flex items-center gap-2 bg-white border border-gray-300 shadow-sm px-6 py-2.5 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {authLoading ? 'Connecting...' : 'Sign in with Google'}
            </button>
          )}

          {authError && <p className="text-sm text-red-600">{authError}</p>}
        </div>
      </div>
    );
  }

  // ── Message Detail Panel ──
  const renderDetail = () => {
    if (!selectedMsg) return null;
    const lastMsg = threadMsgs.length > 0 ? threadMsgs[threadMsgs.length - 1] : selectedMsg;

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-200 shrink-0">
          <button onClick={() => { setSelectedId(null); setSelectedMsg(null); setThreadMsgs([]); }} className="p-1 rounded hover:bg-gray-100" title="Back (Esc)">
            <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          </button>
          <h3 className="text-sm font-semibold text-gray-900 truncate flex-1">{getHeader(lastMsg, 'Subject')}</h3>
          <button onClick={() => archiveMessage(lastMsg.id)} title="Archive (e)"
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
            Done
          </button>
          <button onClick={() => {
            setReplyTo({
              to: parseFrom(getHeader(lastMsg, 'From')).email,
              subject: `Re: ${getHeader(lastMsg, 'Subject')}`,
              threadId: lastMsg.threadId,
              messageId: getHeader(lastMsg, 'Message-ID') || lastMsg.id,
            });
            setComposing(true);
          }} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50" title="Reply (r)">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
            Reply
          </button>
          <button onClick={() => {
            const allRecipients = [getHeader(lastMsg, 'From'), getHeader(lastMsg, 'To'), getHeader(lastMsg, 'Cc')]
              .join(',').split(',').map(s => s.trim()).filter(Boolean)
              .map(s => parseFrom(s).email)
              .filter((e, i, a) => a.indexOf(e) === i && e !== user?.email);
            setReplyTo({
              to: allRecipients.join(', '),
              subject: `Re: ${getHeader(lastMsg, 'Subject')}`,
              threadId: lastMsg.threadId,
              messageId: getHeader(lastMsg, 'Message-ID') || lastMsg.id,
            });
            setComposing(true);
          }} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50" title="Reply All">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /><path strokeLinecap="round" strokeLinejoin="round" d="M13 15L7 9m0 0l6-6" opacity="0.5" /></svg>
            All
          </button>
          <button onClick={() => {
            const fwd = `\n\n---------- Forwarded message ----------\nFrom: ${getHeader(lastMsg, 'From')}\nDate: ${formatDateTime(new Date(parseInt(lastMsg.internalDate)).toISOString())}\nSubject: ${getHeader(lastMsg, 'Subject')}\nTo: ${getHeader(lastMsg, 'To')}\n\n`;
            setForwardBody(fwd);
            setReplyTo({ to: '', subject: `Fwd: ${getHeader(lastMsg, 'Subject')}`, threadId: '', messageId: '' });
            setComposing(true);
          }} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50" title="Forward">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" /></svg>
            Forward
          </button>
          <button onClick={() => trashMessage(lastMsg.id)} title="Delete (#)"
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-red-50 hover:text-red-600 hover:border-red-300">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
          </button>
        </div>

        {loadingMsg ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading...</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {threadMsgs.map((tmsg, idx) => {
              const from = parseFrom(getHeader(tmsg, 'From'));
              const isLast = idx === threadMsgs.length - 1;
              const isCollapsed = collapsedThreadMsgs.has(tmsg.id);
              return (
                <div key={tmsg.id} className={`border-b border-gray-100 ${!isLast ? 'bg-gray-50/50' : ''}`}>
                  <div
                    className={`px-4 py-2 flex items-center gap-2 ${!isLast ? 'cursor-pointer hover:bg-gray-100/50' : ''}`}
                    onClick={() => {
                      if (isLast) return;
                      setCollapsedThreadMsgs(prev => {
                        const next = new Set(prev);
                        if (next.has(tmsg.id)) next.delete(tmsg.id); else next.add(tmsg.id);
                        return next;
                      });
                    }}
                  >
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0 ${avatarColor(from.name)}`}>
                      {from.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{from.name}</span>
                        <span className="text-xs text-gray-400">{formatDateTime(new Date(parseInt(tmsg.internalDate)).toISOString())}</span>
                      </div>
                      {isCollapsed ? (
                        <p className="text-xs text-gray-400 truncate">{tmsg.snippet}</p>
                      ) : (
                        <p className="text-xs text-gray-500 truncate">To: {getHeader(tmsg, 'To')}</p>
                      )}
                    </div>
                    {threadMsgs.length > 1 && (
                      <div className="flex items-center gap-1">
                        {!isLast && (
                          <svg className={`h-3 w-3 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                        )}
                        <span className="text-[10px] text-gray-400">{idx + 1}/{threadMsgs.length}</span>
                      </div>
                    )}
                  </div>
                  {!isCollapsed && (
                    <>
                      <div className="px-4 pb-3">
                        <EmailBody html={getMessageBody(tmsg)} accessToken={accessToken!} />
                      </div>
                      {(() => {
                        const msgAtts = getAttachments(tmsg);
                        if (msgAtts.length === 0) return null;
                        return (
                          <div className="px-4 pb-3">
                            <div className="flex flex-wrap gap-2">
                              {msgAtts.map((att, i) => (
                                <div key={i}>
                                  {isImageAttachment(att) ? (
                                    <InlineImagePreview msgId={tmsg.id} att={att} accessToken={accessToken!} onDownload={downloadAttachment} onLightbox={(src, fn) => setLightbox({ src, filename: fn })} />
                                  ) : (
                                    <div className="inline-flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden">
                                      <button onClick={() => openAttachment(tmsg.id, att.attachmentId, att.filename, att.mimeType)}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs hover:bg-gray-50 text-gray-700">
                                        <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" /></svg>
                                        <span className="truncate max-w-[140px]">{att.filename}</span>
                                      </button>
                                      {isSpreadsheet(att.filename) && (
                                        <button onClick={() => openSpreadsheet(tmsg.id, att.attachmentId, att.filename)}
                                          title="Open in spreadsheet viewer"
                                          className="px-2 py-1.5 text-xs text-green-700 hover:bg-green-50 border-l border-gray-200 font-medium">
                                          Open
                                        </button>
                                      )}
                                      <button onClick={() => downloadAttachment(tmsg.id, att.attachmentId, att.filename)}
                                        title="Download"
                                        className="px-1.5 py-1.5 text-gray-400 hover:bg-gray-50 border-l border-gray-200">
                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Message List Panel ──
  const renderList = () => (
    <div className="flex-1 flex flex-col overflow-hidden" ref={listRef}>
      <form onSubmit={handleSearch} className="px-3 py-2 border-b border-gray-200 flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search mail..."
            className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:border-blue-400 focus:ring-1 focus:ring-blue-400 bg-gray-50 focus:bg-white" />
          {activeSearch && (
            <button type="button" onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        <button type="button" onClick={() => fetchMessages(label, undefined, activeSearch || undefined, true)} title="Refresh"
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500">
          <svg className={`h-4 w-4 ${loadingMsgs ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" /></svg>
        </button>
        <button type="button" onClick={() => setSplitPane(p => !p)} title={splitPane ? 'Full view' : 'Split pane'}
          className={`p-1.5 rounded-md hover:bg-gray-100 ${splitPane ? 'text-blue-600 bg-blue-50' : 'text-gray-500'}`}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25h-15A2.25 2.25 0 002.25 6.75v10.5a2.25 2.25 0 002.25 2.25z" /></svg>
        </button>
      </form>

      {selectedIds.size > 0 && (
        <div className="px-3 py-1.5 border-b border-gray-200 bg-blue-50 flex items-center gap-2 shrink-0">
          <span className="text-xs font-medium text-blue-700">{selectedIds.size} selected</span>
          <div className="flex gap-1 ml-auto">
            <button onClick={bulkArchive} className="px-2 py-1 text-xs font-medium rounded bg-white border border-gray-300 text-gray-700 hover:bg-gray-50">Archive</button>
            <button onClick={bulkMarkRead} className="px-2 py-1 text-xs font-medium rounded bg-white border border-gray-300 text-gray-700 hover:bg-gray-50">Mark read</button>
            <button onClick={bulkMarkUnread} className="px-2 py-1 text-xs font-medium rounded bg-white border border-gray-300 text-gray-700 hover:bg-gray-50">Mark unread</button>
            <button onClick={bulkDelete} className="px-2 py-1 text-xs font-medium rounded bg-white border border-red-300 text-red-600 hover:bg-red-50">Delete</button>
            <button onClick={() => setSelectedIds(new Set())} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">Clear</button>
          </div>
        </div>
      )}

      {messages.length > 0 && selectedIds.size === 0 && (
        <div className="px-3 py-1 border-b border-gray-100 shrink-0">
          <label className="inline-flex items-center gap-2 text-xs text-gray-400 cursor-pointer hover:text-gray-600">
            <input type="checkbox" checked={selectedIds.size === messages.length} onChange={toggleSelectAll}
              className="h-3 w-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            Select all
          </label>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loadingMsgs && messages.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">Loading...</div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            {activeSearch ? 'No results' : 'No messages'}
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => {
              const cat = getCategoryLabel(msg.labelIds);
              return (
                <div key={msg.id} onClick={() => {
                  if (label === 'DRAFT') { openDraft(msg.id); } else { openMessage(msg.id, msg.threadId); }
                }}
                  className={`w-full text-left px-3 py-2 border-b border-gray-100 flex items-center gap-2 hover:bg-gray-50 transition-colors cursor-pointer group
                    ${msg.isUnread ? 'bg-blue-50/40' : ''} ${focusIdx === idx ? 'ring-1 ring-inset ring-blue-400' : ''} ${selectedIds.has(msg.id) ? 'bg-blue-50' : ''}`}>
                  <input type="checkbox" checked={selectedIds.has(msg.id)}
                    onChange={e => { e.stopPropagation(); toggleSelect(msg.id); }}
                    onClick={e => e.stopPropagation()}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0" />
                  <button onClick={e => { e.stopPropagation(); toggleStar(msg.id, msg.isStarred); }}
                    className={`shrink-0 ${msg.isStarred ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-400'}`}>
                    <svg className="h-4 w-4" fill={msg.isStarred ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
                  </button>
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0 ${avatarColor(msg.from)}`}>
                    {msg.from.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm truncate ${msg.isUnread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{msg.from}</span>
                      {msg.threadCount > 1 && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-gray-200 text-gray-600 font-medium">{msg.threadCount}</span>
                      )}
                      {cat && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cat.color}`}>{cat.text}</span>}
                      <div className="flex items-center gap-1 shrink-0 ml-auto">
                        {msg.attachmentCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-gray-400">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" /></svg>
                            {msg.attachmentCount > 1 && <span className="text-[10px]">{msg.attachmentCount}</span>}
                          </span>
                        )}
                        <button onClick={e => { e.stopPropagation(); archiveMessage(msg.id); }} title="Archive"
                          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-600 transition-all p-0.5">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                        </button>
                        <button onClick={e => { e.stopPropagation(); trashMessage(msg.id); }} title="Delete"
                          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all p-0.5">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </button>
                        <span className="text-xs text-gray-400 ml-1 w-10 text-right">{timeAgo(msg.date)}</span>
                      </div>
                    </div>
                    <p className={`text-sm truncate ${msg.isUnread ? 'font-medium text-gray-900' : 'text-gray-600'}`}>{msg.subject}</p>
                    <p className="text-xs text-gray-400 truncate">{msg.snippet}</p>
                  </div>
                </div>
              );
            })}
            {nextPageToken && (
              <div className="py-3 text-center">
                <button onClick={() => fetchMessages(label, nextPageToken, activeSearch || undefined)} disabled={loadingMsgs}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50">
                  {loadingMsgs ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <div className="w-48 shrink-0 border-r border-gray-200 flex flex-col">
        <div className="p-2">
          <button onClick={() => setComposing(true)}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
            Compose
          </button>
        </div>
        <nav className="flex-1 px-1 space-y-0.5">
          {LABELS.map(l => (
            <button key={l.id} onClick={() => { setLabel(l.id); setSelectedId(null); setSelectedMsg(null); setThreadMsgs([]); clearSearch(); }}
              className={`w-full flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${label === l.id && !activeSearch ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}>
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={l.icon} /></svg>
              <span className="flex-1 text-left">{l.label}</span>
              {(() => {
                const cached = l.id === label ? messages : msgCacheRef.current[l.id]?.items;
                const count = cached?.filter(m => m.isUnread).length || 0;
                return count > 0 ? (
                  <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{count}</span>
                ) : null;
              })()}
            </button>
          ))}
          {userLabels.length > 0 && (
            <LabelTree labels={userLabels} activeLabel={label} activeSearch={activeSearch}
              onSelect={(id) => { setLabel(id); setSelectedId(null); setSelectedMsg(null); setThreadMsgs([]); clearSearch(); }} />
          )}
        </nav>
        <div className="p-3 border-t border-gray-200">
          <button onClick={() => window.dispatchEvent(new Event('open-google-connect'))} className="flex items-center gap-2 w-full hover:bg-gray-50 rounded-md p-1 transition-colors" title="Google Services">
            {user?.picture ? (
              <img src={user.picture} alt="" className="h-6 w-6 rounded-full" />
            ) : (
              <div className="h-6 w-6 rounded-full bg-gray-200" />
            )}
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[11px] font-medium text-gray-900 truncate">{user?.name}</p>
              <p className="text-[10px] text-gray-500 truncate">{user?.email}</p>
            </div>
          </button>
        </div>
      </div>

      {splitPane ? (
        <div className="flex-1 flex">
          <div className="w-[340px] shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">
            {renderList()}
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedMsg ? renderDetail() : (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Select a message</div>
            )}
          </div>
        </div>
      ) : (
        selectedMsg ? renderDetail() : renderList()
      )}

      {composing && (
        <ComposeEmail
          accessToken={accessToken!}
          userEmail={user?.email || ''}
          replyTo={replyTo}
          forwardBody={forwardBody}
          onClose={() => { setComposing(false); setReplyTo(null); setForwardBody(null); }}
          onSent={() => { setComposing(false); setReplyTo(null); setForwardBody(null); fetchMessages(label, undefined, activeSearch || undefined, true); }}
        />
      )}

      {spreadsheetData && (
        <SpreadsheetViewer data={spreadsheetData} onClose={() => setSpreadsheetData(null)} />
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center" onClick={() => setLightbox(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.filename} className="max-w-full max-h-[85vh] object-contain rounded-lg" />
            <div className="absolute top-2 right-2 flex gap-1">
              <a href={lightbox.src} download={lightbox.filename} title="Download"
                className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              </a>
              <button onClick={() => setLightbox(null)} title="Close"
                className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-3 py-1 rounded-full">{lightbox.filename}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline Image Preview ──
function InlineImagePreview({ msgId, att, accessToken, onDownload, onLightbox }: {
  msgId: string; att: AttachmentInfo; accessToken: string; onDownload: (msgId: string, attachmentId: string, filename: string) => void;
  onLightbox?: (src: string, filename: string) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${GMAIL_API}/messages/${msgId}/attachments/${att.attachmentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.json())
      .then(data => {
        if (cancelled || !data.data) return;
        const b64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
        setSrc(`data:${att.mimeType};base64,${b64}`);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [msgId, att.attachmentId, att.mimeType, accessToken]);

  return (
    <div className="inline-flex flex-col border border-gray-200 rounded-lg bg-white overflow-hidden">
      {src ? (
        <button onClick={() => { if (expanded && onLightbox) onLightbox(src, att.filename); else setExpanded(!expanded); }} className="block hover:opacity-90 transition-opacity">
          <img src={src} alt={att.filename} className={expanded ? 'max-w-md max-h-96 object-contain' : 'w-24 h-24 object-cover'} />
        </button>
      ) : (
        <div className="w-24 h-24 flex items-center justify-center bg-gray-50 text-gray-400 text-xs">Loading...</div>
      )}
      <div className="flex items-center border-t border-gray-200">
        <span className="text-[10px] text-gray-500 truncate px-2 flex-1 max-w-[120px]">{att.filename}</span>
        <button onClick={() => onDownload(msgId, att.attachmentId, att.filename)} title="Download"
          className="px-1.5 py-1 text-gray-400 hover:bg-gray-50 border-l border-gray-200">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
        </button>
      </div>
    </div>
  );
}

// ── Rich Text Editor Toolbar ──
function RichTextToolbar() {
  const exec = (cmd: string, val?: string) => { document.execCommand(cmd, false, val); };

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-200 bg-gray-50">
      <button type="button" onMouseDown={e => { e.preventDefault(); exec('bold'); }} title="Bold"
        className="p-1.5 rounded hover:bg-gray-200 text-gray-600 text-xs font-bold">B</button>
      <button type="button" onMouseDown={e => { e.preventDefault(); exec('italic'); }} title="Italic"
        className="p-1.5 rounded hover:bg-gray-200 text-gray-600 text-xs italic">I</button>
      <button type="button" onMouseDown={e => { e.preventDefault(); exec('underline'); }} title="Underline"
        className="p-1.5 rounded hover:bg-gray-200 text-gray-600 text-xs underline">U</button>
      <div className="w-px h-4 bg-gray-300 mx-1" />
      <button type="button" onMouseDown={e => {
        e.preventDefault();
        const url = prompt('Enter URL:');
        if (url) exec('createLink', url);
      }} title="Link"
        className="p-1.5 rounded hover:bg-gray-200 text-gray-600">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
      </button>
      <button type="button" onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList'); }} title="Bullet list"
        className="p-1.5 rounded hover:bg-gray-200 text-gray-600">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
      </button>
    </div>
  );
}

// ── Contact Autocomplete ──
function ContactAutocomplete({ value, onChange, className }: {
  value: string; onChange: (val: string) => void; className: string;
}) {
  const [suggestions, setSuggestions] = useState<{ name: string; email: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInputChange = (val: string) => {
    onChange(val);
    const parts = val.split(',');
    const currentPart = parts[parts.length - 1].trim().toLowerCase();
    if (currentPart.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const recent = getRecentRecipients();
    const matches = recent.filter(r =>
      r.email.toLowerCase().includes(currentPart) ||
      r.name.toLowerCase().includes(currentPart)
    ).slice(0, 8);
    setSuggestions(matches);
    setShowSuggestions(matches.length > 0);
    setSelectedIdx(-1);
  };

  const selectSuggestion = (s: { name: string; email: string }) => {
    const parts = value.split(',');
    parts[parts.length - 1] = ` ${s.email}`;
    onChange(parts.join(',') + ', ');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(prev => Math.min(prev + 1, suggestions.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(prev => Math.max(prev - 1, 0)); }
    if (e.key === 'Enter' && selectedIdx >= 0) { e.preventDefault(); selectSuggestion(suggestions[selectedIdx]); }
    if (e.key === 'Escape') setShowSuggestions(false);
  };

  return (
    <div className="relative">
      <input ref={inputRef} value={value} onChange={e => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
        className={className} placeholder="recipient@example.com" autoFocus />
      {showSuggestions && (
        <div ref={suggestionsRef} className="absolute z-50 left-0 right-0 top-full mt-1 rounded-2xl max-h-48 overflow-y-auto" style={getGlassStyle()}>
          {suggestions.map((s, i) => (
            <button key={s.email} onClick={() => selectSuggestion(s)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${i === selectedIdx ? 'bg-blue-50' : ''}`}>
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0 ${avatarColor(s.name)}`}>
                {s.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900 truncate">{s.name}</p>
                <p className="text-xs text-gray-500 truncate">{s.email}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Compose Email ──
function ComposeEmail({ accessToken, userEmail, replyTo, forwardBody, onClose, onSent }: {
  accessToken: string; userEmail: string;
  replyTo: { to: string; subject: string; threadId: string; messageId: string } | null;
  forwardBody: string | null;
  onClose: () => void; onSent: () => void;
}) {
  const [to, setTo] = useState(replyTo?.to || '');
  const [subject, setSubject] = useState(replyTo?.subject || '');
  const [sending, setSending] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showSignatureEditor, setShowSignatureEditor] = useState(false);
  const [signatureText, setSignatureText] = useState(() => localStorage.getItem('email_signature') || '');

  const isForward = !!forwardBody;
  const isReply = !!replyTo && !isForward;

  useEffect(() => {
    if (editorRef.current && forwardBody) {
      editorRef.current.innerHTML = `<br><br><pre style="white-space:pre-wrap;font-family:inherit;color:#666;">${forwardBody.replace(/</g, '&lt;')}</pre>`;
    } else if (editorRef.current) {
      const sig = localStorage.getItem('email_signature');
      if (sig) {
        editorRef.current.innerHTML = `<br><br><div style="color:#888;border-top:1px solid #eee;padding-top:8px;margin-top:8px;">--<br>${sig.replace(/\n/g, '<br>')}</div>`;
      }
    }
  }, [forwardBody]);

  // Draft auto-save every 30s
  useEffect(() => {
    draftTimerRef.current = setInterval(async () => {
      if (!editorRef.current) return;
      const bodyHtml = editorRef.current.innerHTML;
      if (!bodyHtml.trim() && !to.trim() && !subject.trim()) return;

      try {
        const headers = [
          `From: ${userEmail}`,
          `To: ${to}`,
          `Subject: ${subject}`,
          'Content-Type: text/html; charset=utf-8',
        ];
        const rawMessage = [...headers, '', bodyHtml].join('\r\n');
        const encoded = btoa(unescape(encodeURIComponent(rawMessage))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const draftPayload: any = { message: { raw: encoded } };
        if (isReply && replyTo?.threadId) draftPayload.message.threadId = replyTo.threadId;

        if (draftId) {
          await fetch(`${GMAIL_API}/drafts/${draftId}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(draftPayload),
          });
        } else {
          const res = await fetch(`${GMAIL_API}/drafts`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(draftPayload),
          });
          if (res.ok) {
            const data = await res.json();
            setDraftId(data.id);
          }
        }
      } catch {}
    }, 30000);

    return () => { if (draftTimerRef.current) clearInterval(draftTimerRef.current); };
  }, [accessToken, to, subject, draftId, userEmail, isReply, replyTo]);

  const handleSend = async () => {
    if (!to.trim() || !subject.trim()) { toast.error('To and Subject are required.'); return; }
    if (!editorRef.current) return;
    setSending(true);

    const bodyHtml = editorRef.current.innerHTML;

    let cancelled = false;
    const undoToast = showUndoToast('Sending email...', () => {
      cancelled = true;
      setSending(false);
      toast.info('Send cancelled.');
    }, 5000);

    await new Promise(resolve => setTimeout(resolve, 5000));

    if (cancelled) return;
    undoToast.dismiss();

    try {
      const headers = [
        `From: ${userEmail}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/html; charset=utf-8',
      ];
      if (isReply && replyTo?.messageId) {
        headers.push(`In-Reply-To: ${replyTo.messageId}`);
        headers.push(`References: ${replyTo.messageId}`);
      }
      const rawMessage = [...headers, '', bodyHtml].join('\r\n');
      const encoded = btoa(unescape(encodeURIComponent(rawMessage))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const payload: any = { raw: encoded };
      if (isReply && replyTo?.threadId) payload.threadId = replyTo.threadId;

      const res = await fetch(`${GMAIL_API}/messages/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to send');

      // Track recipients for autocomplete
      to.split(',').map(s => s.trim()).filter(Boolean).forEach(email => {
        addRecentRecipient(email);
      });

      // Delete draft if we saved one
      if (draftId) {
        fetch(`${GMAIL_API}/drafts/${draftId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => {});
      }

      toast.success('Email sent.');
      onSent();
    } catch (err: any) {
      toast.error(err.message || 'Failed to send email.');
    }
    setSending(false);
  };

  const saveSignature = () => {
    localStorage.setItem('email_signature', signatureText);
    setShowSignatureEditor(false);
    toast.success('Signature saved.');
  };

  const inp = 'block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm';

  return (
    <Modal open onClose={onClose} title={<span className="text-sm font-semibold">{isForward ? 'Forward' : isReply ? 'Reply' : 'New Email'}</span>} size="md">
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <ContactAutocomplete value={to} onChange={setTo} className={inp} />
        </div>
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Subject</label><input value={subject} onChange={e => setSubject(e.target.value)} className={inp} /></div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Message</label>
          <div className="border border-gray-300 rounded-md overflow-hidden shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
            <RichTextToolbar />
            <div ref={editorRef} contentEditable suppressContentEditableWarning
              className="px-3 py-2 min-h-[200px] max-h-[400px] overflow-y-auto text-sm focus:outline-none"
              style={{ whiteSpace: 'pre-wrap' }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {signatureText ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              Signature attached
              <button onClick={() => setShowSignatureEditor(true)} className="text-blue-600 hover:text-blue-800">Edit</button>
            </div>
          ) : (
            <button onClick={() => setShowSignatureEditor(true)} className="text-xs text-blue-600 hover:text-blue-800">
              Add signature
            </button>
          )}
          {draftId && <span className="text-xs text-gray-400 ml-auto">Draft saved</span>}
        </div>
      </div>
      <ModalActions>
        <button onClick={handleSend} disabled={sending}
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
          {sending ? 'Sending...' : 'Send'}
        </button>
      </ModalActions>

      {showSignatureEditor && (
        <Modal open onClose={() => setShowSignatureEditor(false)} title="Edit Signature" size="sm">
          <div className="space-y-3">
            <textarea value={signatureText} onChange={e => setSignatureText(e.target.value)}
              rows={6} placeholder="Your email signature..."
              className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
            {signatureText && (
              <div className="text-xs text-gray-500">
                <p className="font-medium mb-1">Preview:</p>
                <div className="border-t border-gray-200 pt-2 whitespace-pre-wrap">{signatureText}</div>
              </div>
            )}
          </div>
          <ModalActions>
            <button onClick={saveSignature}
              className="bg-blue-600 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-blue-700">
              Save
            </button>
          </ModalActions>
        </Modal>
      )}
    </Modal>
  );
}

// ── Email Body with CID image resolution ──
function EmailBody({ html, accessToken }: { html: string; accessToken: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.5; color: #333; word-wrap: break-word; }
      img { max-width: 100%; height: auto; }
      a { color: #2563eb; }
      blockquote { border-left: 3px solid #ddd; margin: 8px 0; padding-left: 12px; color: #666; }
      pre { white-space: pre-wrap; font-family: inherit; }
    </style></head><body>${html}</body></html>`);
    doc.close();

    const resize = () => {
      if (iframe.contentDocument?.body) {
        iframe.style.height = iframe.contentDocument.body.scrollHeight + 'px';
      }
    };
    setTimeout(resize, 100);
    setTimeout(resize, 500);

    const imgs = doc.querySelectorAll('img[data-cid-attachment]');
    imgs.forEach(async (img) => {
      const attachmentId = img.getAttribute('data-cid-attachment');
      const mimeType = img.getAttribute('data-cid-mime') || 'image/png';
      const msgId = img.getAttribute('data-msg-id');
      if (!attachmentId || !msgId) return;
      try {
        const res = await fetch(`${GMAIL_API}/messages/${msgId}/attachments/${attachmentId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.data) {
          const b64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
          (img as HTMLImageElement).src = `data:${mimeType};base64,${b64}`;
          setTimeout(resize, 100);
        }
      } catch {}
    });

    doc.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('a');
      if (a?.href) { e.preventDefault(); window.open(a.href, '_blank'); }
    });
  }, [html, accessToken]);

  return (
    <iframe
      ref={iframeRef}
      className="w-full border-0"
      style={{ minHeight: 100 }}
      sandbox="allow-same-origin"
      title="Email content"
    />
  );
}

// ── Nested Label Tree ──
interface LabelNode {
  id: string | null;
  name: string;
  children: LabelNode[];
}

function buildLabelTree(labels: { id: string; name: string }[]): LabelNode[] {
  const root: LabelNode[] = [];
  const map = new Map<string, LabelNode>();

  const sorted = [...labels].sort((a, b) => a.name.localeCompare(b.name));

  for (const l of sorted) {
    const parts = l.name.split('/');
    const leafName = parts[parts.length - 1];
    const node: LabelNode = { id: l.id, name: leafName, children: [] };
    map.set(l.name, node);

    if (parts.length === 1) {
      root.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      const parent = map.get(parentPath);
      if (parent) {
        parent.children.push(node);
      } else {
        root.push(node);
      }
    }
  }
  return root;
}

function LabelTree({ labels, activeLabel, activeSearch, onSelect }: {
  labels: { id: string; name: string; type: string }[];
  activeLabel: string;
  activeSearch: string;
  onSelect: (id: string) => void;
}) {
  const tree = useMemo(() => buildLabelTree(labels), [labels]);

  const LABEL_STATE_KEY = 'email_label_expanded';
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LABEL_STATE_KEY) || '[]');
      return new Set(saved);
    } catch { return new Set(); }
  });

  const toggle = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      localStorage.setItem(LABEL_STATE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const renderNodes = (nodes: LabelNode[], depth: number): React.ReactNode => {
    return nodes.map(node => {
      const hasChildren = node.children.length > 0;
      const isOpen = expanded.has(node.name);
      const isActive = node.id === activeLabel && !activeSearch;

      return (
        <div key={node.id || node.name}>
          <button
            onClick={() => { if (node.id) onSelect(node.id); if (hasChildren) toggle(node.name); }}
            className={`w-full flex items-center gap-1.5 rounded-md py-1 text-sm transition-colors ${isActive ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-700 hover:bg-gray-100'}`}
            style={{ paddingLeft: 12 + depth * 16 }}
          >
            {hasChildren ? (
              <svg className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${isOpen ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            ) : (
              <span className="w-3 shrink-0" />
            )}
            <svg className="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>
            <span className="flex-1 text-left truncate">{node.name}</span>
          </button>
          {hasChildren && isOpen && renderNodes(node.children, depth + 1)}
        </div>
      );
    });
  };

  return (
    <>
      <div className="border-t border-gray-200 mt-2 pt-2 mb-1">
        <span className="px-3 text-[10px] font-medium text-gray-400 uppercase tracking-wider">Labels</span>
      </div>
      {renderNodes(tree, 0)}
    </>
  );
}

// ── Spreadsheet Viewer (SheetJS HTML in iframe for clean selection) ──
function SpreadsheetViewer({ data, onClose }: { data: { name: string; sheetNames: string[]; sheets: Record<string, string[][]> }; onClose: () => void }) {
  const [activeSheet, setActiveSheet] = useState(data.sheetNames[0] || '');
  const rows = data.sheets[activeSheet] || [];

  // Build columns from first row (header) or generate A, B, C...
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const gridColumns = Array.from({ length: colCount }, (_, i) => ({
    key: `col_${i}`,
    title: rows[0]?.[i] || String.fromCharCode(65 + (i % 26)),
    width: 120,
    readOnly: true,
  }));

  // Use all rows as data (read-only, selectable for copy)
  const gridData = rows.length > 1 ? rows.slice(1) : rows;

  return (
    <Modal open onClose={onClose} title={data.name} size="2xl" bodyScroll={false}>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 min-h-0">
          <EditableGrid
            columns={gridColumns}
            data={gridData}
            onChange={() => {}}
            fixedRows
            maxHeight="70vh"
          />
        </div>
        <div className="flex items-center border-t border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-center gap-0.5 px-1 py-1 overflow-x-auto flex-1 min-w-0">
            {data.sheetNames.map(name => (
              <button key={name} onClick={() => setActiveSheet(name)}
                className={`px-3 py-1 text-xs font-medium rounded-t whitespace-nowrap transition-colors ${
                  activeSheet === name
                    ? 'bg-white text-blue-700 border border-b-0 border-gray-300 -mb-px relative z-10'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}>
                {name}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400 px-3 shrink-0">Select cells and Ctrl+C to copy</span>
        </div>
      </div>
    </Modal>
  );
}

// ── Demo view ──────────────────────────────────────────────────────────
// Used when window.__REACT_OS_SHELL_DEMO_MODE__ is set. Renders a small
// static thread list + reading pane against the bundled fixtures so the
// public demo has populated UI without a real Google OAuth Client ID.
function EmailDemoView() {
  const [emails] = useState(() => getDemoEmails());
  const [selectedId, setSelectedId] = useState<string | null>(emails[0]?.id ?? null);
  const selected = emails.find(e => e.id === selectedId);
  const formatTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-amber-200 bg-amber-50 text-[11px] text-amber-800">
        Demo mode — these emails are sample data. Set up a Google OAuth Client ID in Customization to see your real Gmail.
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-80 shrink-0 border-r border-gray-200 overflow-y-auto">
          {emails.map(e => (
            <button
              key={e.id}
              onClick={() => setSelectedId(e.id)}
              className={`w-full text-left px-3 py-2 border-b border-gray-100 ${selectedId === e.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className={`truncate text-sm ${e.unread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{e.from}</span>
                <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">{formatTime(e.receivedAt)}</span>
              </div>
              <div className={`truncate text-sm ${e.unread ? 'font-medium text-gray-800' : 'text-gray-600'}`}>{e.subject}</div>
              <div className="truncate text-xs text-gray-500">{e.snippet}</div>
            </button>
          ))}
        </div>
        <div className="flex-1 p-6 overflow-y-auto bg-white">
          {selected ? (
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">{selected.subject}</h2>
              <div className="text-xs text-gray-500 mb-4">From {selected.from} · {formatTime(selected.receivedAt)}</div>
              <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed">{selected.body}</pre>
            </>
          ) : (
            <div className="text-sm text-gray-400 text-center pt-20">Select a message</div>
          )}
        </div>
      </div>
    </div>
  );
}
