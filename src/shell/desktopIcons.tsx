/**
 * Shared desktop-icon building blocks.
 *
 * Desktop.tsx renders the desktop surface; Files.tsx renders desktop shortcut
 * folders inside the Files app; MobileHome.tsx renders the mobile home grid.
 * All three import the icon tiles, entity-icon config and the desktop-folder
 * bridge from here so the surfaces never visually diverge — and so Desktop
 * and Files never import each other (that would be an import cycle).
 */
import { isValidElement, cloneElement, type ReactElement, type ReactNode } from 'react';
import { navIcons } from '../shell-config/nav';
import type { PreviewFileKind } from '../utils/openPreviewFile';

// ── Gradient tiles ──────────────────────────────────────────────────────────
// Per-app colored tile background, shared by the mobile home grid and the
// desktop "page" shortcuts. Tailwind's JIT scans the source so each gradient
// class string must appear in full somewhere — keep them inline.
export const ICON_GRADIENTS = [
  'from-blue-500 to-blue-700',
  'from-indigo-500 to-purple-600',
  'from-purple-500 to-pink-600',
  'from-pink-500 to-rose-600',
  'from-red-500 to-rose-600',
  'from-orange-500 to-red-600',
  'from-amber-500 to-orange-600',
  'from-yellow-500 to-amber-500',
  'from-lime-500 to-green-600',
  'from-green-500 to-emerald-600',
  'from-emerald-500 to-teal-600',
  'from-teal-500 to-cyan-600',
  'from-cyan-500 to-sky-600',
  'from-sky-500 to-blue-600',
  'from-violet-500 to-fuchsia-600',
];

export function hashGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
  return ICON_GRADIENTS[Math.abs(h) % ICON_GRADIENTS.length];
}

// ── Entity icon config ──────────────────────────────────────────────────────
export const ENTITY_ICON_COLORS: Record<string, string> = {
  order: 'text-blue-600', purchase_order: 'text-purple-600', invoice: 'text-green-600',
  client: 'text-indigo-600', manufacturer: 'text-orange-600', shipment: 'text-teal-600',
  part_number: 'text-gray-600', project: 'text-pink-600', mould: 'text-red-600',
  design: 'text-cyan-600', brand: 'text-amber-600', price_sheet: 'text-emerald-600',
  folder: 'text-yellow-600', page: 'text-blue-500',
};
export const ENTITY_ICONS: Record<string, string> = {
  order: 'SO', purchase_order: 'PO', invoice: 'INV', client: 'CLI',
  manufacturer: 'MFR', shipment: 'DN', part_number: 'PN', project: 'PRJ',
  mould: 'MLD', design: 'DSN', brand: 'BRD', price_sheet: 'PS',
  vendor_invoice: 'VI', vendor_payment: 'VP', warranty_claim: 'WC',
  qc_report: 'QC', vendor_shipment: 'GRN', bank_account: 'BA',
  wheel_finish: 'WF', weight_log: 'WL', production_progress: 'PP',
  vendor_price_sheet: 'VPS', proposal: 'PR', folder: 'FLD',
};

// Glyphs and colors for the auto-tracked preview shortcuts that live in the
// Documents folder. Keyed by `fileKind`, not `entityType`.
export const PREVIEW_FILE_CODES: Record<PreviewFileKind, string> = {
  pdf: 'PDF', dxf: 'DXF', '3d': 'STP', image: 'IMG', csv: 'CSV',
};
export const PREVIEW_FILE_COLORS: Record<PreviewFileKind, string> = {
  pdf: 'text-red-600', dxf: 'text-blue-600', '3d': 'text-purple-600',
  image: 'text-emerald-600', csv: 'text-green-600',
};

export interface DesktopItem {
  entityType: string;
  entityId: string;
  label: string;
  x?: number;
  y?: number;
  folderId?: string; // if inside a folder
  // Legacy free-form position inside the old folder window (pixels, relative
  // to the folder body). Folders now open in the Files app, which lists items
  // in a table — kept so previously-persisted shortcuts keep parsing.
  folderX?: number;
  folderY?: number;
  // Set for `entityType: 'preview-file'` shortcuts auto-recorded when the
  // user previews a file. `filePath` is the server-relative path passed
  // back into `openPreviewFile` on shortcut click.
  filePath?: string;
  fileKind?: PreviewFileKind;
}

/** Solid amber folder — the exact glyph the Files app uses for folders, so
 *  desktop folders and Files-app folders read as the same object. */
export function FolderGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M2.25 7.125A2.25 2.25 0 014.5 4.875h4.504c.61 0 1.193.243 1.624.673l1.494 1.494a.75.75 0 00.53.22h7.098A2.25 2.25 0 0122 9.51v8.366A2.25 2.25 0 0119.75 20.125H4.25A2.25 2.25 0 012 17.875V7.125z" />
    </svg>
  );
}

/** Page shortcuts reuse the consumer-registered nav icons; historically the
 *  label was tried first, then the route. */
function pageGlyph(entityId?: string, label?: string): ReactNode {
  return (label && navIcons[label]) || (entityId ? navIcons[entityId] : undefined);
}

const PAGE_FALLBACK_GLYPH = (
  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
  </svg>
);

// Shared 48×48 tile used by the desktop icon renderer (and anything else
// that needs a full-size shortcut tile), so all surfaces stay in sync.
export function FileIconTile({ entityType, isSelected, entityId, label, fileKind }: {
  entityType: string;
  isSelected: boolean;
  entityId?: string;
  label?: string;
  fileKind?: PreviewFileKind;
}) {
  const isPreviewFile = entityType === 'preview-file' && fileKind;
  const previewColor = isPreviewFile ? PREVIEW_FILE_COLORS[fileKind!] : null;
  const previewCode = isPreviewFile ? PREVIEW_FILE_CODES[fileKind!] : null;
  if (entityType === 'folder') {
    return (
      <div className={`w-12 h-12 flex items-center justify-center ${isSelected ? 'rounded-lg bg-blue-400/30 ring-2 ring-blue-500' : ''}`}>
        <FolderGlyph className="h-12 w-12 text-amber-500 drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)]" />
      </div>
    );
  }
  if (entityType === 'page') {
    // App shortcut — colored gradient tile with the white nav glyph, same
    // treatment as the mobile home grid (and the same hash seed, the route,
    // so an app keeps its color across surfaces).
    const icon = pageGlyph(entityId, label);
    const gradient = hashGradient(entityId || label || 'page');
    return (
      <div className={`w-12 h-12 flex items-center justify-center ${isSelected ? 'rounded-lg bg-blue-400/30 ring-2 ring-blue-500' : ''}`}>
        <span className={`h-11 w-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white border border-white/30 drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)]`}>
          {icon && isValidElement(icon)
            ? cloneElement(icon as ReactElement, { className: 'h-7 w-7 text-white' })
            : PAGE_FALLBACK_GLYPH}
        </span>
      </div>
    );
  }
  return (
    <div className={`w-12 h-12 relative flex items-center justify-center ${isSelected ? 'rounded-lg bg-blue-400/30 ring-2 ring-blue-500' : ''}`}>
      <svg className={`w-10 h-12 drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)] ${previewColor ?? ENTITY_ICON_COLORS[entityType] ?? 'text-gray-500'}`} viewBox="0 0 40 48" fill="none">
        <path d="M4 0h22l10 10v34a4 4 0 01-4 4H4a4 4 0 01-4-4V4a4 4 0 014-4z" fill="white" fillOpacity="0.92" />
        <path d="M26 0l10 10H30a4 4 0 01-4-4V0z" fill="currentColor" fillOpacity="0.2" />
        <path d="M4 0h22l10 10v34a4 4 0 01-4 4H4a4 4 0 01-4-4V4a4 4 0 014-4z" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.5" />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-bold pt-2 ${previewColor ?? ENTITY_ICON_COLORS[entityType] ?? 'text-gray-600'}`}>
        {previewCode ?? ENTITY_ICONS[entityType] ?? entityType.slice(0, 3).toUpperCase()}
      </span>
    </div>
  );
}

/** Compact row icon for desktop shortcuts listed inside the Files app. */
export function DesktopItemMiniIcon({ item }: { item: DesktopItem }) {
  if (item.entityType === 'folder') {
    return <FolderGlyph className="h-4 w-4 shrink-0 text-amber-500" />;
  }
  if (item.entityType === 'page') {
    const icon = pageGlyph(item.entityId, item.label);
    return (
      <span className={`h-4 w-4 rounded bg-gradient-to-br ${hashGradient(item.entityId || item.label || 'page')} flex items-center justify-center text-white shrink-0`}>
        {icon && isValidElement(icon)
          ? cloneElement(icon as ReactElement, { className: 'h-3 w-3 text-white' })
          : <span className="h-1.5 w-1.5 rounded-[2px] border border-white/80" />}
      </span>
    );
  }
  const color = (item.entityType === 'preview-file' && item.fileKind
    ? PREVIEW_FILE_COLORS[item.fileKind]
    : ENTITY_ICON_COLORS[item.entityType]) ?? 'text-gray-400';
  return (
    <svg className={`h-4 w-4 shrink-0 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

/** Short type tag shown in the Files-app listing of a desktop folder. */
export function desktopItemTypeLabel(item: DesktopItem): string {
  if (item.entityType === 'preview-file' && item.fileKind) return PREVIEW_FILE_CODES[item.fileKind];
  if (item.entityType === 'page') return 'App';
  if (item.entityType === 'folder') return 'Folder';
  return ENTITY_ICONS[item.entityType] ?? item.entityType.slice(0, 3).toUpperCase();
}

// ── Desktop-folder bridge ───────────────────────────────────────────────────
//
// Desktop folders are virtual — shortcut collections persisted in the user's
// prefs, not directories on the file server. The Files app shows them anyway
// (sidebar section + folder listing), so Desktop publishes its live folder
// state here and Files subscribes via useSyncExternalStore. Mutations route
// back through the callbacks so persistence stays in Desktop's host-aware
// save path.

export interface DesktopFoldersSnapshot {
  folders: { id: string; name: string; itemCount: number }[];
  itemsByFolder: Record<string, DesktopItem[]>;
  /** Clear `folderId` on these shortcuts — they reappear on the desktop. */
  moveToDesktop: (items: DesktopItem[]) => void;
  /** Delete these shortcuts entirely. */
  removeShortcuts: (items: DesktopItem[]) => void;
}

let desktopFoldersSnapshot: DesktopFoldersSnapshot | null = null;
const desktopFoldersListeners = new Set<() => void>();

export function publishDesktopFolders(next: DesktopFoldersSnapshot | null) {
  desktopFoldersSnapshot = next;
  desktopFoldersListeners.forEach(l => l());
}

export function subscribeDesktopFolders(listener: () => void): () => void {
  desktopFoldersListeners.add(listener);
  return () => { desktopFoldersListeners.delete(listener); };
}

export function getDesktopFoldersSnapshot(): DesktopFoldersSnapshot | null {
  return desktopFoldersSnapshot;
}

// ── Files-app view side channel ─────────────────────────────────────────────
//
// Used by the desktop Trash icon and desktop folders to open the Files app
// on a specific view. Two cases handled:
//  1) Files isn't open yet — the flag below is read once on first mount.
//  2) Files is already open — the event tells the live instance to flip view.
// The caller follows up with `openPage('/files')` either way.

export type FilesViewRequest = 'trash' | { view: 'desktop-folder'; folderId: string };

export const FILES_VIEW_FLAG = '__REACT_OS_SHELL_FILES_VIEW__';
export const FILES_SHOW_TRASH_EVENT = 'react-os-shell:files-show-trash';
export const FILES_OPEN_DESKTOP_FOLDER_EVENT = 'react-os-shell:files-open-desktop-folder';

export function requestFilesTrashView() {
  if (typeof window === 'undefined') return;
  (window as any)[FILES_VIEW_FLAG] = 'trash' satisfies FilesViewRequest;
  window.dispatchEvent(new CustomEvent(FILES_SHOW_TRASH_EVENT));
}

export function requestFilesDesktopFolderView(folderId: string) {
  if (typeof window === 'undefined') return;
  (window as any)[FILES_VIEW_FLAG] = { view: 'desktop-folder', folderId } satisfies FilesViewRequest;
  window.dispatchEvent(new CustomEvent(FILES_OPEN_DESKTOP_FOLDER_EVENT, { detail: { folderId } }));
}

/** Read the pending view request without clearing it. Side-effect free so
 *  it is safe inside a `useState` initializer (StrictMode double-invokes
 *  those; a read-and-clear there would hand the second invocation null). */
export function peekFilesViewRequest(): FilesViewRequest | null {
  if (typeof window === 'undefined') return null;
  const raw = (window as any)[FILES_VIEW_FLAG];
  if (raw === 'trash') return 'trash';
  if (raw && typeof raw === 'object' && raw.view === 'desktop-folder' && typeof raw.folderId === 'string') return raw;
  return null;
}

/** Read-and-clear the pending view request (Files calls this once mounted). */
export function consumeFilesViewRequest(): FilesViewRequest | null {
  const req = peekFilesViewRequest();
  if (typeof window !== 'undefined') (window as any)[FILES_VIEW_FLAG] = null;
  return req;
}
