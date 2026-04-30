import { useState, useRef, useEffect, useCallback, isValidElement, cloneElement, createContext, useContext, type ReactNode, type ReactElement } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWindowManager } from './WindowManager';
import { navIcons } from '../shell-config/nav';
import { useShellPrefs } from './ShellPrefs';
import Modal from './Modal';
import { APP_VERSION } from '../version';
import changelog, { type ChangelogEntry } from '../changelog';
import toast from './toast';
import { PopupMenu, PopupMenuItem, PopupMenuDivider } from './PopupMenu';
import { reportBug } from '../utils/reportBug';
import { useBugReport } from './BugReportDialog';
import { formatDate } from '../utils/date';

// ── Entity icon config ──
const ENTITY_ICON_COLORS: Record<string, string> = {
  order: 'text-blue-600', purchase_order: 'text-purple-600', invoice: 'text-green-600',
  client: 'text-indigo-600', manufacturer: 'text-orange-600', shipment: 'text-teal-600',
  part_number: 'text-gray-600', project: 'text-pink-600', mould: 'text-red-600',
  design: 'text-cyan-600', brand: 'text-amber-600', price_sheet: 'text-emerald-600',
  folder: 'text-yellow-600', page: 'text-blue-500',
};
const ENTITY_ICONS: Record<string, string> = {
  order: 'SO', purchase_order: 'PO', invoice: 'INV', client: 'CLI',
  manufacturer: 'MFR', shipment: 'DN', part_number: 'PN', project: 'PRJ',
  mould: 'MLD', design: 'DSN', brand: 'BRD', price_sheet: 'PS',
  vendor_invoice: 'VI', vendor_payment: 'VP', warranty_claim: 'WC',
  qc_report: 'QC', vendor_shipment: 'GRN', bank_account: 'BA',
  wheel_finish: 'WF', weight_log: 'WL', production_progress: 'PP',
  vendor_price_sheet: 'VPS', proposal: 'PR', folder: 'FLD',
};

interface DesktopItem {
  entityType: string;
  entityId: string;
  label: string;
  x?: number;
  y?: number;
  folderId?: string; // if inside a folder
}

interface DesktopFolder {
  id: string;
  name: string;
  x?: number;
  y?: number;
}

const GRID = 90; // snap grid size

function snapToGrid(x: number, y: number) {
  return { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID };
}

// ── Consumer-supplied desktop config ────────────────────────────────────────
//
// Desktop talks to two consumer-specific things:
//   1. A sticky-note ref resolver — turns `PREFIX#NUMBER` into an entity
//      window-registry key + id. Implementations look up numbering configs
//      and search the consumer's REST API.
//   2. Persistence callbacks — where to save the user's reordered shortcuts,
//      created folders, snap toggle, etc. The shell hands the new array; the
//      consumer commits it (server profile, localStorage, whatever).
//
// Both default to no-ops, so the desktop renders as a static surface when no
// provider is mounted.

export interface StickyEntityRef {
  /** Window-registry key used by `openEntity`. */
  entityType: string;
  entityId: string;
  /** Optional human-readable label (defaults to `${prefix}#${number}`). */
  label?: string;
  /** Optional pre-fetched entity payload passed to openEntity as snapshot. */
  snapshot?: unknown;
}

export type StickyResolver = (prefix: string, number: string) => Promise<StickyEntityRef | null>;

export interface DesktopHostConfig {
  /** Product name shown in the About dialog and desktop context menu. */
  productName?: string;
  /** Tagline shown under the product name in the About dialog. */
  productTagline?: string;
  /** Icon URL shown in the About dialog. Defaults to `/favicon.svg`. */
  productIcon?: string;
  /** Version string shown on the desktop watermark and About dialog. Falls
   *  back to the react-os-shell package version if omitted. */
  productVersion?: string;
  /** Changelog rendered in the "What's New" dialog. Hidden when omitted. */
  productChangelog?: ChangelogEntry[];
  /** Copyright line in the About dialog footer. Hidden when omitted. */
  productCopyright?: string;
  /** Website URL in the About dialog footer. Hidden when omitted. */
  productWebsite?: string;
  /** Wallpaper picker options for the Customization settings page. */
  wallpapers?: { src: string; label: string }[];
  /** Resolves sticky-note refs (e.g. "SO#27150") to window-registry coords. */
  stickyResolver?: StickyResolver;
  /** Persists the user's desktop shortcut list. */
  saveShortcuts?: (items: DesktopItem[]) => void | Promise<void>;
  /** Persists the user's folder list. */
  saveFolders?: (folders: DesktopFolder[]) => void | Promise<void>;
  /** Persists the snap-to-grid preference. */
  saveSnap?: (snap: boolean) => void | Promise<void>;
  /** Persists the user's notepad / sticky-note content. */
  saveNotes?: (notes: unknown[]) => void | Promise<void>;
}

const DesktopHostContext = createContext<DesktopHostConfig>({});

export function DesktopHostProvider({ value, children }: { value: DesktopHostConfig; children: ReactNode }) {
  return <DesktopHostContext.Provider value={value}>{children}</DesktopHostContext.Provider>;
}

export function useDesktopHost(): DesktopHostConfig {
  return useContext(DesktopHostContext);
}

interface FolderItemRef { entityType: string; entityId: string; label: string; folderId?: string; }

/** Folder content window — visually distinct from regular windows
 *  (manilla-paper background, folder glyph in title) and supports
 *  rubber-band selection, shift / cmd / ctrl multi-select, and
 *  drag-reorder inside the folder. */
function FolderWindow({ folder, items, onClose, onOpen, onMoveOut, onReorder }: {
  folder: { id: string; name: string };
  items: FolderItemRef[];
  onClose: () => void;
  onOpen: (item: FolderItemRef) => void;
  onMoveOut: (items: FolderItemRef[]) => void;
  onReorder: (nextItems: FolderItemRef[]) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rubber, setRubber] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const didDragRubber = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Drag-reorder state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const toggleSelect = (i: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      setSelected(prev => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next; });
    } else {
      setSelected(new Set([i]));
    }
  };

  // Rubber band on body
  const startRubber = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.target !== bodyRef.current) return;
    const r = bodyRef.current!.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    setRubber({ x1: x, y1: y, x2: x, y2: y });
    didDragRubber.current = false;
    setSelected(new Set());
  };

  useEffect(() => {
    if (!rubber) return;
    const move = (e: PointerEvent) => {
      const r = bodyRef.current?.getBoundingClientRect();
      if (!r) return;
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const dx = x - rubber.x1, dy = y - rubber.y1;
      if (dx * dx + dy * dy > 16) didDragRubber.current = true;
      setRubber(prev => prev ? { ...prev, x2: x, y2: y } : null);
    };
    const up = () => {
      const next = new Set<number>();
      const r = bodyRef.current;
      if (r && rubber) {
        const minX = Math.min(rubber.x1, rubber.x2);
        const maxX = Math.max(rubber.x1, rubber.x2);
        const minY = Math.min(rubber.y1, rubber.y2);
        const maxY = Math.max(rubber.y1, rubber.y2);
        const tiles = r.querySelectorAll<HTMLElement>('[data-folder-item]');
        const containerRect = r.getBoundingClientRect();
        tiles.forEach(t => {
          const tr = t.getBoundingClientRect();
          const tx = tr.left - containerRect.left;
          const ty = tr.top - containerRect.top;
          if (tx + tr.width > minX && tx < maxX && ty + tr.height > minY && ty < maxY) {
            const i = parseInt(t.getAttribute('data-folder-item') || '-1', 10);
            if (i >= 0) next.add(i);
          }
        });
      }
      if (didDragRubber.current) setSelected(next);
      setRubber(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [rubber]);

  // Drag reorder
  const onItemDragStart = (i: number) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i));
    setDragIdx(i);
  };
  const onItemDragOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== i) setDropIdx(i);
  };
  const onItemDrop = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDropIdx(null); return; }
    const next = [...items];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(i, 0, moved);
    onReorder(next);
    setDragIdx(null);
    setDropIdx(null);
  };

  const moveSelectedOut = () => {
    if (selected.size === 0) return;
    onMoveOut(Array.from(selected).map(i => items[i]).filter(Boolean));
    setSelected(new Set());
  };

  // Header icon = folder glyph
  const folderIcon = (
    <svg className="h-5 w-5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
      <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    </svg>
  );

  return (
    <Modal open onClose={onClose} title={folder.name} icon={folderIcon} size="lg">
      <div
        ref={bodyRef}
        onPointerDown={startRubber}
        onClick={() => {
          if (didDragRubber.current) { didDragRubber.current = false; return; }
          setSelected(new Set());
        }}
        className="relative h-full min-h-[300px] p-3 overflow-auto"
        style={{
          background: 'linear-gradient(135deg, rgba(254, 243, 199, 0.55) 0%, rgba(253, 230, 138, 0.4) 50%, rgba(252, 211, 77, 0.3) 100%)',
        }}
      >
        {selected.size > 0 && (
          <div className="sticky top-0 z-10 mb-2 flex items-center gap-2 px-2 py-1 rounded-md bg-white/80 backdrop-blur-sm shadow border border-gray-200 text-xs text-gray-700 w-fit">
            <span>{selected.size} selected</span>
            <button onClick={moveSelectedOut} className="px-2 py-0.5 rounded text-blue-600 hover:bg-blue-50">Move to desktop</button>
            <button onClick={() => setSelected(new Set())} className="px-2 py-0.5 rounded text-gray-500 hover:bg-gray-100">Clear</button>
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8 italic">Folder is empty. Drag documents here.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {items.map((item, i) => {
              const isSelected = selected.has(i);
              const isDropTarget = dropIdx === i && dragIdx !== i;
              return (
                <div
                  key={`${item.entityType}-${item.entityId}-${i}`}
                  data-folder-item={i}
                  draggable
                  onDragStart={onItemDragStart(i)}
                  onDragOver={onItemDragOver(i)}
                  onDrop={onItemDrop(i)}
                  onDragEnd={() => { setDragIdx(null); setDropIdx(null); }}
                  onClick={(e) => toggleSelect(i, e)}
                  onDoubleClick={() => onOpen(item)}
                  className={`group relative flex flex-col items-center gap-1 w-20 p-2 rounded-lg cursor-default transition-colors ${
                    isSelected ? 'bg-blue-200/60 ring-2 ring-blue-400' : 'hover:bg-white/60'
                  } ${isDropTarget ? 'ring-2 ring-blue-500 ring-dashed' : ''} ${dragIdx === i ? 'opacity-40' : ''}`}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); onMoveOut([item]); }}
                    title="Move to desktop"
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 hover:text-red-600 shadow-sm z-10"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                  </button>
                  <div className={`w-12 h-12 rounded-lg bg-white shadow flex items-center justify-center text-xs font-bold ${ENTITY_ICON_COLORS[item.entityType] || 'text-gray-600'}`}>
                    {ENTITY_ICONS[item.entityType] || item.entityType.slice(0, 3).toUpperCase()}
                  </div>
                  <span className={`text-[10px] font-medium text-center leading-tight truncate w-full ${isSelected ? 'text-blue-900' : 'text-gray-700'}`}>
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {rubber && (
          <div
            className="absolute border border-blue-500 bg-blue-500/10 pointer-events-none"
            style={{
              left: Math.min(rubber.x1, rubber.x2),
              top: Math.min(rubber.y1, rubber.y2),
              width: Math.abs(rubber.x2 - rubber.x1),
              height: Math.abs(rubber.y2 - rubber.y1),
            }}
          />
        )}
      </div>
    </Modal>
  );
}

export default function Desktop({ profile }: { profile: any }) {
  const queryClient = useQueryClient();
  const { openEntity, openPage } = useWindowManager();
  const bugReport = useBugReport();
  const containerRef = useRef<HTMLDivElement>(null);

  // Read desktop preferences from the consumer prefs adapter so they stay
  // in sync with what apps like Notepad write. Some legacy code paths
  // also expect them under profile.preferences — fall back to that for
  // consumers who haven't migrated.
  const { prefs: shellPrefs, save: saveShellPrefs } = useShellPrefs();
  const prefs = { ...(profile?.preferences || {}), ...shellPrefs };
  const favDocs: DesktopItem[] = prefs.favorite_documents || [];
  const folders: DesktopFolder[] = prefs.desktop_folders || [];
  const snapEnabled: boolean = prefs.desktop_snap ?? false;

  // Sticky notes from notepad
  interface StickyNote { id: string; title: string; content: string; color: string; sticky: boolean; sticky_x?: number; sticky_y?: number; sticky_w?: number; sticky_h?: number; sticky_on_top?: boolean; sticky_anchor?: 'left' | 'right'; updated_at: string; }
  const allNotes: StickyNote[] = prefs.notepad_notes || [];
  const stickyNotes = allNotes.filter(n => n.sticky);

  // ── Entity reference support for sticky notes ──
  // The PREFIX#NUMBER → entity lookup is consumer-supplied; the shell only
  // calls the resolver and hands the result to openEntity().
  const host = useDesktopHost();
  const openStickyRef = async (prefix: string, number: string) => {
    const refNum = `${prefix}#${number}`;
    if (!host.stickyResolver) { toast.error(`Unknown reference: ${refNum}`); return; }
    try {
      const result = await host.stickyResolver(prefix, number);
      if (result) openEntity(result.entityType, result.entityId, result.snapshot, result.label ?? refNum);
      else toast.error(`${refNum} not found`);
    } catch {
      toast.error(`Failed to open ${refNum}`);
    }
  };

  const toggleStickyCheckbox = (noteId: string, charIndex: number) => {
    const note = allNotes.find(n => n.id === noteId);
    if (!note) return;
    const content = note.content;
    const match = content.slice(charIndex).match(/^\[([ xX]?)\]/);
    if (!match) return;
    const isChecked = match[1] === 'x' || match[1] === 'X';
    const replacement = isChecked ? '[ ]' : '[x]';
    const updated = content.slice(0, charIndex) + replacement + content.slice(charIndex + match[0].length);
    saveNotes(allNotes.map(n => n.id === noteId ? { ...n, content: updated, updated_at: new Date().toISOString() } : n));
  };

  const renderStickyContent = (noteId: string, text: string): ReactNode[] => {
    if (!text) return [];
    const lines = text.split('\n');
    let charOffset = 0;
    return lines.map((line, li) => {
      const lineStart = charOffset;
      charOffset += line.length + 1;
      const tokens: { idx: number; len: number; render: () => ReactNode }[] = [];

      // Entity references — rendered as clickable when a resolver is configured;
      // if the resolver returns null at click-time the user sees a "not found" toast.
      const refRegex = /([A-Z]{2,4})#(\d{4,6})/g;
      let m: RegExpExecArray | null;
      while ((m = refRegex.exec(line)) !== null) {
        if (host.stickyResolver) {
          const prefix = m[1], num = m[2], startIdx = m.index, matchText = m[0];
          tokens.push({ idx: startIdx, len: matchText.length, render: () => (
            <button key={`r-${li}-${startIdx}`} onClick={e => { e.stopPropagation(); openStickyRef(prefix, num); }}
              className="text-blue-700 hover:underline font-medium cursor-pointer">{matchText}</button>
          )});
        }
      }

      // Checkboxes
      const cbRegex = /\[([ xX]?)\]/g;
      while ((m = cbRegex.exec(line)) !== null) {
        const isChecked = m[1] === 'x' || m[1] === 'X';
        const startIdx = m.index;
        const contentCharIdx = lineStart + startIdx;
        tokens.push({ idx: startIdx, len: m[0].length, render: () => (
          <button key={`c-${li}-${startIdx}`} onClick={e => { e.stopPropagation(); toggleStickyCheckbox(noteId, contentCharIdx); }}
            className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded border ${isChecked ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-500 bg-white/50 hover:border-blue-400'} cursor-pointer align-text-bottom mr-0.5`}>
            {isChecked && <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
          </button>
        )});
      }

      tokens.sort((a, b) => a.idx - b.idx);
      const parts: ReactNode[] = [];
      let lastIdx = 0;
      for (const t of tokens) {
        if (t.idx > lastIdx) parts.push(<span key={`t-${li}-${lastIdx}`}>{line.slice(lastIdx, t.idx)}</span>);
        parts.push(t.render());
        lastIdx = t.idx + t.len;
      }
      if (lastIdx < line.length) parts.push(<span key={`t-${li}-${lastIdx}`}>{line.slice(lastIdx)}</span>);
      if (parts.length === 0) parts.push(<span key={`e-${li}`}>{'\u200B'}</span>);

      const lineHasChecked = /^\[x\]/i.test(line.trimStart());
      return <div key={li} className={lineHasChecked ? 'line-through opacity-50' : ''}>{parts}</div>;
    });
  };

  // State
  const [dragging, setDragging] = useState<{ type: 'item' | 'folder'; idx: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemIdx?: number; folderIdx?: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rubberBand, setRubberBand] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingStickyId, setEditingStickyId] = useState<string | null>(null);
  const [stickyDrag, setStickyDrag] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [stickyResize, setStickyResize] = useState<{ id: string; startX: number; startY: number; origW: number; origH: number } | null>(null);
  // Index of the folder the user is currently hovering while dragging an
  // icon — drives the lift / glow animation and the on-drop fold-in.
  const [hoverFolderIdx, setHoverFolderIdx] = useState<number | null>(null);
  const hoverFolderIdxRef = useRef<number | null>(null);

  // Save helpers — delegate persistence to the consumer-supplied callbacks
  // when wired, otherwise write through the prefs adapter so backend-less
  // demos still survive a reload.
  const saveDocs = useCallback((docs: DesktopItem[]) => {
    if (host.saveShortcuts) host.saveShortcuts(docs);
    else saveShellPrefs({ favorite_documents: docs });
  }, [host, saveShellPrefs]);

  const saveFolders = useCallback((f: DesktopFolder[]) => {
    if (host.saveFolders) host.saveFolders(f);
    else saveShellPrefs({ desktop_folders: f });
  }, [host, saveShellPrefs]);

  const saveSnap = useCallback((v: boolean) => {
    if (host.saveSnap) host.saveSnap(v);
    else saveShellPrefs({ desktop_snap: v });
  }, [host, saveShellPrefs]);

  // Positions stored as { right, top } — distance from right/top edges
  // This keeps icons anchored to the top-right regardless of window size
  const getDefaultPos = (idx: number) => {
    const col = Math.floor(idx / 8);
    const row = idx % 8;
    return { right: 20 + col * GRID, top: 20 + row * GRID };
  };

  const getItemPos = (item: DesktopItem, idx: number) => {
    if (item.x != null && item.y != null) return { right: item.x, top: item.y };
    return getDefaultPos(idx);
  };

  const getFolderPos = (folder: DesktopFolder, idx: number) => {
    if (folder.x != null && folder.y != null) return { right: folder.x, top: folder.y };
    return getDefaultPos(favDocs.filter(d => !d.folderId).length + idx);
  };

  // Items not in any folder
  const desktopItems = favDocs.filter(d => !d.folderId);
  const folderItems = (folderId: string) => favDocs.filter(d => d.folderId === folderId);

  // ── Drag logic ──
  // Local position overrides — applied immediately on drop, before API responds
  const [localPositions, setLocalPositions] = useState<Record<string, { right: number; top: number }>>({});
  // When the drag starts on a selected icon, all selected icons move together.
  // dragEntriesRef holds one entry per moving icon: its element, type, index,
  // and origin position (relative to the desktop).
  type DragEntry = { key: string; type: 'item' | 'folder'; idx: number; origX: number; origY: number; el: HTMLElement | null };
  const dragEntriesRef = useRef<DragEntry[]>([]);

  const startDrag = (type: 'item' | 'folder', idx: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const primaryKey = `${type}-${idx}`;
    // If the icon being grabbed is in the current selection, every selected
    // icon comes along. Otherwise it's a single-icon drag and we replace
    // the selection with just this one.
    const draggingMulti = selected.has(primaryKey) && selected.size > 1;
    const keys = draggingMulti ? Array.from(selected) : [primaryKey];

    const entries: DragEntry[] = [];
    for (const key of keys) {
      if (key.startsWith('item-')) {
        const i = parseInt(key.slice(5), 10);
        const itm = desktopItems[i];
        if (!itm) continue;
        const pos = getItemPos(itm, i);
        const el = document.querySelector(`[data-desktop-icon="${key}"]`) as HTMLElement | null;
        entries.push({ key, type: 'item', idx: i, origX: pos.right, origY: pos.top, el });
      } else if (key.startsWith('folder-')) {
        const i = parseInt(key.slice(7), 10);
        const f = folders[i];
        if (!f) continue;
        const pos = getFolderPos(f, i);
        const el = document.querySelector(`[data-desktop-icon="${key}"]`) as HTMLElement | null;
        entries.push({ key, type: 'folder', idx: i, origX: pos.right, origY: pos.top, el });
      }
    }
    dragEntriesRef.current = entries;
    const primaryEntry = entries.find(e => e.key === primaryKey) ?? entries[0];
    if (!primaryEntry) return;
    setDragging({ type, idx, startX: e.clientX, startY: e.clientY, origX: primaryEntry.origX, origY: primaryEntry.origY });
    e.preventDefault();
  };

  useEffect(() => {
    if (!dragging) return;
    const entries = dragEntriesRef.current;
    // Single-icon drags can fold into a folder; track which folder the
    // cursor is currently hovering over so the folder element can react
    // (scale + glow) and so we can short-circuit the right-overlap test
    // on drop.
    const isSingleItemDrag = entries.length === 1 && entries[0].type === 'item';
    const move = (e: PointerEvent) => {
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      // Apply delta to every dragged icon.
      for (const entry of entries) {
        if (!entry.el) continue;
        // Moving right → decrease right offset; moving down → increase top offset
        entry.el.style.right = `${entry.origX - dx}px`;
        entry.el.style.top = `${entry.origY + dy}px`;
        entry.el.style.left = 'auto';
        entry.el.style.zIndex = '100';
        entry.el.style.opacity = '0.7';
      }
      // Detect hover-over-folder for drop-into-folder UX.
      if (isSingleItemDrag) {
        const elsBelow = document.elementsFromPoint(e.clientX, e.clientY);
        let nextHover: number | null = null;
        for (const el of elsBelow) {
          const fk = (el as HTMLElement).closest?.('[data-desktop-icon^="folder-"]');
          if (fk) {
            const key = (fk as HTMLElement).getAttribute('data-desktop-icon');
            if (key) nextHover = parseInt(key.slice(7), 10);
            break;
          }
        }
        hoverFolderIdxRef.current = nextHover;
        setHoverFolderIdx(prev => (prev === nextHover ? prev : nextHover));
      }
    };
    const up = (e: PointerEvent) => {
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      // Reset visual transform overrides on every dragged icon.
      for (const entry of entries) {
        if (!entry.el) continue;
        entry.el.style.zIndex = '';
        entry.el.style.opacity = '';
      }
      const liveHoverIdx = hoverFolderIdxRef.current;
      const hoveredFolder = liveHoverIdx != null ? folders[liveHoverIdx] : null;
      hoverFolderIdxRef.current = null;
      setHoverFolderIdx(null);

      // Compute final positions for each dragged entry.
      const computedPositions = entries.map(entry => {
        let finalRight = entry.origX - dx;
        let finalTop = Math.max(0, entry.origY + dy);
        if (snapEnabled) { const s = snapToGrid(finalRight, finalTop); finalRight = s.x; finalTop = s.y; }
        finalRight = Math.max(0, finalRight);
        return { entry, finalRight, finalTop };
      });

      // Persist items.
      const itemMoves = computedPositions.filter(p => p.entry.type === 'item');
      if (itemMoves.length > 0) {
        const updated = [...favDocs];
        const positionsPatch: Record<string, { right: number; top: number }> = {};
        // Single-item drag onto a folder still folds in (multi-drag never folds).
        const singleItem = itemMoves.length === 1 && entries.length === 1 ? itemMoves[0] : null;
        // Prefer the actively-hovered folder (live cursor hit-test) and fall
        // back to a position-overlap check for snap-to-grid edge cases.
        const droppedOnFolder = singleItem
          ? (hoveredFolder ?? folders.find((f, fi) => {
              const fp = getFolderPos(f, fi);
              return Math.abs(singleItem.finalRight - fp.right) < 40 && Math.abs(singleItem.finalTop - fp.top) < 40;
            }))
          : undefined;
        // Visual feedback: shrink the dragged icon into the folder before the
        // saved state actually removes it from the desktop.
        if (droppedOnFolder && singleItem?.entry.el) {
          const itemEl = singleItem.entry.el;
          const folderIdx = folders.indexOf(droppedOnFolder);
          const folderEl = document.querySelector(`[data-desktop-icon="folder-${folderIdx}"]`) as HTMLElement | null;
          if (folderEl) {
            const ir = itemEl.getBoundingClientRect();
            const fr = folderEl.getBoundingClientRect();
            const dx = (fr.left + fr.width / 2) - (ir.left + ir.width / 2);
            const dy = (fr.top + fr.height / 2) - (ir.top + ir.height / 2);
            itemEl.style.transition = 'transform 220ms ease-out, opacity 220ms ease-out';
            itemEl.style.transform = `translate(${dx}px, ${dy}px) scale(0.2)`;
            itemEl.style.opacity = '0';
          }
          folderEl?.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }],
            { duration: 280, easing: 'ease-out' },
          );
        }
        for (const move of itemMoves) {
          const desktopIdx = favDocs.indexOf(desktopItems[move.entry.idx]);
          if (desktopIdx === -1) continue;
          if (droppedOnFolder) {
            updated[desktopIdx] = { ...updated[desktopIdx], folderId: droppedOnFolder.id, x: undefined, y: undefined };
          } else {
            updated[desktopIdx] = { ...updated[desktopIdx], x: move.finalRight, y: move.finalTop, folderId: undefined };
            positionsPatch[`item-${desktopIdx}`] = { right: move.finalRight, top: move.finalTop };
          }
        }
        // Defer the state update so the fold-in animation has time to play.
        const commit = () => {
          saveDocs(updated);
          if (Object.keys(positionsPatch).length > 0) {
            setLocalPositions(prev => ({ ...prev, ...positionsPatch }));
          }
        };
        if (droppedOnFolder) setTimeout(commit, 220);
        else commit();
      }

      // Persist folders.
      const folderMoves = computedPositions.filter(p => p.entry.type === 'folder');
      if (folderMoves.length > 0) {
        const updated = [...folders];
        const positionsPatch: Record<string, { right: number; top: number }> = {};
        for (const move of folderMoves) {
          updated[move.entry.idx] = { ...updated[move.entry.idx], x: move.finalRight, y: move.finalTop };
          positionsPatch[`folder-${move.entry.idx}`] = { right: move.finalRight, top: move.finalTop };
        }
        saveFolders(updated);
        setLocalPositions(prev => ({ ...prev, ...positionsPatch }));
      }

      setDragging(null);
      dragEntriesRef.current = [];
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [dragging, snapEnabled, favDocs, folders, desktopItems]);

  // Clear local position overrides when profile data updates
  // Cache key has to include positions too — otherwise "Snap to Grid"
  // updates favDocs.x/y but the entityId list is unchanged, so the
  // localPositions overlay keeps the pre-snap values pinned in place.
  const favDocsKey = JSON.stringify(favDocs.map(d => `${d.entityId}:${d.x ?? ''}:${d.y ?? ''}:${d.folderId ?? ''}`));
  const foldersKey = JSON.stringify(folders.map(f => `${f.id}:${f.x ?? ''}:${f.y ?? ''}`));
  useEffect(() => { setLocalPositions({}); }, [favDocsKey, foldersKey]);

  // ── Rubber band selection ──
  const didRubberBandDragRef = useRef(false);
  const startRubberBand = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.target !== containerRef.current) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setRubberBand({ startX: x, startY: y, endX: x, endY: y });
    didRubberBandDragRef.current = false;
    setSelected(new Set());
  };

  useEffect(() => {
    if (!rubberBand) return;
    const move = (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // Mark as a real drag once the cursor has moved more than a tap.
      const dx = x - rubberBand.startX;
      const dy = y - rubberBand.startY;
      if (dx * dx + dy * dy > 16) didRubberBandDragRef.current = true;
      setRubberBand(prev => prev ? { ...prev, endX: x, endY: y } : null);
    };
    const up = () => {
      if (rubberBand) {
        const minX = Math.min(rubberBand.startX, rubberBand.endX);
        const maxX = Math.max(rubberBand.startX, rubberBand.endX);
        const minY = Math.min(rubberBand.startY, rubberBand.endY);
        const maxY = Math.max(rubberBand.startY, rubberBand.endY);
        const sel = new Set<string>();
        const cw = containerRef.current?.clientWidth || 800;
        desktopItems.forEach((item, i) => {
          const pos = getItemPos(item, i);
          const leftX = cw - pos.right - 80;
          if (leftX + 40 > minX && leftX < maxX && pos.top + 40 > minY && pos.top < maxY) {
            sel.add(`item-${i}`);
          }
        });
        folders.forEach((f, i) => {
          const pos = getFolderPos(f, i);
          const leftX = cw - pos.right - 80;
          if (leftX + 40 > minX && leftX < maxX && pos.top + 40 > minY && pos.top < maxY) {
            sel.add(`folder-${i}`);
          }
        });
        setSelected(sel);
      }
      setRubberBand(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [rubberBand]);

  // ── Context menu ──
  const handleDesktopContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleItemContextMenu = (e: React.MouseEvent, itemIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, itemIdx });
  };

  const handleFolderContextMenu = (e: React.MouseEvent, folderIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, folderIdx });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  const createFolder = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    // Icons render right-anchored (style.right = pos.right). Convert the
    // cursor's left-from-container into a right-from-container so the new
    // folder lands under the click instead of mirroring across the desktop.
    const containerW = rect?.width ?? 0;
    const cursorLeft = contextMenu ? contextMenu.x - (rect?.left ?? 0) : containerW - 100;
    const cursorTop = contextMenu ? contextMenu.y - (rect?.top ?? 0) : 100;
    const x = Math.max(0, containerW - cursorLeft - 40);
    const y = Math.max(0, cursorTop - 20);
    const id = `folder-${Date.now()}`;
    saveFolders([...folders, { id, name: 'New Folder', x, y }]);
    setContextMenu(null);
    setRenamingFolder(id);
    setRenameValue('New Folder');
  };

  const doSnapAll = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    const h = rect?.height || 600;
    const colCount = Math.max(1, Math.floor(h / GRID));
    let slot = 0;
    const getSlotPos = () => {
      const col = Math.floor(slot / colCount);
      const row = slot % colCount;
      slot++;
      return { right: 20 + col * GRID, top: 10 + row * GRID };
    };
    // Arrange folders first, then items
    const updatedF = folders.map(f => {
      const pos = getSlotPos();
      return { ...f, x: pos.right, y: pos.top };
    });
    saveFolders(updatedF);
    const updated = favDocs.map(d => {
      if (d.folderId) return d;
      const pos = getSlotPos();
      return { ...d, x: pos.right, y: pos.top };
    });
    saveDocs(updated);
    setContextMenu(null);
  };

  const removeItem = (idx: number) => {
    const desktopIdx = favDocs.indexOf(desktopItems[idx]);
    saveDocs(favDocs.filter((_, i) => i !== desktopIdx));
    setContextMenu(null);
  };

  const removeFolder = (idx: number) => {
    const folder = folders[idx];
    // Move folder items back to desktop
    const updated = favDocs.map(d => d.folderId === folder.id ? { ...d, folderId: undefined } : d);
    saveDocs(updated);
    saveFolders(folders.filter((_, i) => i !== idx));
    setContextMenu(null);
  };

  const renameFolder = (id: string, name: string) => {
    saveFolders(folders.map(f => f.id === id ? { ...f, name } : f));
    setRenamingFolder(null);
  };

  // ── Sticky notes ──
  // Persist through the consumer-supplied callback when one is wired,
  // otherwise fall back to the prefs adapter under `notepad_notes` so
  // Desktop drags survive a refresh and stay in sync with what Notepad
  // wrote.
  const saveNotes = useCallback((updated: StickyNote[]) => {
    if (host.saveNotes) host.saveNotes(updated);
    else saveShellPrefs({ notepad_notes: updated });
  }, [host, saveShellPrefs]);

  const createStickyNote = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    const x = contextMenu ? contextMenu.x - (rect?.left || 0) : 100;
    const y = contextMenu ? contextMenu.y - (rect?.top || 0) : 100;
    const n: StickyNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: '', content: '', color: 'yellow', sticky: true,
      sticky_x: x, sticky_y: y, updated_at: new Date().toISOString(),
    };
    saveNotes([n, ...allNotes]);
    setEditingStickyId(n.id);
    setContextMenu(null);
  };

  const updateStickyContent = (id: string, content: string) => {
    saveNotes(allNotes.map(n => n.id === id ? { ...n, content, updated_at: new Date().toISOString() } : n));
  };

  const removeStickyFromDesktop = (id: string) => {
    saveNotes(allNotes.map(n => n.id === id ? { ...n, sticky: false } : n));
  };

  const deleteStickyNote = (id: string) => {
    saveNotes(allNotes.filter(n => n.id !== id));
  };

  const cycleStickyColor = (id: string) => {
    const STICKY_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple', 'orange'];
    const note = allNotes.find(n => n.id === id);
    if (!note) return;
    const idx = STICKY_COLORS.indexOf(note.color);
    const next = STICKY_COLORS[(idx + 1) % STICKY_COLORS.length];
    saveNotes(allNotes.map(n => n.id === id ? { ...n, color: next } : n));
  };

  const toggleStickyOnTop = (id: string) => {
    saveNotes(allNotes.map(n => n.id === id ? { ...n, sticky_on_top: !n.sticky_on_top } : n));
  };

  // Sticky drag
  useEffect(() => {
    if (!stickyDrag) return;
    const move = (e: PointerEvent) => {
      const el = document.querySelector(`[data-sticky-id="${stickyDrag.id}"]`) as HTMLElement;
      if (el) {
        el.style.left = `${stickyDrag.origX + e.clientX - stickyDrag.startX}px`;
        el.style.right = 'auto';
        el.style.top = `${stickyDrag.origY + e.clientY - stickyDrag.startY}px`;
      }
    };
    const up = (e: PointerEvent) => {
      const finalX = stickyDrag.origX + e.clientX - stickyDrag.startX;
      const finalY = Math.max(0, stickyDrag.origY + e.clientY - stickyDrag.startY);
      const el = document.querySelector(`[data-sticky-id="${stickyDrag.id}"]`) as HTMLElement;
      const noteW = el?.offsetWidth ?? 192;
      const centerX = finalX + noteW / 2;
      const anchor: 'left' | 'right' = centerX > window.innerWidth / 2 ? 'right' : 'left';
      // Store x as left offset for left-anchored, or right offset for right-anchored
      const xVal = anchor === 'right' ? window.innerWidth - finalX - noteW : finalX;
      saveNotes(allNotes.map(n => n.id === stickyDrag.id ? { ...n, sticky_x: xVal, sticky_y: finalY, sticky_anchor: anchor } : n));
      // Clear inline styles so React takes over
      if (el) { el.style.left = ''; el.style.right = ''; }
      setStickyDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [stickyDrag, allNotes]);

  // Sticky resize
  useEffect(() => {
    if (!stickyResize) return;
    const move = (e: PointerEvent) => {
      const el = document.querySelector(`[data-sticky-id="${stickyResize.id}"]`) as HTMLElement;
      if (el) {
        el.style.width = `${Math.max(140, stickyResize.origW + e.clientX - stickyResize.startX)}px`;
        el.style.height = `${Math.max(100, stickyResize.origH + e.clientY - stickyResize.startY)}px`;
      }
    };
    const up = (e: PointerEvent) => {
      const finalW = Math.max(140, stickyResize.origW + e.clientX - stickyResize.startX);
      const finalH = Math.max(100, stickyResize.origH + e.clientY - stickyResize.startY);
      saveNotes(allNotes.map(n => n.id === stickyResize.id ? { ...n, sticky_w: finalW, sticky_h: finalH } : n));
      setStickyResize(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [stickyResize, allNotes]);

  const STICKY_BG: Record<string, string> = {
    yellow: 'bg-yellow-100 border-yellow-300', blue: 'bg-blue-100 border-blue-300',
    green: 'bg-green-100 border-green-300', pink: 'bg-pink-100 border-pink-300',
    purple: 'bg-purple-100 border-purple-300', orange: 'bg-orange-100 border-orange-300',
  };

  // ── Render icon ──
  const renderIcon = (entityType: string, label: string, isSelected: boolean, entityId?: string) => (
    <div className="flex flex-col items-center gap-1 w-20 p-2">
      {entityType === 'folder' ? (
        <div className={`w-12 h-12 flex items-center justify-center ${isSelected ? 'rounded-lg bg-blue-400/30 ring-2 ring-blue-500' : ''}`}>
          <svg className="h-12 w-12 drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)]" viewBox="0 0 48 48">
            <path d="M6 12a4 4 0 014-4h10l4 4h14a4 4 0 014 4v20a4 4 0 01-4 4H10a4 4 0 01-4-4V12z" fill="white" stroke="#eab308" strokeWidth="2" strokeLinejoin="round" />
            <path d="M6 18h36" stroke="#eab308" strokeWidth="1.5" />
          </svg>
        </div>
      ) : entityType === 'page' ? (
        <div className={`w-12 h-12 flex items-center justify-center ${isSelected ? 'rounded-lg bg-blue-400/30 ring-2 ring-blue-500' : ''}`}>
          {(() => {
            const icon = navIcons[label] || (entityId ? navIcons[entityId] : undefined);
            if (icon && isValidElement(icon)) {
              return cloneElement(icon as ReactElement, { className: 'h-10 w-10 text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.4)]' });
            }
            return <svg className="h-10 w-10 text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.4)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" /></svg>;
          })()}
        </div>
      ) : (
        <div className={`w-12 h-12 relative flex items-center justify-center ${isSelected ? 'rounded-lg bg-blue-400/30 ring-2 ring-blue-500' : ''}`}>
          <svg className={`w-10 h-12 drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)] ${ENTITY_ICON_COLORS[entityType] || 'text-gray-500'}`} viewBox="0 0 40 48" fill="none">
            <path d="M4 0h22l10 10v34a4 4 0 01-4 4H4a4 4 0 01-4-4V4a4 4 0 014-4z" fill="white" fillOpacity="0.92" />
            <path d="M26 0l10 10H30a4 4 0 01-4-4V0z" fill="currentColor" fillOpacity="0.2" />
            <path d="M4 0h22l10 10v34a4 4 0 01-4 4H4a4 4 0 01-4-4V4a4 4 0 014-4z" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.5" />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-bold pt-2 ${ENTITY_ICON_COLORS[entityType] || 'text-gray-600'}`}>
            {ENTITY_ICONS[entityType] || entityType.slice(0, 3).toUpperCase()}
          </span>
        </div>
      )}
      <span className={`text-[10px] font-medium text-center leading-tight w-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${isSelected ? 'text-blue-200 bg-blue-600/60 rounded px-1' : 'text-white'}`}>
        {label}
      </span>
    </div>
  );

  const menuStyle = (x: number, y: number): React.CSSProperties => ({
    ...(x + 180 > window.innerWidth ? { right: window.innerWidth - x } : { left: x }),
    ...(y + 250 > window.innerHeight ? { bottom: window.innerHeight - y } : { top: y }),
  });

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden"
      onPointerDown={startRubberBand}
      onContextMenu={handleDesktopContextMenu}
      onClick={() => {
        // Don't clear selection if the user just finished a rubber-band drag.
        if (didRubberBandDragRef.current) { didRubberBandDragRef.current = false; return; }
        setSelected(new Set());
        setContextMenu(null);
      }}
    >
      {/* Built-in Trash icon. Lives outside favDocs so it can't be
          deleted, renamed, or dropped into a folder, but the user can
          drag it around — its position persists to
          `prefs.desktop_trash_position`. Default position is the
          bottom-right corner, shifted in to clear the taskbar (the
          taskbar is `position: fixed` and overlays this container, so
          a naive `bottom: 20` would hide the icon under it). Double-
          click opens the Files app in trash view via the side-channel
          defined in Files.tsx. */}
      {(() => {
        const cs = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
        const tbH = parseInt(cs?.getPropertyValue('--taskbar-height') || '0') || 0;
        const tbW = parseInt(cs?.getPropertyValue('--taskbar-width') || '0') || 0;
        const tbPos = (cs?.getPropertyValue('--taskbar-position') || 'bottom').trim();
        const defaultRight = 20 + (tbPos === 'right' ? tbW : 0);
        const defaultBottom = 20 + (tbPos === 'bottom' ? tbH : 0);
        const trashPos = (prefs as any).desktop_trash_position as { right: number; bottom: number } | undefined;
        const right = trashPos?.right ?? defaultRight;
        const bottom = trashPos?.bottom ?? defaultBottom;

        const startTrashDrag = (e: React.PointerEvent) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          const el = e.currentTarget as HTMLElement;
          const startX = e.clientX, startY = e.clientY;
          let moved = false;
          const move = (ev: PointerEvent) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) moved = true;
            if (!moved) return;
            // Drag is from-bottom-right, so cursor moving right shrinks the
            // right offset, and moving down shrinks the bottom offset.
            el.style.right = `${right - dx}px`;
            el.style.bottom = `${bottom - dy}px`;
            el.style.opacity = '0.7';
            el.style.zIndex = '100';
          };
          const up = (ev: PointerEvent) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            el.style.opacity = '';
            el.style.zIndex = '';
            if (!moved) return;
            const newRight = Math.max(0, right - (ev.clientX - startX));
            const newBottom = Math.max(0, bottom - (ev.clientY - startY));
            saveShellPrefs({ desktop_trash_position: { right: newRight, bottom: newBottom } } as any);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        };

        return (
          <div
            data-desktop-icon="trash"
            style={{ position: 'absolute', right, bottom, zIndex: 1 }}
            onPointerDown={startTrashDrag}
            onClick={e => e.stopPropagation()}
            onContextMenu={e => e.preventDefault()}
            onDoubleClick={e => {
              e.stopPropagation();
              // Side-channel contract owned by src/apps/Files.tsx:
              // - global flag is read on mount when Files isn't open yet
              // - event tells an already-open Files instance to flip view
              (window as any).__REACT_OS_SHELL_FILES_VIEW__ = 'trash';
              window.dispatchEvent(new CustomEvent('react-os-shell:files-show-trash'));
              openPage('/files');
            }}
            className="cursor-default select-none"
            title="Trash — double-click to open, drag to move"
          >
        <div className="flex flex-col items-center gap-1 w-20 p-2">
          <div className="w-12 h-12 flex items-center justify-center">
            <svg className="h-12 w-12 drop-shadow-[0_2px_3px_rgba(0,0,0,0.4)]" viewBox="0 0 24 24">
              {/* Solid heroicons trash, filled with silver. Subtle darker
                  stroke gives it a metallic edge against light wallpapers. */}
              <path
                fill="#c0c4cc"
                stroke="#5f6677"
                strokeWidth="0.6"
                strokeLinejoin="round"
                fillRule="evenodd"
                clipRule="evenodd"
                d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 014.368 0c1.603.051 2.816 1.387 2.816 2.951zm-6.136-1.452a51.196 51.196 0 013.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 00-6 0v-.113c0-.794.609-1.428 1.364-1.452zm-.355 5.945a.75.75 0 10-1.5.058l.347 9a.75.75 0 101.499-.058l-.346-9zm5.48.058a.75.75 0 10-1.498-.058l-.347 9a.75.75 0 001.5.058l.346-9z"
              />
            </svg>
          </div>
          <span className="text-[10px] font-medium text-center leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            Trash
          </span>
        </div>
      </div>
        );
      })()}

      {/* Desktop items */}
      {desktopItems.map((doc, i) => {
        const docIdx = favDocs.indexOf(doc);
        const pos = localPositions[`item-${docIdx}`] || getItemPos(doc, i);
        const isSelected = selected.has(`item-${i}`);
        return (
          <div key={`item-${doc.entityType}-${doc.entityId}-${i}`} data-desktop-icon={`item-${i}`}
            style={{ position: 'absolute', right: pos.right, top: pos.top, zIndex: 1 }}
            onPointerDown={e => { e.stopPropagation(); startDrag('item', i, e); }}
            onClick={e => {
              e.stopPropagation();
              if (e.shiftKey || e.metaKey || e.ctrlKey) {
                setSelected(prev => { const next = new Set(prev); next.has(`item-${i}`) ? next.delete(`item-${i}`) : next.add(`item-${i}`); return next; });
              } else if (!selected.has(`item-${i}`)) {
                setSelected(new Set([`item-${i}`]));
              }
            }}
            onContextMenu={e => handleItemContextMenu(e, i)}
            onDoubleClick={e => { e.stopPropagation(); doc.entityType === 'page' ? openPage(doc.entityId) : openEntity(doc.entityType, doc.entityId, null, doc.label); }}
            className="cursor-default select-none"
          >
            {renderIcon(doc.entityType, doc.label, isSelected, doc.entityId)}
          </div>
        );
      })}

      {/* Folders */}
      {folders.map((folder, i) => {
        const pos = localPositions[`folder-${i}`] || getFolderPos(folder, i);
        const isSelected = selected.has(`folder-${i}`);
        const isHovered = hoverFolderIdx === i;
        const itemCount = folderItems(folder.id).length;
        return (
          <div key={`folder-${folder.id}`} data-desktop-icon={`folder-${i}`}
            style={{
              position: 'absolute', right: pos.right, top: pos.top, zIndex: 1,
              transform: isHovered ? 'scale(1.15)' : 'scale(1)',
              transition: 'transform 180ms ease-out',
            }}
            onPointerDown={e => { e.stopPropagation(); startDrag('folder', i, e); }}
            onClick={e => {
              e.stopPropagation();
              if (e.shiftKey || e.metaKey || e.ctrlKey) {
                setSelected(prev => { const next = new Set(prev); next.has(`folder-${i}`) ? next.delete(`folder-${i}`) : next.add(`folder-${i}`); return next; });
              } else if (!selected.has(`folder-${i}`)) {
                setSelected(new Set([`folder-${i}`]));
              }
            }}
            onContextMenu={e => handleFolderContextMenu(e, i)}
            onDoubleClick={e => { e.stopPropagation(); setOpenFolder(folder.id); }}
            className="cursor-default select-none"
          >
            <div className="flex flex-col items-center gap-1 w-20 p-2">
              <div className={`w-12 h-12 flex items-center justify-center ${isSelected ? 'rounded-lg bg-blue-400/30 ring-2 ring-blue-500' : ''} ${isHovered ? 'rounded-lg ring-4 ring-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.6)]' : ''}`}>
                <svg className="h-12 w-12 drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)]" viewBox="0 0 48 48">
            <path d="M6 12a4 4 0 014-4h10l4 4h14a4 4 0 014 4v20a4 4 0 01-4 4H10a4 4 0 01-4-4V12z" fill="white" stroke="#eab308" strokeWidth="2" strokeLinejoin="round" />
            <path d="M6 18h36" stroke="#eab308" strokeWidth="1.5" />
          </svg>
              </div>
              {renamingFolder === folder.id ? (
                <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => renameFolder(folder.id, renameValue)}
                  onKeyDown={e => { if (e.key === 'Enter') renameFolder(folder.id, renameValue); if (e.key === 'Escape') setRenamingFolder(null); }}
                  className="text-[10px] w-full text-center bg-white/80 rounded px-1 outline-none"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className={`text-[10px] font-medium text-center leading-tight w-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${isSelected ? 'text-blue-200 bg-blue-600/60 rounded px-1' : 'text-white'}`}>
                  {folder.name}{itemCount > 0 ? ` (${itemCount})` : ''}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Sticky notes */}
      {stickyNotes.map(note => {
        const xVal = note.sticky_x ?? 100;
        const y = note.sticky_y ?? 100;
        const w = note.sticky_w ?? 192;
        const h = note.sticky_h ?? 148;
        const anchor = note.sticky_anchor || 'left';
        const bg = STICKY_BG[note.color] || STICKY_BG.yellow;
        const isEditing = editingStickyId === note.id;
        return (
          <div key={`sticky-${note.id}`} data-sticky-id={note.id}
            style={{ position: 'absolute', ...(anchor === 'right' ? { right: xVal } : { left: xVal }), top: y, width: w, height: h, zIndex: note.sticky_on_top ? 200 : isEditing ? 50 : 10 }}
            onClick={e => e.stopPropagation()}
            className={`rounded-lg shadow-lg border ${bg} select-none flex flex-col`}
          >
            {/* Header — drag handle */}
            <div className="flex items-center justify-between px-2 py-1 cursor-move border-b border-black/5"
              onPointerDown={e => {
                if (e.button !== 0) return;
                e.preventDefault(); e.stopPropagation();
                // Always drag using left position; convert right-anchored to left
                const el = (e.target as HTMLElement).closest('[data-sticky-id]') as HTMLElement;
                const actualLeft = el ? el.getBoundingClientRect().left - (containerRef.current?.getBoundingClientRect().left ?? 0) : (anchor === 'right' ? window.innerWidth - xVal - w : xVal);
                setStickyDrag({ id: note.id, startX: e.clientX, startY: e.clientY, origX: actualLeft, origY: y });
              }}>
              <div className="flex items-center gap-1">
                <button
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); cycleStickyColor(note.id); }}
                  title="Change color"
                  className="w-3 h-3 rounded-full bg-black/10 hover:bg-black/20 transition-colors" />
              </div>
              <div className="flex items-center gap-0.5">
                <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); toggleStickyOnTop(note.id); }} title={note.sticky_on_top ? 'Remove from top' : 'Always on top'}
                  className={`p-0.5 rounded transition-colors ${note.sticky_on_top ? 'text-blue-500' : 'text-black/20 hover:text-black/50'}`}>
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.914 5.046a5.25 5.25 0 01-1.414 0M15.75 9v6" /><path strokeLinecap="round" strokeLinejoin="round" d="M12.75 12l3 3 3-3" /></svg>
                </button>
                <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); removeStickyFromDesktop(note.id); }} title="Unpin from desktop"
                  className="p-0.5 rounded text-black/20 hover:text-black/50 transition-colors">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
                </button>
                <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); deleteStickyNote(note.id); }} title="Delete note"
                  className="p-0.5 rounded text-black/20 hover:text-red-500 transition-colors">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            {/* Content */}
            {isEditing ? (
              <textarea
                autoFocus
                defaultValue={note.content}
                onBlur={e => { updateStickyContent(note.id, e.target.value); setEditingStickyId(null); }}
                onKeyDown={e => { if (e.key === 'Escape') { updateStickyContent(note.id, (e.target as HTMLTextAreaElement).value); setEditingStickyId(null); } }}
                className="flex-1 w-full p-2 text-xs leading-relaxed bg-transparent outline-none resize-none placeholder:text-black/30"
                placeholder="Write something..."
              />
            ) : (
              <div className="flex-1 p-2 cursor-text overflow-hidden" onDoubleClick={e => { e.stopPropagation(); setEditingStickyId(note.id); }}>
                <div className="text-xs leading-relaxed text-black/70">
                  {note.content ? renderStickyContent(note.id, note.content) : <span className="text-black/30 italic">Double-click to edit...</span>}
                </div>
              </div>
            )}
            {/* Resize handle */}
            <div className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
              onPointerDown={e => {
                if (e.button !== 0) return;
                e.preventDefault(); e.stopPropagation();
                const el = (e.target as HTMLElement).closest('[data-sticky-id]') as HTMLElement;
                setStickyResize({ id: note.id, startX: e.clientX, startY: e.clientY, origW: el?.offsetWidth ?? w, origH: el?.offsetHeight ?? h });
              }}>
              <svg className="w-3 h-3 text-black/15 absolute bottom-0.5 right-0.5" viewBox="0 0 12 12" fill="currentColor">
                <circle cx="10" cy="10" r="1.5" /><circle cx="6" cy="10" r="1.5" /><circle cx="10" cy="6" r="1.5" />
              </svg>
            </div>
          </div>
        );
      })}

      {/* Rubber band selection */}
      {rubberBand && (
        <div className="absolute border border-blue-400 bg-blue-400/10 pointer-events-none" style={{
          left: Math.min(rubberBand.startX, rubberBand.endX),
          top: Math.min(rubberBand.startY, rubberBand.endY),
          width: Math.abs(rubberBand.endX - rubberBand.startX),
          height: Math.abs(rubberBand.endY - rubberBand.startY),
        }} />
      )}

      {/* Context menu — desktop */}
      {contextMenu && contextMenu.itemIdx == null && contextMenu.folderIdx == null && (
        <PopupMenu style={menuStyle(contextMenu.x, contextMenu.y)}>
          <PopupMenuItem onClick={createStickyNote}>
            <svg className="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 24 24"><path d="M4 4a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" opacity="0.8" /><path d="M14 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            New Sticky Note
          </PopupMenuItem>
          <PopupMenuItem onClick={createFolder}>
            <svg className="h-4 w-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>
            Create Folder
          </PopupMenuItem>
          <PopupMenuItem onClick={doSnapAll}>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
            Snap to Grid
          </PopupMenuItem>
          <PopupMenuDivider />
          <PopupMenuItem onClick={() => { setContextMenu(null); openPage('/settings/customization'); }}>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" /></svg>
            Customization
          </PopupMenuItem>
          <PopupMenuItem onClick={() => { setContextMenu(null); openPage('/settings/favorites'); }}>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
            Favorites
          </PopupMenuItem>
          <PopupMenuItem onClick={() => { setContextMenu(null); setAboutOpen(true); }}>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
            About {host.productName ?? 'this app'}
          </PopupMenuItem>
          {bugReport && <>
            <PopupMenuDivider />
            <PopupMenuItem onClick={() => { setContextMenu(null); reportBug(bugReport.submit); }}>
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
              Report Bug
            </PopupMenuItem>
          </>}
        </PopupMenu>
      )}

      {/* Context menu — item */}
      {contextMenu && contextMenu.itemIdx != null && (
        <PopupMenu style={menuStyle(contextMenu.x, contextMenu.y)} minWidth={160}>
          <PopupMenuItem onClick={() => { const d = desktopItems[contextMenu.itemIdx!]; d.entityType === 'page' ? openPage(d.entityId) : openEntity(d.entityType, d.entityId, null, d.label); setContextMenu(null); }}>
            Open
          </PopupMenuItem>
          <PopupMenuDivider />
          <PopupMenuItem danger onClick={() => removeItem(contextMenu.itemIdx!)}>
            Remove Shortcut
          </PopupMenuItem>
        </PopupMenu>
      )}

      {/* Context menu — folder */}
      {contextMenu && contextMenu.folderIdx != null && (
        <PopupMenu style={menuStyle(contextMenu.x, contextMenu.y)} minWidth={160}>
          <PopupMenuItem onClick={() => { setOpenFolder(folders[contextMenu.folderIdx!].id); setContextMenu(null); }}>
            Open
          </PopupMenuItem>
          <PopupMenuItem onClick={() => { setRenamingFolder(folders[contextMenu.folderIdx!].id); setRenameValue(folders[contextMenu.folderIdx!].name); setContextMenu(null); }}>
            Rename
          </PopupMenuItem>
          <PopupMenuDivider />
          <PopupMenuItem danger onClick={() => removeFolder(contextMenu.folderIdx!)}>
            Delete Folder
          </PopupMenuItem>
        </PopupMenu>
      )}

      {/* Folder window */}
      {openFolder && (() => {
        const folder = folders.find(f => f.id === openFolder);
        if (!folder) return null;
        return (
          <FolderWindow
            folder={folder}
            items={folderItems(openFolder)}
            onClose={() => setOpenFolder(null)}
            onOpen={(item) => openEntity(item.entityType, item.entityId, null, item.label)}
            onMoveOut={(toMove) => {
              const ids = new Set(toMove.map(t => `${t.entityType}|${t.entityId}`));
              const updated = favDocs.map(d =>
                d.folderId === openFolder && ids.has(`${d.entityType}|${d.entityId}`)
                  ? { ...d, folderId: undefined }
                  : d,
              );
              saveDocs(updated);
            }}
            onReorder={(nextItems) => {
              // Replace the slice of favDocs that lives in this folder with the
              // re-ordered nextItems, keeping out-of-folder items in place.
              const others = favDocs.filter(d => d.folderId !== openFolder);
              saveDocs([...others, ...nextItems]);
            }}
          />
        );
      })()}

      {/* About dialog */}
      {aboutOpen && (() => {
        const version = host.productVersion ?? APP_VERSION;
        const showVersion: boolean = prefs.show_desktop_version ?? true;
        return (
        <Modal open={true} onClose={() => setAboutOpen(false)} title={`About ${host.productName ?? 'this app'}`} size="sm" bodyScroll={false} compact dimensions={[340, 420]}>
          <div className="flex flex-col items-center">
            {/* Logo & Title */}
            <div className="flex flex-col items-center gap-2 pt-4 pb-3 w-full">
              <img src={host.productIcon ?? '/favicon.svg'} alt="" className="h-16 w-16" />
              <div className="text-center">
                <h2 className="text-lg font-bold text-gray-900 tracking-wide">{host.productName ?? 'react-os-shell'}</h2>
                {host.productTagline && <p className="text-xs text-gray-500">{host.productTagline}</p>}
                <p className="text-[11px] text-gray-400 mt-1 font-mono">{version}</p>
              </div>
            </div>

            {/* Open Source Licenses */}
            <div className="py-3 border-t border-gray-200 w-full px-4">
              <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 text-center">Open Source Licenses</h3>
              <div className="max-h-40 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead><tr className="text-gray-500 border-b border-gray-100"><th className="text-left py-1 font-medium">Package</th><th className="text-left py-1 font-medium">License</th></tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {[
                      ['React', 'MIT', 'facebook/react'],
                      ['React DOM', 'MIT', 'facebook/react'],
                      ['React Router', 'MIT', 'remix-run/react-router'],
                      ['TanStack Query', 'MIT', 'TanStack/query'],
                      ['TanStack Table', 'MIT', 'TanStack/table'],
                      ['React Hook Form', 'MIT', 'react-hook-form'],
                      ['Axios', 'MIT', 'axios/axios'],
                      ['Tailwind CSS', 'MIT', 'tailwindlabs/tailwindcss'],
                      ['Headless UI', 'MIT', 'tailwindlabs/headlessui'],
                      ['Heroicons', 'MIT', 'tailwindlabs/heroicons'],
                      ['Recharts', 'MIT', 'recharts/recharts'],
                      ['Zod', 'MIT', 'colinhacks/zod'],
                      ['Vite', 'MIT', 'vitejs/vite'],
                      ['TypeScript', 'Apache-2.0', 'microsoft/TypeScript'],
                      ['jSpreadsheet CE', 'MIT', 'jspreadsheet/ce'],
                      ['Django', 'BSD-3', 'django/django'],
                      ['Django REST Framework', 'BSD-3', 'encode/django-rest-framework'],
                      ['PostgreSQL', 'PostgreSQL', 'postgres/postgres'],
                      ['Gunicorn', 'MIT', 'benoitc/gunicorn'],
                    ].map(([name, license, repo]) => (
                      <tr key={name} className="text-gray-600">
                        <td className="py-1"><a href={`https://github.com/${repo}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{name}</a></td>
                        <td className="py-1 text-gray-400">{license}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Copyright — bottom (consumer-configurable; hidden when neither field is supplied) */}
            {(host.productCopyright || host.productWebsite) && (
              <div className="pt-3 pb-2 border-t border-gray-200 w-full text-center">
                {host.productCopyright && <p className="text-[10px] text-gray-400">{host.productCopyright}</p>}
                {host.productWebsite && (
                  <a href={host.productWebsite} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline">
                    {host.productWebsite.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>
            )}
          </div>
        </Modal>
        );
      })()}

      {/* Version watermark on desktop — opt-in only. Hidden by default so
          consumer apps don't end up with two version labels (the bundled
          one and their own). Set prefs.show_desktop_version = true and
          provide host.productVersion to surface it. */}
      {prefs.show_desktop_version === true && (host.productVersion ?? APP_VERSION) && (
        <button
          onClick={(e) => { e.stopPropagation(); setWhatsNewOpen(true); }}
          className={`absolute bottom-3 text-[10px] text-white/50 font-mono select-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)] hover:text-white/80 transition-colors cursor-pointer ${
            prefs.taskbar_position === 'top' ? 'right-3' :
            prefs.taskbar_position === 'left' ? 'right-3' :
            prefs.taskbar_position === 'right' ? 'left-3' :
            'right-3 !bottom-16'
          }`}
        >
          {host.productVersion ?? APP_VERSION}
        </button>
      )}

      {/* What's New dialog */}
      {whatsNewOpen && (() => {
        const entries = host.productChangelog ?? changelog;
        return (
        <Modal open={true} onClose={() => setWhatsNewOpen(false)} title="What's New" size="md" bodyScroll={false}>
          <div className="space-y-5 max-h-[60vh] overflow-y-auto px-1">
            {entries.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No changelog available.</p>
            ) : entries.map((entry, i) => (
              <div key={entry.version}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-bold text-gray-900 font-mono">{entry.version}</span>
                  <span className="text-xs text-gray-400">{formatDate(entry.date)}</span>
                </div>
                <ul className="space-y-1.5 ml-1">
                  {entry.changes.map((change, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="text-blue-500 mt-1 shrink-0">&#8226;</span>
                      {change}
                    </li>
                  ))}
                </ul>
                {i < entries.length - 1 && <div className="border-b border-gray-200 mt-4" />}
              </div>
            ))}
          </div>
        </Modal>
        );
      })()}
    </div>
  );
}
