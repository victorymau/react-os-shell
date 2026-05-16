import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useMailAuth from '../hooks/useMailAuth';
import { setEmailUnreadCount } from '../hooks/useEmailUnread';
import { getMailClient } from '../api/mailClient';
import toast from '../shell/toast';
import Modal, { ModalActions } from '../shell/Modal';
import { formatDate, formatDateTime } from '../utils/date';

interface Folder {
  path: string;
  name: string;
  delimiter: string;
  specialUse: 'inbox' | 'sent' | 'drafts' | 'trash' | 'junk' | 'archive' | 'flagged' | null;
  subscribed: boolean;
  unreadCount: number;
  totalCount: number;
}

interface Address { name: string; address: string }

interface MessageListItem {
  uid: number;
  threadId: string;
  from: Address;
  to: Address[];
  subject: string;
  snippet: string;
  date: string;
  flags: string[];
  hasAttachments: boolean;
  inReplyTo: string | null;
  references: string[];
}

interface AttachmentInfo {
  partId: string;
  filename: string;
  contentType: string;
  size: number;
  contentId: string | null;
}

interface MessageDetail extends Omit<MessageListItem, 'snippet' | 'hasAttachments'> {
  cc: Address[];
  text: string | null;
  html: string | null;
  attachments: AttachmentInfo[];
}

const SMART_VIEWS: Array<{ key: string; label: string; icon: string }> = [
  { key: '__inbox__', label: 'Inbox', icon: '📥' },
  { key: '__starred__', label: 'Starred', icon: '⭐' },
  { key: '__unread__', label: 'Unread', icon: '●' },
  { key: '__drafts__', label: 'Drafts', icon: '📝' },
  { key: '__sent__', label: 'Sent', icon: '📤' },
  { key: '__trash__', label: 'Trash', icon: '🗑' },
  { key: '__junk__', label: 'Spam', icon: '⚠' },
];

function resolveSmartView(key: string, folders: Folder[]): string {
  if (key === '__inbox__') return folders.find(f => f.specialUse === 'inbox')?.path || 'INBOX';
  if (key === '__sent__') return folders.find(f => f.specialUse === 'sent')?.path || 'Sent';
  if (key === '__drafts__') return folders.find(f => f.specialUse === 'drafts')?.path || 'Drafts';
  if (key === '__trash__') return folders.find(f => f.specialUse === 'trash')?.path || 'Trash';
  if (key === '__junk__') return folders.find(f => f.specialUse === 'junk')?.path || 'Junk';
  return key; // __starred__, __unread__ → handled server-side
}

export default function Email() {
  const { isConnected, serverReachable } = useMailAuth();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('__inbox__');
  const [messages, setMessages] = useState<MessageListItem[]>([]);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDraft, setComposeDraft] = useState<DraftState | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const selectedFolderPath = useMemo(() => resolveSmartView(selectedKey, folders), [selectedKey, folders]);

  const refreshFolders = useCallback(async () => {
    if (!isConnected) return;
    setLoadingFolders(true);
    setServerError(null);
    try {
      const res = await getMailClient().get<{ folders: Folder[] }>('/api/mail/folders');
      setFolders(res.data.folders);
    } catch (err) {
      setServerError(extractError(err));
    } finally {
      setLoadingFolders(false);
    }
  }, [isConnected]);

  const refreshList = useCallback(async () => {
    if (!isConnected) return;
    setLoadingList(true);
    setServerError(null);
    try {
      const res = await getMailClient().get<{ messages: MessageListItem[] }>('/api/mail/messages', {
        params: { folder: selectedFolderPath, page: 0, pageSize: 50 },
      });
      setMessages(res.data.messages);
    } catch (err) {
      setServerError(extractError(err));
    } finally {
      setLoadingList(false);
    }
  }, [isConnected, selectedFolderPath]);

  useEffect(() => {
    refreshFolders();
  }, [refreshFolders]);

  useEffect(() => {
    refreshList();
    setDetail(null);
    setSelectedUid(null);
  }, [refreshList]);

  // Poll unread counts every 30s and push to the badge.
  const unreadPollRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isConnected) return;
    async function tick() {
      try {
        const res = await getMailClient().get<{ counts: Record<string, number> }>('/api/mail/unread-counts');
        const inboxFolder = folders.find(f => f.specialUse === 'inbox')?.path || 'INBOX';
        setEmailUnreadCount(res.data.counts[inboxFolder] || 0);
        setFolders(prev =>
          prev.map(f => ({ ...f, unreadCount: res.data.counts[f.path] ?? f.unreadCount }))
        );
      } catch {
        /* ignore polling errors */
      }
    }
    tick();
    unreadPollRef.current = window.setInterval(tick, 30_000) as unknown as number;
    return () => {
      if (unreadPollRef.current) window.clearInterval(unreadPollRef.current);
    };
  }, [isConnected, folders]);

  const openMessage = useCallback(async (item: MessageListItem) => {
    setSelectedUid(item.uid);
    setLoadingDetail(true);
    try {
      const res = await getMailClient().get<MessageDetail>(
        `/api/mail/messages/${encodeURIComponent(selectedFolderPath)}/${item.uid}`
      );
      setDetail(res.data);
      if (!item.flags.includes('\\Seen')) {
        await getMailClient().post(
          `/api/mail/messages/${encodeURIComponent(selectedFolderPath)}/${item.uid}/flags`,
          { add: ['\\Seen'] }
        );
        setMessages(prev =>
          prev.map(m => (m.uid === item.uid ? { ...m, flags: [...m.flags, '\\Seen'] } : m))
        );
      }
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoadingDetail(false);
    }
  }, [selectedFolderPath]);

  const toggleStar = useCallback(async (item: MessageListItem) => {
    const isFlagged = item.flags.includes('\\Flagged');
    try {
      await getMailClient().post(
        `/api/mail/messages/${encodeURIComponent(selectedFolderPath)}/${item.uid}/flags`,
        isFlagged ? { remove: ['\\Flagged'] } : { add: ['\\Flagged'] }
      );
      setMessages(prev =>
        prev.map(m =>
          m.uid === item.uid
            ? {
                ...m,
                flags: isFlagged ? m.flags.filter(f => f !== '\\Flagged') : [...m.flags, '\\Flagged'],
              }
            : m
        )
      );
    } catch (err) {
      toast.error(extractError(err));
    }
  }, [selectedFolderPath]);

  const trashMessage = useCallback(async (uid: number) => {
    try {
      await getMailClient().delete(`/api/mail/messages/${encodeURIComponent(selectedFolderPath)}/${uid}`);
      setMessages(prev => prev.filter(m => m.uid !== uid));
      if (selectedUid === uid) {
        setDetail(null);
        setSelectedUid(null);
      }
    } catch (err) {
      toast.error(extractError(err));
    }
  }, [selectedFolderPath, selectedUid]);

  function openCompose(initial?: DraftState) {
    setComposeDraft(initial ?? { to: '', cc: '', subject: '', body: '' });
    setComposeOpen(true);
  }

  if (serverReachable === false) {
    return (
      <EmptyState
        title="Mail server unreachable"
        body="The bridge server is not responding. Start it with `npm run server:dev`, then retry."
        action={<button onClick={() => window.location.reload()} className="px-4 py-2 bg-gray-900 text-white rounded text-sm">Retry</button>}
      />
    );
  }

  if (!isConnected) {
    return (
      <EmptyState
        title="Connect your mail account"
        body="Open the Mail & Calendar button in the taskbar to connect via IMAP/SMTP/CalDAV."
      />
    );
  }

  return (
    <div className="flex h-full text-sm">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-gray-200 overflow-y-auto bg-gray-50/60">
        <div className="p-3">
          <button
            onClick={() => openCompose()}
            className="w-full bg-gray-900 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-800"
          >
            Compose
          </button>
        </div>
        <div className="px-2">
          {SMART_VIEWS.map(view => {
            const folder = view.key === '__inbox__'
              ? folders.find(f => f.specialUse === 'inbox')
              : view.key === '__sent__'
              ? folders.find(f => f.specialUse === 'sent')
              : view.key === '__drafts__'
              ? folders.find(f => f.specialUse === 'drafts')
              : view.key === '__trash__'
              ? folders.find(f => f.specialUse === 'trash')
              : view.key === '__junk__'
              ? folders.find(f => f.specialUse === 'junk')
              : null;
            const unread = folder?.unreadCount ?? 0;
            const active = selectedKey === view.key;
            return (
              <button
                key={view.key}
                onClick={() => setSelectedKey(view.key)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm ${active ? 'bg-gray-200 font-medium' : 'hover:bg-gray-100'}`}
              >
                <span className="w-5 text-center text-base leading-none">{view.icon}</span>
                <span className="flex-1 truncate">{view.label}</span>
                {unread > 0 && <span className="text-[10px] bg-blue-500 text-white rounded-full px-1.5">{unread}</span>}
              </button>
            );
          })}
        </div>
        <div className="px-3 mt-4 mb-1 text-[10px] uppercase tracking-wider text-gray-500">Folders</div>
        <div className="px-2 pb-3">
          {folders
            .filter(f => !f.specialUse || f.specialUse === 'archive' || f.specialUse === 'flagged')
            .filter(f => f.path.toUpperCase() !== 'INBOX')
            .map(f => {
              const active = selectedKey === f.path;
              return (
                <button
                  key={f.path}
                  onClick={() => setSelectedKey(f.path)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm ${active ? 'bg-gray-200 font-medium' : 'hover:bg-gray-100'}`}
                  title={f.path}
                >
                  <span className="w-5 text-center text-base leading-none">📁</span>
                  <span className="flex-1 truncate">{f.name}</span>
                  {f.unreadCount > 0 && <span className="text-[10px] bg-gray-300 text-gray-800 rounded-full px-1.5">{f.unreadCount}</span>}
                </button>
              );
            })}
        </div>
      </aside>

      {/* Message list */}
      <section className="w-80 shrink-0 border-r border-gray-200 flex flex-col">
        <header className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {SMART_VIEWS.find(v => v.key === selectedKey)?.label || selectedKey}
          </h2>
          <button
            onClick={() => { refreshList(); refreshFolders(); }}
            className="text-xs text-gray-600 hover:text-gray-900"
            disabled={loadingList || loadingFolders}
          >
            {loadingList || loadingFolders ? '…' : 'Refresh'}
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          {loadingList && messages.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-500">Loading…</div>
          ) : messages.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-500">No messages</div>
          ) : (
            messages.map(msg => (
              <MessageRow
                key={msg.uid}
                msg={msg}
                active={selectedUid === msg.uid}
                onOpen={() => openMessage(msg)}
                onStar={() => toggleStar(msg)}
              />
            ))
          )}
        </div>
      </section>

      {/* Detail */}
      <section className="flex-1 overflow-y-auto">
        {detail ? (
          <MessageDetailView
            detail={detail}
            folderPath={selectedFolderPath}
            loading={loadingDetail}
            onReply={() => openCompose({
              to: detail.from.address,
              cc: '',
              subject: detail.subject.startsWith('Re:') ? detail.subject : `Re: ${detail.subject}`,
              body: '',
              inReplyTo: detail.threadId,
              references: detail.references,
            })}
            onTrash={() => trashMessage(detail.uid)}
          />
        ) : (
          <div className="h-full grid place-items-center text-xs text-gray-400">
            Select a message
          </div>
        )}
      </section>

      {composeOpen && composeDraft && (
        <ComposeModal
          open={composeOpen}
          initial={composeDraft}
          onClose={() => setComposeOpen(false)}
          onSent={() => {
            setComposeOpen(false);
            toast.success('Message sent');
            refreshList();
          }}
        />
      )}

      {serverError && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-800 px-3 py-1 text-xs rounded">
          {serverError}
        </div>
      )}
    </div>
  );
}

function MessageRow({ msg, active, onOpen, onStar }: {
  msg: MessageListItem;
  active: boolean;
  onOpen: () => void;
  onStar: () => void;
}) {
  const unread = !msg.flags.includes('\\Seen');
  const starred = msg.flags.includes('\\Flagged');
  return (
    <div
      onClick={onOpen}
      className={`px-3 py-2 border-b border-gray-100 cursor-pointer ${active ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <button
          onClick={(e) => { e.stopPropagation(); onStar(); }}
          className={`text-xs ${starred ? 'text-yellow-500' : 'text-gray-300 hover:text-gray-500'}`}
          title={starred ? 'Unstar' : 'Star'}
        >
          ★
        </button>
        <p className={`text-xs flex-1 truncate ${unread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
          {msg.from.name || msg.from.address}
        </p>
        <span className="text-[10px] text-gray-400 shrink-0">{formatDate(msg.date)}</span>
      </div>
      <p className={`text-xs truncate ${unread ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
        {msg.subject || '(no subject)'}
      </p>
      {msg.hasAttachments && <span className="text-[10px] text-gray-400">📎 attachment</span>}
    </div>
  );
}

function MessageDetailView({
  detail,
  folderPath,
  loading,
  onReply,
  onTrash,
}: {
  detail: MessageDetail;
  folderPath: string;
  loading: boolean;
  onReply: () => void;
  onTrash: () => void;
}) {
  const baseUrl = `/api/mail/messages/${encodeURIComponent(folderPath)}/${detail.uid}/attachments`;
  return (
    <div>
      <header className="px-6 py-4 border-b border-gray-200">
        <h1 className="text-lg font-semibold mb-2">{detail.subject || '(no subject)'}</h1>
        <div className="flex items-center justify-between text-xs text-gray-600">
          <div>
            <div><strong>{detail.from.name || detail.from.address}</strong> &lt;{detail.from.address}&gt;</div>
            <div>to {detail.to.map(t => t.address).join(', ')}</div>
            {detail.cc.length > 0 && <div>cc {detail.cc.map(t => t.address).join(', ')}</div>}
            <div className="text-gray-400 mt-1">{formatDateTime(detail.date)}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={onReply} className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">Reply</button>
            <button onClick={onTrash} className="px-3 py-1 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50">Trash</button>
          </div>
        </div>
      </header>
      <article className="px-6 py-4">
        {loading ? (
          <div className="text-xs text-gray-500">Loading…</div>
        ) : detail.html ? (
          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: detail.html }} />
        ) : (
          <pre className="whitespace-pre-wrap text-sm font-sans">{detail.text || '(empty)'}</pre>
        )}
      </article>
      {detail.attachments.length > 0 && (
        <section className="px-6 pb-6">
          <h3 className="text-xs font-semibold text-gray-700 mb-2">Attachments</h3>
          <div className="grid grid-cols-2 gap-2">
            {detail.attachments.map(att => (
              <a
                key={att.partId}
                href={`${getMailClient().defaults.baseURL}${baseUrl}/${encodeURIComponent(att.partId)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 border border-gray-200 rounded px-3 py-2 text-xs hover:bg-gray-50"
              >
                <span>📎</span>
                <span className="flex-1 truncate">{att.filename}</span>
                <span className="text-gray-400">{(att.size / 1024).toFixed(1)}KB</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

interface DraftState {
  to: string;
  cc: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string[];
}

function ComposeModal({
  open,
  initial,
  onClose,
  onSent,
}: {
  open: boolean;
  initial: DraftState;
  onClose: () => void;
  onSent: () => void;
}) {
  const [draft, setDraft] = useState<DraftState>(initial);
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    try {
      const toList = draft.to.split(',').map(s => s.trim()).filter(Boolean);
      const ccList = draft.cc.split(',').map(s => s.trim()).filter(Boolean);
      if (toList.length === 0) {
        toast.error('At least one recipient required');
        return;
      }
      await getMailClient().post('/api/mail/send', {
        to: toList,
        cc: ccList.length ? ccList : undefined,
        subject: draft.subject,
        text: draft.body,
        inReplyTo: draft.inReplyTo,
        references: draft.references,
        saveToSent: true,
      });
      onSent();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New message" size="lg">
      <div className="space-y-3">
        <input
          type="text"
          placeholder="To"
          value={draft.to}
          onChange={e => setDraft({ ...draft, to: e.target.value })}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />
        <input
          type="text"
          placeholder="Cc (optional)"
          value={draft.cc}
          onChange={e => setDraft({ ...draft, cc: e.target.value })}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />
        <input
          type="text"
          placeholder="Subject"
          value={draft.subject}
          onChange={e => setDraft({ ...draft, subject: e.target.value })}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />
        <textarea
          rows={12}
          placeholder="Write your message…"
          value={draft.body}
          onChange={e => setDraft({ ...draft, body: e.target.value })}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
        />
      </div>
      <ModalActions>
        <button
          onClick={send}
          disabled={sending}
          className="bg-gray-900 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </ModalActions>
    </Modal>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="h-full grid place-items-center p-8 text-center">
      <div className="max-w-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">{title}</h2>
        <p className="text-sm text-gray-600">{body}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

function extractError(err: unknown): string {
  const response = (err as { response?: { data?: { error?: string } } }).response;
  if (response?.data?.error) return response.data.error;
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}
