import { useState, useRef, useEffect, useCallback, isValidElement, cloneElement, createContext, useContext, type ReactNode, type ReactElement } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWindowManager } from './WindowManager';
import { navIcons } from '../shell-config/nav';
import { useShellPrefs } from './ShellPrefs';
import Modal from './Modal';
import { APP_VERSION } from '../version';
import changelog from '../changelog';
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
  const dragElRef = useRef<HTMLElement | null>(null);

  const startDrag = (type: 'item' | 'folder', idx: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const items = type === 'item' ? desktopItems : folders;
    const item = items[idx];
    const pos = type === 'item' ? getItemPos(item as DesktopItem, idx) : getFolderPos(item as DesktopFolder, idx);
    // origX = right offset, origY = top offset
    setDragging({ type, idx, startX: e.clientX, startY: e.clientY, origX: pos.right, origY: pos.top });
    dragElRef.current = (e.target as HTMLElement).closest('[data-desktop-icon]') as HTMLElement;
    e.preventDefault();
  };

  useEffect(() => {
    if (!dragging) return;
    const el = dragElRef.current;
    const move = (e: PointerEvent) => {
      // Moving right → decrease right offset; moving down → increase top offset
      const nr = dragging.origX - (e.clientX - dragging.startX);
      const nt = dragging.origY + e.clientY - dragging.startY;
      if (el) {
        el.style.right = `${nr}px`;
        el.style.top = `${nt}px`;
        el.style.left = 'auto';
        el.style.zIndex = '100';
        el.style.opacity = '0.7';
      }
    };
    const up = (e: PointerEvent) => {
      let finalRight = dragging.origX - (e.clientX - dragging.startX);
      let finalTop = Math.max(0, dragging.origY + e.clientY - dragging.startY);
      if (snapEnabled) { const s = snapToGrid(finalRight, finalTop); finalRight = s.x; finalTop = s.y; }
      finalRight = Math.max(0, finalRight);

      if (el) {
        el.style.zIndex = '';
        el.style.opacity = '';
      }

      if (dragging.type === 'item') {
        const droppedOnFolder = folders.find((f, fi) => {
          const fp = getFolderPos(f, fi);
          return Math.abs(finalRight - fp.right) < 40 && Math.abs(finalTop - fp.top) < 40;
        });
        const updated = [...favDocs];
        const desktopIdx = favDocs.indexOf(desktopItems[dragging.idx]);
        if (droppedOnFolder) {
          updated[desktopIdx] = { ...updated[desktopIdx], folderId: droppedOnFolder.id, x: undefined, y: undefined };
        } else {
          updated[desktopIdx] = { ...updated[desktopIdx], x: finalRight, y: finalTop, folderId: undefined };
          setLocalPositions(prev => ({ ...prev, [`item-${desktopIdx}`]: { right: finalRight, top: finalTop } }));
        }
        saveDocs(updated);
      } else {
        const updated = [...folders];
        updated[dragging.idx] = { ...updated[dragging.idx], x: finalRight, y: finalTop };
        setLocalPositions(prev => ({ ...prev, [`folder-${dragging.idx}`]: { right: finalRight, top: finalTop } }));
        saveFolders(updated);
      }
      setDragging(null);
      dragElRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [dragging, snapEnabled, favDocs, folders, desktopItems]);

  // Clear local position overrides when profile data updates
  const favDocsKey = JSON.stringify(favDocs.map(d => d.entityId));
  const foldersKey = JSON.stringify(folders.map(f => f.id));
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
    const x = contextMenu ? contextMenu.x - (rect?.left || 0) : 100;
    const y = contextMenu ? contextMenu.y - (rect?.top || 0) : 100;
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
      {/* Desktop items */}
      {desktopItems.map((doc, i) => {
        const docIdx = favDocs.indexOf(doc);
        const pos = localPositions[`item-${docIdx}`] || getItemPos(doc, i);
        const isSelected = selected.has(`item-${i}`);
        return (
          <div key={`item-${doc.entityType}-${doc.entityId}-${i}`} data-desktop-icon
            style={{ position: 'absolute', right: pos.right, top: pos.top, zIndex: 1 }}
            onPointerDown={e => { e.stopPropagation(); startDrag('item', i, e); }}
            onClick={e => { e.stopPropagation(); setSelected(new Set([`item-${i}`])); }}
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
        const itemCount = folderItems(folder.id).length;
        return (
          <div key={`folder-${folder.id}`} data-desktop-icon
            style={{ position: 'absolute', right: pos.right, top: pos.top, zIndex: 1 }}
            onPointerDown={e => { e.stopPropagation(); startDrag('folder', i, e); }}
            onClick={e => { e.stopPropagation(); setSelected(new Set([`folder-${i}`])); }}
            onContextMenu={e => handleFolderContextMenu(e, i)}
            onDoubleClick={e => { e.stopPropagation(); setOpenFolder(folder.id); }}
            className="cursor-default select-none"
          >
            <div className="flex flex-col items-center gap-1 w-20 p-2">
              <div className={`w-12 h-12 flex items-center justify-center ${isSelected ? 'rounded-lg bg-blue-400/30 ring-2 ring-blue-500' : ''}`}>
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
                <button onClick={e => { e.stopPropagation(); cycleStickyColor(note.id); }} title="Change color"
                  className="w-3 h-3 rounded-full bg-black/10 hover:bg-black/20 transition-colors" />
              </div>
              <div className="flex items-center gap-0.5">
                <button onClick={e => { e.stopPropagation(); toggleStickyOnTop(note.id); }} title={note.sticky_on_top ? 'Remove from top' : 'Always on top'}
                  className={`p-0.5 rounded transition-colors ${note.sticky_on_top ? 'text-blue-500' : 'text-black/20 hover:text-black/50'}`}>
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.914 5.046a5.25 5.25 0 01-1.414 0M15.75 9v6" /><path strokeLinecap="round" strokeLinejoin="round" d="M12.75 12l3 3 3-3" /></svg>
                </button>
                <button onClick={e => { e.stopPropagation(); removeStickyFromDesktop(note.id); }} title="Unpin from desktop"
                  className="p-0.5 rounded text-black/20 hover:text-black/50 transition-colors">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
                </button>
                <button onClick={e => { e.stopPropagation(); deleteStickyNote(note.id); }} title="Delete note"
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
        const items = folderItems(openFolder);
        return (
          <Modal open={true} onClose={() => setOpenFolder(null)} title={folder.name} size="lg">
            {items.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Folder is empty. Drag documents here.</p>
            ) : (
              <div className="flex flex-wrap gap-3 p-2">
                {items.map((item, i) => (
                  <div key={i} className="group relative flex flex-col items-center gap-1 w-20 p-2 rounded-lg hover:bg-gray-100 cursor-default"
                    onDoubleClick={() => openEntity(item.entityType, item.entityId, null, item.label)}
                  >
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        const updated = favDocs.map(d => d.entityType === item.entityType && d.entityId === item.entityId && d.folderId === openFolder ? { ...d, folderId: undefined } : d);
                        saveDocs(updated);
                      }}
                      title="Move to Desktop"
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 hover:text-red-600 shadow-sm z-10"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                    </button>
                    <div className={`w-12 h-12 rounded-lg bg-gray-50 shadow flex items-center justify-center text-xs font-bold ${ENTITY_ICON_COLORS[item.entityType] || 'text-gray-600'}`}>
                      {ENTITY_ICONS[item.entityType] || item.entityType.slice(0, 3).toUpperCase()}
                    </div>
                    <span className="text-[10px] text-gray-700 font-medium text-center leading-tight truncate w-full">{item.label}</span>
                  </div>
                ))}
              </div>
            )}
          </Modal>
        );
      })()}

      {/* About dialog */}
      {aboutOpen && (() => {
        const version = APP_VERSION;
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

      {/* Version watermark on desktop — clickable to open What's New */}
      {(prefs.show_desktop_version ?? true) && (
        <button
          onClick={(e) => { e.stopPropagation(); setWhatsNewOpen(true); }}
          className={`absolute bottom-3 text-[10px] text-white/50 font-mono select-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)] hover:text-white/80 transition-colors cursor-pointer ${
            prefs.taskbar_position === 'top' ? 'right-3' :
            prefs.taskbar_position === 'left' ? 'right-3' :
            prefs.taskbar_position === 'right' ? 'left-3' :
            'right-3 !bottom-16'
          }`}
        >
          {APP_VERSION}
        </button>
      )}

      {/* What's New dialog */}
      {whatsNewOpen && (
        <Modal open={true} onClose={() => setWhatsNewOpen(false)} title="What's New" size="md" bodyScroll={false}>
          <div className="space-y-5 max-h-[60vh] overflow-y-auto px-1">
            {changelog.map((entry, i) => (
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
                {i < changelog.length - 1 && <div className="border-b border-gray-200 mt-4" />}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
