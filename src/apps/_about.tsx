/**
 * Shared "About" dialog for the bundled apps.
 *
 * Each bundled app carries its own version (independent of the package
 * version) so app-level changes can be tracked without bumping every app at
 * once. `<AboutApp app="…" />` registers an "About <Name>" item in the
 * window title menu and renders the dialog: app icon, name, app version and
 * the react-os-shell attribution + shell version.
 *
 * Bump an app's version in `BUILTIN_APP_INFO` whenever that app's behaviour
 * changes, alongside the package-level CHANGELOG entry.
 */
import { useCallback, useState, isValidElement, cloneElement, type ReactElement } from 'react';
import Modal, { useWindowMenuItem } from '../shell/Modal';
import { navIcons } from '../shell-config/nav';
import { VERSION } from '../version';

export interface BuiltinAppInfo {
  /** Display name — matches the window-registry label. */
  name: string;
  /** App version, independent of the package version. */
  version: string;
  /** One-line summary shown in the About dialog. */
  description: string;
  /** Registry route — used to look up the consumer-registered nav icon. */
  route: string;
}

export const BUILTIN_APP_INFO = {
  spreadsheet: {
    name: 'Spreadsheets',
    version: '1.0.0',
    route: '/spreadsheet',
    description: 'Multi-sheet spreadsheet editor with CSV / TSV import and export.',
  },
  notepad: {
    name: 'Notepad',
    version: '1.0.0',
    route: '/notepad',
    description: 'Color-coded notes with checklists, desktop stickies and entity autolinking.',
  },
  documents: {
    name: 'Documents',
    version: '1.0.0',
    route: '/documents',
    description: 'Viewer and light editor for plain-text files and Word documents.',
  },
  preview: {
    name: 'Preview',
    version: '1.0.0',
    route: '/preview',
    description: 'Viewer for PDF documents, images, DXF drawings and 3D models.',
  },
  files: {
    name: 'Files',
    version: '1.0.0',
    route: '/files',
    description: 'Personal file manager with folders, uploads, quota and trash.',
  },
  browser: {
    name: 'Browser',
    version: '1.0.0',
    route: '/browser',
    description: 'Minimal web browser with bookmarks, history and navigation bar.',
  },
} satisfies Record<string, BuiltinAppInfo>;

export type BuiltinAppId = keyof typeof BUILTIN_APP_INFO;

const ABOUT_MENU_ICON = (
  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
  </svg>
);

// Generic window glyph shown when the consumer hasn't registered a nav icon
// for the app's route (same fallback shape as the Modal title bar).
const FALLBACK_APP_ICON = (
  <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75A2.25 2.25 0 016 4.5h12a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0118 19.5H6a2.25 2.25 0 01-2.25-2.25V6.75z M3.75 9h16.5" />
  </svg>
);

/** Registers "About <Name>" in the window title menu and renders the dialog.
 *  Render anywhere inside the app's window. */
export default function AboutApp({ app }: { app: BuiltinAppId }) {
  const info = BUILTIN_APP_INFO[app];
  const [open, setOpen] = useState(false);
  const openDialog = useCallback(() => setOpen(true), []);
  useWindowMenuItem(`About ${info.name}`, openDialog, ABOUT_MENU_ICON);

  if (!open) return null;

  const registered = navIcons[info.route];
  const appIcon = isValidElement(registered)
    ? cloneElement(registered as ReactElement, { className: 'h-9 w-9' } as any)
    : FALLBACK_APP_ICON;

  return (
    <Modal open onClose={() => setOpen(false)} title={`About ${info.name}`} size="sm" compact bodyScroll={false} autoHeight dimensions={[320, 320]}>
      <div className="flex flex-col items-center text-center px-5 pt-5 pb-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-gray-600 shrink-0">
          {appIcon}
        </div>
        <h2 className="mt-3 text-lg font-bold text-gray-900">{info.name}</h2>
        <p className="text-[11px] font-mono text-gray-400">Version {info.version}</p>
        <p className="mt-2 text-xs text-gray-500 leading-relaxed">{info.description}</p>
        <div className="mt-4 pt-3 border-t border-gray-200 w-full">
          <p className="text-[11px] text-gray-500">
            Part of the <span className="font-medium text-gray-700">react-os-shell</span> desktop environment
          </p>
          {VERSION && <p className="mt-0.5 text-[10px] font-mono text-gray-400">shell v{VERSION}</p>}
        </div>
      </div>
    </Modal>
  );
}
