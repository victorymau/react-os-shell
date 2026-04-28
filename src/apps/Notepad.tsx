import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNumberingConfigs } from '../api/auth';
import apiClient from '../api/client';
import toast from '../shell/toast';
import { useWindowManager } from '../shell/WindowManager';
import { useShellPrefs } from '../shell/ShellPrefs';

interface Note {
  id: string;
  title: string;
  content: string;
  color: string;
  sticky: boolean; // pinned to desktop
  updated_at: string;
}

const COLORS = [
  { key: 'yellow', bg: 'bg-yellow-100', border: 'border-yellow-300', text: 'text-yellow-900', dot: 'bg-yellow-400' },
  { key: 'blue', bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-900', dot: 'bg-blue-400' },
  { key: 'green', bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-900', dot: 'bg-green-400' },
  { key: 'pink', bg: 'bg-pink-100', border: 'border-pink-300', text: 'text-pink-900', dot: 'bg-pink-400' },
  { key: 'purple', bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-900', dot: 'bg-purple-400' },
  { key: 'orange', bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-900', dot: 'bg-orange-400' },
  { key: 'white', bg: 'bg-white', border: 'border-gray-300', text: 'text-gray-900', dot: 'bg-gray-300' },
];

function getColor(key: string) {
  return COLORS.find(c => c.key === key) || COLORS[0];
}

function newNote(): Note {
  return {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: '',
    content: '',
    color: 'yellow',
    sticky: false,
    updated_at: new Date().toISOString(),
  };
}

// ── Entity reference mapping ──
// Maps entity_type from NumberingConfig to modal registry entityType and search endpoint
const ENTITY_TYPE_MAP: Record<string, { entityType: string; endpoint: string }> = {
  sales_order: { entityType: 'order', endpoint: '/orders/sales-orders/' },
  purchase_order: { entityType: 'purchase_order', endpoint: '/purchase-orders/' },
  invoice: { entityType: 'invoice', endpoint: '/invoicing/invoices/' },
  vendor_invoice: { entityType: 'vendor_invoice', endpoint: '/invoicing/vendor-invoices/' },
  shipment: { entityType: 'shipment', endpoint: '/shipments/delivery-notes/' },
  receipt: { entityType: 'payment', endpoint: '/invoicing/payments/' },
  vendor_payment: { entityType: 'vendor_payment', endpoint: '/invoicing/vendor-payments/' },
  vendor_price_sheet: { entityType: 'vendor_price_sheet', endpoint: '/pricing/manufacturer-price-sheets/' },
  client_price_sheet: { entityType: 'price_sheet', endpoint: '/pricing/price-sheets/' },
  qc_report: { entityType: 'qc_report', endpoint: '/qc-reports/' },
  warranty_claim: { entityType: 'warranty_claim', endpoint: '/warranty-claims/claims/' },
  vendor_shipment: { entityType: 'vendor_shipment', endpoint: '/shipments/goods-receipts/' },
};

// Match checkboxes: [] or [x] or [X]
const CHECKBOX_REGEX = /\[([ xX]?)\]/g;

export default function Notepad() {
  const { openEntity } = useWindowManager();
  const { prefs, save } = useShellPrefs();

  // Fetch numbering configs to build dynamic prefix map (optional — only used
  // for entity-reference autolinking; safe to fail when no apiClient is wired).
  const { data: numberingConfigs } = useQuery({
    queryKey: ['numbering-configs'],
    queryFn: () => getNumberingConfigs(),
    retry: false,
  });

  // Build prefix → { entityType, endpoint } map from DB configs
  const prefixMap = useRef<Record<string, { entityType: string; endpoint: string; prefix: string }>>({});
  useEffect(() => {
    if (!numberingConfigs) return;
    const map: Record<string, { entityType: string; endpoint: string; prefix: string }> = {};
    for (const cfg of numberingConfigs) {
      const mapping = ENTITY_TYPE_MAP[cfg.entity_type];
      if (!mapping) continue;
      // prefix from DB is like "SO#" — strip the # to get "SO"
      const rawPrefix = (cfg.prefix || '').replace('#', '').toUpperCase();
      if (rawPrefix) {
        map[rawPrefix] = { ...mapping, prefix: cfg.prefix };
      }
      // Also register alt_prefix if set
      if (cfg.alt_prefix) {
        const altRaw = cfg.alt_prefix.replace('#', '').toUpperCase();
        if (altRaw) map[altRaw] = { ...mapping, prefix: cfg.alt_prefix };
      }
    }
    prefixMap.current = map;
  }, [numberingConfigs]);

  const notes: Note[] = prefs.notepad_notes || [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editColor, setEditColor] = useState('yellow');
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const selected = notes.find(n => n.id === selectedId);

  // Select first note on load
  useEffect(() => {
    if (!selectedId && notes.length > 0) {
      const n = notes[0];
      setSelectedId(n.id);
      setEditTitle(n.title);
      setEditContent(n.content);
      setEditColor(n.color);
    }
  }, [notes.length]);

  const saveNotes = useCallback((updated: Note[]) => {
    save({ notepad_notes: updated });
  }, [save]);

  const autoSave = useCallback(() => {
    if (!selectedId || !dirty) return;
    const updated = notes.map(n =>
      n.id === selectedId ? { ...n, title: editTitle, content: editContent, color: editColor, updated_at: new Date().toISOString() } : n
    );
    saveNotes(updated);
    setDirty(false);
  }, [selectedId, dirty, editTitle, editContent, editColor, notes, saveNotes]);

  // Debounced auto-save
  useEffect(() => {
    if (!dirty) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(autoSave, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [dirty, autoSave]);

  // Save on unmount
  useEffect(() => () => { if (dirty) autoSave(); }, []);

  const selectNote = (n: Note) => {
    if (dirty) autoSave();
    setSelectedId(n.id);
    setEditTitle(n.title);
    setEditContent(n.content);
    setEditColor(n.color);
    setDirty(false);
    setEditing(false);
  };

  const createNote = () => {
    if (dirty) autoSave();
    const n = newNote();
    const updated = [n, ...notes];
    saveNotes(updated);
    setSelectedId(n.id);
    setEditTitle('');
    setEditContent('');
    setEditColor('yellow');
    setDirty(false);
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const deleteNote = (id: string) => {
    const updated = notes.filter(n => n.id !== id);
    saveNotes(updated);
    if (selectedId === id) {
      const next = updated[0];
      if (next) selectNote(next);
      else { setSelectedId(null); setEditTitle(''); setEditContent(''); }
    }
  };

  const toggleSticky = (id: string) => {
    const updated = notes.map(n =>
      n.id === id ? { ...n, sticky: !n.sticky } : n
    );
    saveNotes(updated);
    const note = updated.find(n => n.id === id);
    toast.success(note?.sticky ? 'Pinned to desktop' : 'Removed from desktop');
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  // ── Toggle checkbox in content ──
  const toggleCheckbox = (charIndex: number) => {
    const before = editContent.slice(0, charIndex);
    const match = editContent.slice(charIndex).match(/^\[([ xX]?)\]/);
    if (!match) return;
    const isChecked = match[1] === 'x' || match[1] === 'X';
    const replacement = isChecked ? '[ ]' : '[x]';
    const after = editContent.slice(charIndex + match[0].length);
    setEditContent(before + replacement + after);
    setDirty(true);
  };

  // ── Open entity reference ──
  const openRef = async (prefix: string, number: string) => {
    const mapping = prefixMap.current[prefix];
    if (!mapping) return;
    const refNum = `${prefix}#${number}`;
    try {
      const { data } = await apiClient.get(mapping.endpoint, { params: { search: refNum, page_size: 1 } });
      const results = data?.results ?? data ?? [];
      const entity = results[0];
      if (entity) {
        openEntity(mapping.entityType, entity.id, entity, refNum);
      } else {
        toast.error(`${refNum} not found`);
      }
    } catch {
      toast.error(`Failed to look up ${refNum}`);
    }
  };

  // ── Render content with links and checkboxes ──
  const renderContent = (text: string): ReactNode[] => {
    if (!text) return [];
    const lines = text.split('\n');
    return lines.map((line, li) => {
      const parts: ReactNode[] = [];
      let lastIdx = 0;
      // Find all special tokens in the line
      const tokens: { idx: number; len: number; render: () => ReactNode }[] = [];

      // Entity references — match XX#NNNNN (2+ letters + # + 4-6 digits)
      const refRegex = /([A-Z]{2,4})#(\d{4,6})/g;
      let m: RegExpExecArray | null;
      while ((m = refRegex.exec(line)) !== null) {
        const prefix = m[1];
        const num = m[2];
        if (prefixMap.current[prefix]) {
          const startIdx = m.index;
          const matchText = m[0];
          tokens.push({
            idx: startIdx,
            len: matchText.length,
            render: () => (
              <button key={`ref-${li}-${startIdx}`} onClick={() => openRef(prefix, num)}
                className="text-blue-600 hover:text-blue-800 hover:underline font-medium cursor-pointer">
                {matchText}
              </button>
            ),
          });
        }
      }

      // Checkboxes
      CHECKBOX_REGEX.lastIndex = 0;
      // Calculate the character offset in the full content for this line
      let lineStartInContent = 0;
      for (let i = 0; i < li; i++) lineStartInContent += lines[i].length + 1;
      while ((m = CHECKBOX_REGEX.exec(line)) !== null) {
        const isChecked = m[1] === 'x' || m[1] === 'X';
        const startIdx = m.index;
        const contentCharIdx = lineStartInContent + startIdx;
        tokens.push({
          idx: startIdx,
          len: m[0].length,
          render: () => (
            <button key={`cb-${li}-${startIdx}`} onClick={() => toggleCheckbox(contentCharIdx)}
              className={`inline-flex items-center justify-center w-4 h-4 rounded border ${isChecked ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-400 bg-white hover:border-blue-400'} cursor-pointer align-text-bottom mr-0.5`}>
              {isChecked && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
            </button>
          ),
        });
      }

      // Sort tokens by position
      tokens.sort((a, b) => a.idx - b.idx);

      // Build line with tokens interspersed
      for (const token of tokens) {
        if (token.idx > lastIdx) {
          // Check if text after a checked checkbox should be struck through
          parts.push(<span key={`t-${li}-${lastIdx}`}>{line.slice(lastIdx, token.idx)}</span>);
        }
        parts.push(token.render());
        lastIdx = token.idx + token.len;
      }
      if (lastIdx < line.length) {
        parts.push(<span key={`t-${li}-${lastIdx}`}>{line.slice(lastIdx)}</span>);
      }
      if (parts.length === 0) parts.push(<span key={`empty-${li}`}>{'\u200B'}</span>); // zero-width space for empty lines

      // Check if line starts with a checked checkbox → strikethrough the rest
      const lineHasChecked = /^\[x\]/i.test(line.trimStart());
      return (
        <div key={li} className={lineHasChecked ? 'line-through text-gray-400' : ''}>
          {parts}
        </div>
      );
    });
  };

  const startEditing = () => {
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const stopEditing = () => {
    setEditing(false);
    if (dirty) autoSave();
  };

  const PLACEHOLDER_HINT = `Start writing...

Tips:
  [] Type [] for a checkbox, click to toggle
  SO#35001 Type XX#NNNNN to link entities (SO, PO, CI, VI, PL, etc.)`;

  return (
    <div className="flex h-full">
      {/* Note list sidebar */}
      <div className="w-56 shrink-0 border-r border-gray-200 flex flex-col">
        <div className="p-2 border-b border-gray-200">
          <button onClick={createNote}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-blue-700 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Note
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {notes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8 px-4">No notes yet. Create one to get started.</p>
          ) : (
            notes.map(n => {
              const c = getColor(n.color);
              return (
                <button key={n.id} onClick={() => selectNote(n)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-100 transition-colors ${selectedId === n.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />
                    <span className="text-sm font-medium text-gray-900 truncate flex-1">
                      {n.title || 'Untitled'}
                    </span>
                    {n.sticky && (
                      <svg className="h-3 w-3 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate ml-4.5">{n.content.replace(/\[[ xX]?\]/g, '').slice(0, 60) || 'Empty note'}</p>
                  <p className="text-[10px] text-gray-300 mt-0.5 ml-4.5">{timeAgo(n.updated_at)}</p>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Editor */}
      {selectedId ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Title */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200">
            <input
              value={editTitle}
              onChange={e => { setEditTitle(e.target.value); setDirty(true); }}
              placeholder="Note title..."
              className="flex-1 text-lg font-semibold text-gray-900 outline-none bg-transparent placeholder:text-gray-300"
            />
            {/* Color picker */}
            <div className="flex gap-1">
              {COLORS.map(c => (
                <button key={c.key} onClick={() => { setEditColor(c.key); setDirty(true); }}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${c.dot} ${editColor === c.key ? 'border-gray-600 scale-110' : 'border-transparent hover:border-gray-400'}`}
                  title={c.key} />
              ))}
            </div>
            {/* Sticky toggle */}
            <button onClick={() => toggleSticky(selectedId)} title={selected?.sticky ? 'Remove from desktop' : 'Pin to desktop'}
              className={`p-1 rounded transition-colors ${selected?.sticky ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 hover:text-amber-400'}`}>
              <svg className="h-4 w-4" fill={selected?.sticky ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
            </button>
            {/* Delete */}
            <button onClick={() => deleteNote(selectedId)} title="Delete note"
              className="p-1 rounded text-gray-300 hover:text-red-500 transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            </button>
          </div>
          {/* Content — toggle between textarea (edit) and rendered view */}
          {editing ? (
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={e => { setEditContent(e.target.value); setDirty(true); }}
              onBlur={stopEditing}
              placeholder={PLACEHOLDER_HINT}
              className="flex-1 p-4 text-sm text-gray-700 outline-none resize-none bg-transparent leading-relaxed placeholder:text-gray-300 font-mono"
            />
          ) : (
            <div
              onClick={startEditing}
              className="flex-1 p-4 text-sm text-gray-700 overflow-y-auto leading-relaxed cursor-text"
            >
              {editContent ? renderContent(editContent) : (
                <p className="text-gray-300 whitespace-pre-line">{PLACEHOLDER_HINT}</p>
              )}
            </div>
          )}
          {/* Bottom hint bar */}
          <div className="px-4 py-1.5 border-t border-gray-100 flex items-center gap-4 text-[10px] text-gray-400">
            <span>[] checkbox</span>
            <span>SO#35001 entity link</span>
            <span className="ml-auto">{editing ? 'Editing' : 'Click to edit'}</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <svg className="h-12 w-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
            <p className="text-sm">Select a note or create a new one</p>
          </div>
        </div>
      )}
    </div>
  );
}
